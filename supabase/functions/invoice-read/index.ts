// 🤖 قراءة فاتورة كاملة من صورتها: المورد، الرقم الضريبي، رقم الفاتورة، التاريخ، الأصناف، والمبالغ.
// يشتغل إذا انحط مفتاح بأسرار Supabase: ANTHROPIC_API_KEY (Claude) أو GEMINI_API_KEY (Gemini المجاني).
// بدون مفتاح يرجّع 503 والموقع يكمل بالـ QR.
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
const GKEY = Deno.env.get("GEMINI_API_KEY") || "";
const MODEL = KEY ? (Deno.env.get("INVOICE_AI_MODEL") || "claude-sonnet-5-5") : (Deno.env.get("INVOICE_GEMINI_MODEL") || "gemini-flash-latest");
const GL = "https://generativelanguage.googleapis.com/v1beta";
let gModel = "";
// أحدث نموذج Flash متاح لهالمفتاح (Google توقف نماذج قديمة للحسابات الجديدة)
async function pickGeminiModel(): Promise<string> {
  try {
    const r = await fetch(`${GL}/models?pageSize=200`, { headers: { "x-goog-api-key": GKEY } });
    // deno-lint-ignore no-explicit-any
    const out: any = await r.json();
    const names: string[] = (out?.models || [])
      .filter((m: { supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""))
      .filter((n: string) => /flash/.test(n) && !/lite|image|tts|live|audio|embedding|thinking|exp/.test(n));
    const ver = (n: string) => Number((/gemini-(\d+(?:\.\d+)?)/.exec(n) || [])[1] || 0);
    names.sort((a, b) => ver(b) - ver(a) || Number(/preview/.test(a)) - Number(/preview/.test(b)));
    return names[0] || "";
  } catch { return ""; }
}
const DAILY_LIMIT = 80;

const PROMPT = `This is a photo of a purchase invoice or receipt (Saudi Arabia, Arabic and/or English).
Read it carefully and return ONLY a JSON object, no other text:
{"supplier": string, "supplier_vat": string, "invoice_no": string, "date": "YYYY-MM-DD",
 "lines": [{"name": string, "qty": number|null, "unit": string, "unit_price": number|null, "total": number|null, "category": string, "category_sure": boolean}],
 "subtotal": number|null, "discount": number|null, "vat": number|null, "total": number|null,
 "payment": string, "notes": string}
Rules: supplier = the SELLER (not the customer). supplier_vat = the seller's 15-digit VAT number.
Line names exactly as written (keep Arabic). Line totals as printed. total = final amount after VAT.
Use null for anything you cannot read with confidence — never guess numbers. notes: anything unclear, in Arabic.
category = exactly one of these restaurant purchase categories (Arabic):
"لحوم" (meat, chicken, fish, seafood), "خضراوات" (vegetables, fruits, herbs), "بهارات" (spices, salt, seasonings),
"بقالة" (dry goods, rice, flour, oil, dairy, sauces, bread, coffee beans), "مشروبات" (drinks, water, juices, soft drinks),
"بلاستيك وتغليف" (cups, containers, bags, foil, packaging, disposables), "منظفات" (cleaning products, tissues, gloves),
"أدوات طبخ" (kitchen tools, pans, trays, utensils, equipment), "أخرى" (anything else).
category_sure = false if the item could reasonably belong to another category or the name is unclear.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!KEY && !GKEY) return json({ error: "no_ai" }, 503);

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

  let ok = false, text = "", err = "", ms = 0;
  if (KEY) {
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
    ok = res.ok; text = (out?.content || []).map((c: { text?: string }) => c.text || "").join("");
    if (!res.ok) err = `${res.status} ${out?.error?.message || ""}`;
  } else {
    // بدون «تفكير» — القراءة كانت تاخذ دقيقة وأكثر، والفاتورة ما تحتاجه
    const mk = (think: boolean) => JSON.stringify({
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: m[1], data: m[3] } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8000, responseMimeType: "application/json", ...(think ? {} : { thinkingConfig: { thinkingBudget: 0 } }) },
    });
    const errs: string[] = [];
    const t0 = Date.now();
    // كل محاولة بحد ٣٥ ثانية؛ ضغط على النموذج (503/429) أو تأخير → نموذج Flash ثاني
    const call = async (model: string, think = false): Promise<boolean | null> => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 35000);
      let res: Response;
      try {
        res = await fetch(`${GL}/models/${model}:generateContent`, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": GKEY }, body: mk(think) });
      } catch (_e) {
        errs.push(`${model} timeout`);
        return false;
      } finally { clearTimeout(timer); }
      // deno-lint-ignore no-explicit-any
      const out: any = await res.json().catch(() => ({}));
      text = (out?.candidates?.[0]?.content?.parts || []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text || "").join("");
      if (res.ok && text) return true;
      const msg = `${out?.error?.message || ""}`;
      errs.push(`${model} ${res.status} ${out?.error?.status || ""} ${msg} ${out?.candidates?.[0]?.finishReason || ""}`.slice(0, 140));
      // النموذج ما يقبل إيقاف التفكير → نعيد بدونه
      if (res.status === 400 && !think && /thinking/i.test(msg)) return call(model, true);
      return res.status === 404 ? null : false;
    };
    let r = await call(gModel || MODEL);
    if (r !== true && Date.now() - t0 < 40000) {
      const alt = await pickGeminiModel();
      if (alt && alt !== (gModel || MODEL)) { r = await call(alt); if (r === true) gModel = alt; }
    }
    if (r !== true && Date.now() - t0 < 55000) r = await call("gemini-flash-lite-latest");
    ms = Date.now() - t0;
    ok = r === true;
    if (!ok) err = errs.join(" | ");
  }
  // deno-lint-ignore no-explicit-any
  let invoice: any = null;
  try { const s = text.indexOf("{"), e = text.lastIndexOf("}"); invoice = JSON.parse(text.slice(s, e + 1)); } catch { invoice = null; }
  if (ok && !invoice && !err) err = "bad json: " + text.slice(0, 120);
  await admin.from("invoice_ai_log").insert({ employee_id: sess.employee_id, ok: !!invoice, model: KEY ? MODEL : (gModel || MODEL), err: err.slice(0, 300) || null, ms });
  if (!ok || !invoice) return json({ error: "ai_failed" }, 502);
  return json({ invoice });
});
