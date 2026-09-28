// إرسال نماذج قوقل تلقائياً من الموقع (بدل ما الموظف يعبّيها بإيده).
//   POST {form:"sauce", date, branch, name, chicken, meat, fillet, salmon, shrimp, notes}
// بيتحقق من جلسة الموظف، بيبعت النموذج، وبيسجّل النتيجة بجدول form_submissions.
// {dryRun:true} بيبعت النموذج ناقص الاسم عشان نتأكد إن الخانات صح بدون ما ينسجّل رد.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-session-token, prefer, accept-profile, content-profile",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// نموذج الصوص المتبقي - برو هاوس
const SAUCE = {
  url: "https://docs.google.com/forms/d/e/1FAIpQLSeiWhxPrXL3PL-1p5DwJDEhrfsvidzffqllFvOXj5sp_z3erw/formResponse",
  date: "entry.702072711", branch: "entry.962522740", name: "entry.133781406",
  chicken: "entry.131031086", meat: "entry.1836514680", fillet: "entry.835003912",
  shrimp: "entry.1988979929", salmon: "entry.1035332311", notes: "entry.1209295519",
  branches: ["الروضة", "الشاطئ", "عبداللطيف جميل"],
};

const grams = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? String(n) : "0"; };

// تاريخ اليوم بتوقيت الرياض
function riyadhToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
// نفس تصنيف الصوص اللي بالموقع (remaining.js → sauceBucketOf)
function sauceBucket(name: string, category: string) {
  if (/سالمون/.test(name)) return "salmon";
  if (/جمبري|روبيان/.test(name)) return "shrimp";
  if (/^دجاج/.test(name) || category.includes("دجاج")) return "chicken";
  if (/^لحم/.test(name) || category.includes("لحم")) return "meat";
  if (category.includes("بحري") || /سمك|فيليه/.test(name)) return "fillet";
  return null;
}

