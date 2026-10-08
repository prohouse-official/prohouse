// تقارير عبداللطيف جميل اليومية (ملخص PDF + طلبات Excel — نفس ملفات تابسنس بالضبط).
// المخزن خاص (alj-reports): المالك والمحاسب بس يشوفون القائمة وياخذون رابط تنزيل مؤقت.
//   POST {action:"list", month:"2026-09"} → [{date, files:[{name, path}]}]
//   POST {action:"url", path}              → رابط تنزيل مؤقت (ساعة)
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "alj-reports";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const token = req.headers.get("x-session-token") || "";
  const { data: sess } = await admin.from("sessions")
    .select("employee_id, expires_at, employees!inner(role, active)")
    .eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const emp = (sess as any)?.employees;
  if (!sess || !emp?.active) return json({ error: "لازم تسجل دخول" }, 401);
  if (!["owner", "accountant"].includes(emp.role)) return json({ error: "للمالك والمحاسب بس" }, 403);

  let body: { action?: string; month?: string; path?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "طلب غلط" }, 400); }

  try {
    if (body.action === "list") {
      const month = String(body.month || "");
      if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: "الشهر غلط" }, 400);
      const { data: days, error } = await admin.storage.from(BUCKET).list(month, { limit: 40 });
      if (error) throw new Error(error.message);
      const out = [];
      for (const d of (days || []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.name))) {
        const { data: files } = await admin.storage.from(BUCKET).list(`${month}/${d.name}`, { limit: 10 });
        out.push({ date: d.name, files: (files || []).map((f) => ({ name: f.name, path: `${month}/${d.name}/${f.name}` })) });
      }
      out.sort((a, b) => a.date.localeCompare(b.date));
      return json({ days: out });
    }
    if (body.action === "url") {
      const p = String(body.path || "");
      if (!/^\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\/[^/]+\.(pdf|xlsx)$/.test(p)) return json({ error: "مسار غلط" }, 400);
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(p, 3600, { download: p.split("/").pop() });
      if (error) throw new Error(error.message);
      return json({ url: data.signedUrl });
    }
    return json({ error: "action?" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
