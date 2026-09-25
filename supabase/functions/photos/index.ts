// صور التوثيق: بتنحفظ كملفات بـ Storage (مجاني ١ جيجا) بدل ما تنحفظ نص base64 جوّا قاعدة البيانات.
// قاعدة البيانات بتحفظ بس رابط الصورة ومسارها.
//   POST {action:"upload", date, branch, photo:{id, dataUrl, ...}} → بترفع الصورة وبتسجّلها باليوم
//   POST {action:"delete", date, branch, id}                        → بتشيلها من اليوم ومن التخزين
//   POST {action:"migrate"}  (المالك بس)                           → بتنقل الصور القديمة من base64 لملفات
// كل طلب لازم يكون معه x-session-token صالح (نفس جلسة الموقع).
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "photos";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Photo = Record<string, unknown> & { id?: string; dataUrl?: string; url?: string; path?: string; sessionId?: string; checkpointId?: string };

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; type: string; ext: string } | null {
  const m = /^data:(image\/(jpeg|webp|png));base64,(.+)$/s.exec(dataUrl || "");
  if (!m) return null;
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type: m[1], ext: m[2] === "jpeg" ? "jpg" : m[2] };
}

async function upload(date: string, dataUrl: string) {
  const f = decodeDataUrl(dataUrl);
  if (!f) throw new Error("صيغة الصورة مش مدعومة");
  const path = `${/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "undated"}/${crypto.randomUUID()}.${f.ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, f.bytes, { contentType: f.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error("فشل رفع الصورة: " + error.message);
  return { path, url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

// نفس صلاحيات الموقع: منادي دوال قاعدة البيانات بجلسة الموظف نفسه
async function rpcAsUser(token: string, name: string, body: unknown) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", "x-session-token": token },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) { let msg = text; try { msg = JSON.parse(text).message || text; } catch { /* نص */ } throw new Error(msg); }
  return text ? JSON.parse(text) : null;
}

async function dayPhotos(date: string, branch: string): Promise<Photo[]> {
  const { data } = await admin.from("day_meta").select("sales_report_link").eq("date", date).eq("branch", branch).maybeSingle();
  const raw = data?.sales_report_link || "";
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : (v && Array.isArray(v.photos) ? v.photos : []);
  } catch { return []; }
}

async function removeFiles(paths: (string | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await admin.storage.from(BUCKET).remove(list);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const token = req.headers.get("x-session-token") || "";
  const { data: sess } = await admin.from("sessions")
    .select("employee_id, expires_at, employees!inner(role, active)")
    .eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const emp = (sess as any)?.employees;
  if (!sess || !emp?.active) return json({ error: "لازم تسجل دخول" }, 401);

  let body: { action?: string; date?: string; branch?: string; id?: string; photo?: Photo } = {};
  try { body = await req.json(); } catch { return json({ error: "طلب غلط" }, 400); }

  try {
    if (body.action === "upload") {
      const { date, branch } = body;
      const photo = { ...(body.photo || {}) } as Photo;
      if (!date || !branch || !photo.id) return json({ error: "ناقص التاريخ أو الفرع" }, 400);
      if (!photo.url) {
        const up = await upload(date, String(photo.dataUrl || ""));
        photo.url = up.url; photo.path = up.path;
      }
      delete photo.dataUrl;
      const before = await dayPhotos(date, branch);
      try {
        await rpcAsUser(token, "upsert_inspection_photo", { p_date: date, p_branch: branch, p_photo: photo });
      } catch (e) {
        if (body.photo && !body.photo.url) await removeFiles([photo.path]);
        throw e;
      }
      // صورة انعادت لنفس النقطة: الملف القديم ما عاد إله لزوم
      const replaced = before.filter((p) => p.path && p.path !== photo.path && (p.id === photo.id ||
        (photo.sessionId && p.sessionId === photo.sessionId && p.checkpointId === photo.checkpointId)));
      await removeFiles(replaced.map((p) => p.path));
      return json({ photo });
    }

    if (body.action === "delete") {
      const { date, branch, id } = body;
      if (!date || !branch || !id) return json({ error: "ناقص" }, 400);
      const target = (await dayPhotos(date, branch)).find((p) => String(p.id) === String(id));
      const rest = await rpcAsUser(token, "delete_inspection_photo", { p_date: date, p_branch: branch, p_id: String(id) });
      await removeFiles([target?.path]);
      return json({ photos: rest || [] });
    }

    if (body.action === "migrate") {
      if (emp.role !== "owner") return json({ error: "للمالك بس" }, 403);
      const { data: rows } = await admin.from("day_meta").select("date, branch, sales_report_link").like("sales_report_link", "%data:image%");
      let moved = 0;
      for (const r of rows || []) {
        let arr: Photo[] = [];
        try { const v = JSON.parse(r.sales_report_link); arr = Array.isArray(v) ? v : (v?.photos || []); } catch { continue; }
        const out: Photo[] = [];
        for (const p of arr) {
          if (p.dataUrl && !p.url) {
            try { const up = await upload(r.date, p.dataUrl); const { dataUrl: _d, ...rest } = p; out.push({ ...rest, ...up }); moved++; }
            catch { out.push(p); }
          } else out.push(p);
        }
        // منكتب بس إذا ما حدا غيّر صور اليوم بالنص
        await admin.from("day_meta").update({ sales_report_link: JSON.stringify(out) })
          .eq("date", r.date).eq("branch", r.branch).eq("sales_report_link", r.sales_report_link);
      }
      return json({ moved, days: (rows || []).length });
    }

    return json({ error: "action?" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
