// استقبال مبيعات تابسنس من GitHub Actions بدون أي مفتاح سري بالكود.
// GitHub بيعطي كل تشغيل للـ workflow هوية موقّعة (OIDC). منتأكد إنها من مستودعنا،
// من فرع main، ومن ملف tabsense-sync.yml — وبعدين منادي دالة الاستيراد بمفتاح التكامل
// اللي محفوظ جوّا الداتابيس وما بيطلع برا أبداً.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "prohouse-ingest";
const REPO = "prohouse-official/prohouse";
const WORKFLOW = `${REPO}/.github/workflows/tabsense-sync.yml@refs/heads/main`;
const ALLOWED = new Set(["import_sales", "import_product_sales", "import_modifier_sales", "import_payments", "import_juice_sales"]);

const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const oidc = req.headers.get("x-github-oidc") || "";
  try {
    const { payload } = await jwtVerify(oidc, JWKS, { issuer: ISSUER, audience: AUDIENCE });
    if (payload.repository !== REPO || payload.ref !== "refs/heads/main" || payload.job_workflow_ref !== WORKFLOW) {
      return json({ error: "not allowed" }, 403);
    }
  } catch (e) {
    return json({ error: "bad identity: " + (e as Error).message }, 401);
  }

  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return json({ error: "bad body" }, 400); }
  if (!ALLOWED.has(b.rpc)) return json({ error: "rpc not allowed" }, 400);

  const { data: tok } = await admin.from("settings").select("value").eq("key", "integrationToken").maybeSingle();
  const { data, error } = await admin.rpc(b.rpc, { p_token: tok?.value || "", p_date: b.date, p_branch: b.branch, p_rows: b.rows || [] });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, result: data });
});
