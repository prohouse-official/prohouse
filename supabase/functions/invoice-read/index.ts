// 🤖 قراءة فاتورة كاملة من صورتها: المورد، الرقم الضريبي، رقم الفاتورة، التاريخ، الأصناف، والمبالغ.
// يشتغل بس إذا انحط مفتاح Claude بأسرار Supabase باسم ANTHROPIC_API_KEY (بدونه يرجّع 503 والموقع يكمل بالـ QR).
// الصورة ما تنحفظ هون — بس تنقرأ وترجع البيانات. لازم جلسة موقع صالحة، وفيه حد يومي لكل موظف.
//   POST {image: "data:image/jpeg;base64,..."} → {invoice:{...}}
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-session-token, prefer, accept-profile, content-profile",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL = Deno.env.get("INVOICE_AI_MODEL") || "claude-sonnet-5-5";
const DAILY_LIMIT = 80;

const PROMPT = `This is a photo of a purchase invoice or receipt (Saudi Arabia, Arabic and/or English).
Read it carefully and return ONLY a JSON object, no other text:
{"supplier": string, "supplier_vat": string, "invoice_no": string, "date": "YYYY-MM-DD",
 "lines": [{"name": string, "qty": number|null, "unit": string, "unit_price": number|null, "total": number|null}],
 "subtotal": number|null, "discount": number|null, "vat": number|null, "total": number|null,
 "payment": string, "notes": string}
Rules: supplier = the SELLER (not the customer). supplier_vat = the seller's 15-digit VAT number.
Line names exactly as written (keep Arabic). Line totals as printed. total = final amount after VAT.
Use null for anything you cannot read with confidence — never guess numbers. notes: anything unclear, in Arabic.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!KEY) return json({ error: "no_ai" }, 503);

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
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/s.exec(String(b.image || ""));
  if (!m) return json({ error: "صيغة الصورة غير مدعومة" }, 400);
  if (m[3].length > 6_500_000) return json({ error: "الصورة كبيرة" }, 400);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from("invoice_ai_log").select("id", { count: "exact", head: true })
    .eq("employee_id", sess.employee_id).gte("at", since);
  if ((count || 0) >= DAILY_LIMIT) return json({ error: "limit" }, 429);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 3000, temperature: 0,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: m[1], data: m[3] } },
        { type: "text", text: PROMPT },
      ] }],
    }),
  });
  // deno-lint-ignore no-explicit-any
  const out: any = await res.json().catch(() => ({}));
  const text = (out?.content || []).map((c: { text?: string }) => c.text || "").join("");
  // deno-lint-ignore no-explicit-any
  let invoice: any = null;
  try { const s = text.indexOf("{"), e = text.lastIndexOf("}"); invoice = JSON.parse(text.slice(s, e + 1)); } catch { invoice = null; }
  await admin.from("invoice_ai_log").insert({ employee_id: sess.employee_id, ok: !!invoice, model: MODEL });
  if (!res.ok || !invoice) return json({ error: "ai_failed" }, 502);
  return json({ invoice });
});
