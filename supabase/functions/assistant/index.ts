// 💬 المساعد بالذكاء الاصطناعي — اختياري ومجاني.
// يشتغل بس إذا انحط مفتاح Gemini المجاني (من aistudio.google.com) بأسرار Supabase باسم GEMINI_API_KEY.
// بدون المفتاح يرجّع 503 والموقع يكمل بالأجوبة الجاهزة.
//   POST {question, lang, context}  ← context = الأسئلة والأجوبة الجاهزة (عشان يجاوب من نفس الشرح)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KEY = Deno.env.get("GEMINI_API_KEY") || "";
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const DAILY_LIMIT = 40;
const LANG_NAME: Record<string, string> = { ar: "Arabic (Saudi dialect, simple words)", en: "simple English", bn: "simple Bengali" };

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
  const question = String(b.question || "").trim().slice(0, 500);
  if (!question) return json({ error: "السؤال فاضي" }, 400);
  const lang = LANG_NAME[b.lang] ? b.lang : "ar";
  const context = String(b.context || "").slice(0, 16000);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from("assistant_log").select("id", { count: "exact", head: true })
    .eq("employee_id", sess.employee_id).gte("asked_at", since);
  if ((count || 0) >= DAILY_LIMIT) return json({ error: "limit" }, 429);

  const system = `You are the help assistant inside "Pro House", a restaurant operations web app used by staff on their phones.
Answer ONLY questions about using the app, based on the guide below. Reply in ${LANG_NAME[lang]}, in 1-3 short sentences.
If the guide doesn't cover it, say you don't know and suggest asking the manager. Never invent screens or buttons.
Never discuss sales numbers, salaries or anything outside using the app.

GUIDE (question → answer):
${context}`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: question }] }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.2 },
    }),
  });
  // deno-lint-ignore no-explicit-any
  const out: any = await res.json().catch(() => ({}));
  const answer = (out?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("").trim();
  if (!res.ok || !answer) return json({ error: "ai_failed" }, 502);
  await admin.from("assistant_log").insert({ employee_id: sess.employee_id, employee_name: emp.name, question, answer });
  return json({ answer });
});
