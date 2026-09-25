// إرسال نماذج قوقل تلقائياً من الموقع (بدل ما الموظف يعبّيها بإيده).
//   POST {form:"sauce", date, branch, name, chicken, meat, fillet, salmon, shrimp, notes}
// بيتحقق من جلسة الموظف، بيبعت النموذج، وبيسجّل النتيجة بجدول form_submissions.
// {dryRun:true} بيبعت النموذج ناقص الاسم عشان نتأكد إن الخانات صح بدون ما ينسجّل رد.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-session-token",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
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
  if (b.form !== "sauce") return json({ error: "نموذج مش معروف" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) return json({ error: "التاريخ غلط" }, 400);
  if (!SAUCE.branches.includes(b.branch)) return json({ error: "الفرع مش موجود بالنموذج" }, 400);

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
