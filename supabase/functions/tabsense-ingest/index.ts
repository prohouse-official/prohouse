// استقبال مبيعات تابسنس وفوديكس من GitHub Actions بدون أي مفتاح سري بالكود.
// GitHub بيعطي كل تشغيل للـ workflow هوية موقّعة (OIDC). منتأكد إنها من مستودعنا،
// من فرع main، ومن ملف tabsense-sync.yml أو foodics-sync.yml أو alj-reports.yml — وبعدين منادي دالة الاستيراد بمفتاح التكامل
// اللي محفوظ جوّا الداتابيس وما بيطلع برا أبداً.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "prohouse-ingest";
const REPO = "prohouse-official/prohouse";
const ALLOWED_WORKFLOWS = new Set([
  `${REPO}/.github/workflows/tabsense-sync.yml@refs/heads/main`,
  `${REPO}/.github/workflows/foodics-sync.yml@refs/heads/main`,
  `${REPO}/.github/workflows/alj-reports.yml@refs/heads/main`
]);
// ملفات تقارير عبداللطيف جميل اليومية (نفس ملفات تابسنس) → مخزن خاص alj-reports
const ALJ_FILE = /^\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\/(Summary \d{1,2} [a-z]{3}\.pdf|Orders \(\d{1,2} [a-z]{3}\)\.xlsx)$/;
const ALLOWED = new Set(["import_sales", "import_product_sales", "import_modifier_sales", "import_payments", "import_juice_sales"]);

const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const oidc = req.headers.get("x-github-oidc") || "";
  try {
    const { payload } = await jwtVerify(oidc, JWKS, { issuer: ISSUER, audience: AUDIENCE });
    if (payload.repository !== REPO || payload.ref !== "refs/heads/main" || !ALLOWED_WORKFLOWS.has(payload.job_workflow_ref as string)) {
      return json({ error: "not allowed" }, 403);
    }
  } catch (e) {
    return json({ error: "bad identity: " + (e as Error).message }, 401);
  }

  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return json({ error: "bad body" }, 400); }
  if (b.file) {
    const p = String(b.file.path || "");
    if (!ALJ_FILE.test(p)) return json({ error: "bad file path" }, 400);
    const bin = atob(String(b.file.base64 || ""));
    if (!bin.length || bin.length > 8 * 1024 * 1024) return json({ error: "bad file size" }, 400);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const type = p.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const { error } = await admin.storage.from("alj-reports").upload(p, bytes, { contentType: type, upsert: true });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, path: p });
  }
  if (!ALLOWED.has(b.rpc)) return json({ error: "rpc not allowed" }, 400);

  const { data: tok } = await admin.from("settings").select("value").eq("key", "integrationToken").maybeSingle();
  const { data, error } = await admin.rpc(b.rpc, { p_token: tok?.value || "", p_date: b.date, p_branch: b.branch, p_rows: b.rows || [] });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, result: data });
});