async function postSauceForm(date: string, branch: string, values: Record<string, string>, name: string, notes: string) {
  const [y, m, d] = date.split("-");
  const form = new URLSearchParams();
  form.set(`${SAUCE.date}_year`, y); form.set(`${SAUCE.date}_month`, String(Number(m))); form.set(`${SAUCE.date}_day`, String(Number(d)));
  form.set(SAUCE.branch, branch);
  form.set(SAUCE.name, name);
  for (const k of ["chicken", "meat", "fillet", "salmon", "shrimp"]) form.set((SAUCE as Record<string, string>)[k], values[k]);
  if (notes) form.set(SAUCE.notes, notes.slice(0, 500));
  form.set("fvv", "1"); form.set("pageHistory", "0");
  const res = await fetch(SAUCE.url, { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const html = await res.text();
  const ok = res.ok && /تم تسجيل ردك|freebirdFormviewerViewResponseConfirmationMessage|recorded/i.test(html);
  return { ok, status: res.status };
}

// إرسال مجدول (pg_cron الساعة 9 الليل): يجمع صوص المتبقي من الداتابيس ويرسل مرة وحدة باليوم.
// محمي بمفتاح بجدول server_secrets (ما بيطلع للموقع ولا للموظفين).
async function cronSauce(branch: string) {
  const date = riyadhToday();
  const { data: sent } = await admin.from("form_submissions").select("id").eq("form", "sauce").eq("date", date).eq("branch", branch).eq("ok", true).limit(1);
  if (sent && sent.length) return json({ skipped: "already sent", date, branch });
  const { data: rows } = await admin.from("daily_entries")
    .select("item_id, item_name, remaining, remaining_weight, remaining_sauce")
    .eq("date", date).eq("branch", branch);
  // deno-lint-ignore no-explicit-any
  const list = (rows || []) as any[];
  const ids = [...new Set(list.map((r) => r.item_id))];
  const { data: cats } = ids.length ? await admin.from("items").select("id, category").in("id", ids) : { data: [] };
  const catOf: Record<string, string> = Object.fromEntries((cats || []).map((c: { id: string; category: string }) => [c.id, c.category || ""]));
  const counted = list.some((r) => r.remaining != null || r.remaining_weight != null || r.remaining_sauce != null);
  if (!counted) return json({ skipped: "remaining not counted yet", date, branch });
  const t: Record<string, number> = { chicken: 0, meat: 0, fillet: 0, salmon: 0, shrimp: 0 };
  list.forEach((r) => {
    const g = Number(r.remaining_sauce || 0);
    if (!(g > 0) || r.remaining_weight != null) return;
    const k = sauceBucket(String(r.item_name || ""), catOf[r.item_id] || "");
    if (k) t[k] += Math.round(g);
  });
  const values = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, grams(v)]));
  const { data: mgr } = await admin.from("employees").select("name").eq("active", true).eq("role", "manager").ilike("branches", `%${branch}%`).limit(1).maybeSingle();
  const name = mgr?.name || "برو هاوس";
  const r = await postSauceForm(date, branch, values, name, "");
  const payload = { ...values, name, notes: "" };
  await admin.from("form_submissions").insert({ form: "sauce", date, branch, payload, ok: r.ok, error: r.ok ? null : `HTTP ${r.status}`, sent_by: "مجدول 9 الليل" });
  return r.ok ? json({ ok: true, date, branch, payload }) : json({ error: `HTTP ${r.status}` }, 502);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    const { data: sec } = await admin.from("server_secrets").select("value").eq("key", "cron_key").maybeSingle();
    if (!sec?.value || sec.value !== cronKey) return json({ error: "not allowed" }, 403);
    // deno-lint-ignore no-explicit-any
    let cb: any = {};
    try { cb = await req.json(); } catch { /* */ }
    if (cb.cron !== "sauce" || !SAUCE.branches.includes(cb.branch)) return json({ error: "bad cron body" }, 400);
    return await cronSauce(cb.branch);
  }

  const token = req.headers.get("x-session-token") || "";
  const { data: sess } = await admin.from("sessions")
    .select("employee_id, employees!inner(name, active)")
    .eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const emp = (sess as any)?.employees;
  if (!sess || !emp?.active) return json({ error: "لازم تسجل دخول" }, 401);

  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return json({ error: "طلب غلط" }, 400); }
  if (b.form !== "sauce") return json({ error: "نموذج غير معروف" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) return json({ error: "التاريخ غلط" }, 400);
  if (!SAUCE.branches.includes(b.branch)) return json({ error: "الفرع غير موجود في النموذج" }, 400);

  const [y, m, d] = b.date.split("-");
  const values = { chicken: grams(b.chicken), meat: grams(b.meat), fillet: grams(b.fillet), salmon: grams(b.salmon), shrimp: grams(b.shrimp) };
  const name = String(b.name || emp.name || "").trim();
  const form = new URLSearchParams();
  form.set(`${SAUCE.date}_year`, y); form.set(`${SAUCE.date}_month`, String(Number(m))); form.set(`${SAUCE.date}_day`, String(Number(d)));
  form.set(SAUCE.branch, b.branch);
  if (!b.dryRun) form.set(SAUCE.name, name);
  for (const k of Object.keys(values) as (keyof typeof values)[]) form.set(SAUCE[k], values[k]);
  if (b.notes) form.set(SAUCE.notes, String(b.notes).slice(0, 500));
  form.set("fvv", "1"); form.set("pageHistory", "0");

  const res = await fetch(SAUCE.url, { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const html = await res.text();
  if (b.dryRun) {
    // الرد المتوقع: رفض بسبب الاسم الناقص بس
    const errs = [...html.matchAll(/(سؤال مطلوب|required question|تنسيق|invalid|غير صالح)/gi)].map((x) => html.slice(Math.max(0, x.index! - 300), x.index! + 40).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(-160));
    return json({ status: res.status, errors: errs });
  }
  const ok = res.ok && /تم تسجيل ردك|freebirdFormviewerViewResponseConfirmationMessage|recorded/i.test(html);
  const payload = { ...values, name, notes: b.notes || "" };
  await admin.from("form_submissions").insert({ form: "sauce", date: b.date, branch: b.branch, payload, ok, error: ok ? null : `HTTP ${res.status}`, sent_by: emp.name });
  return ok ? json({ ok: true, payload }) : json({ error: `قوقل ما قبل النموذج (HTTP ${res.status})` }, 502);
});
