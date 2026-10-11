// سحب دوري لسجل المشتريات من شيت يزيد (Google Apps Script كل ساعة) → جدول purchase_invoices.
// بدون أي مفتاح سري: السكربت يرسل هوية قوقل الموقّعة (ScriptApp.getIdentityToken)، ومنتأكد إنها
// من إيميل مسموح (settings.purchase_sync_emails). أول سكربت ينقبل يتسجّل (aud) وبعده ما ينقبل غيره.
// الفاتورة اللي راجعها المحاسب ما تتغير — هذا جوّا pur_sync_rows.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function setting(key: string) {
  const { data } = await admin.from("settings").select("value").eq("key", key).maybeSingle();
  return String(data?.value || "");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let email = "", aud = "";
  try {
    const { payload } = await jwtVerify(req.headers.get("x-google-id-token") || "", JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"]
    });
    if (payload.email_verified !== true) throw new Error("email not verified");
    email = String(payload.email || "").toLowerCase();
    aud = String(payload.aud || "");
  } catch (e) {
    return json({ error: "bad identity: " + (e as Error).message }, 401);
  }
  const allowed = (await setting("purchase_sync_emails")).toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(email)) return json({ error: "email not allowed" }, 403);
  const known = await setting("purchase_sync_aud");
  if (known && known !== aud) return json({ error: "unknown script" }, 403);
  if (!known) await admin.from("settings").upsert({ key: "purchase_sync_aud", value: aud });

  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return json({ error: "bad body" }, 400); }
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length || rows.length > 300) return json({ error: "rows 1..300" }, 400);
  const { data, error } = await admin.rpc("pur_sync_rows", { p: rows });
  if (error) return json({ error: error.message }, 500);
  await admin.from("settings").upsert({ key: "purchase_sync_last", value: JSON.stringify({ at: new Date().toISOString(), by: email, ...data }) });
  return json({ ok: true, result: data });
});
