// 🔄 زر "اسحب مبيعات تابسنس الحين" — للمالك بس.
// يشغّل نفس سحب GitHub Actions (tabsense-sync.yml) بدل ما ننتظر موعده.
// يحتاج سر بـ Supabase باسم GITHUB_ACTIONS_TOKEN (توكن GitHub مقيّد: Actions قراءة/كتابة على مستودع prohouse بس).
//   POST {action: "start"}  ← يبدأ السحب (إذا فيه سحب شغّال ما يبدأ ثاني)
//   POST {action: "status"} ← حالة آخر سحب + آخر وقت وصلت فيه مبيعات
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-session-token, prefer, accept-profile, content-profile",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const GH_TOKEN = Deno.env.get("GITHUB_ACTIONS_TOKEN") || "";
const WF = "https://api.github.com/repos/prohouse-official/prohouse/actions/workflows/tabsense-sync.yml";
const gh = (url: string, init: RequestInit = {}) => fetch(url, {
  ...init,
  headers: { "Authorization": "Bearer " + GH_TOKEN, "Accept": "application/vnd.github+json", "User-Agent": "prohouse-ops", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers || {}) },
});

async function latestRun() {
  const res = await gh(WF + "/runs?per_page=1&branch=main");
  if (!res.ok) throw new Error("github " + res.status);
  const r = (await res.json()).workflow_runs?.[0];
  return r ? { id: r.id, status: r.status, conclusion: r.conclusion, created_at: r.created_at, updated_at: r.updated_at } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const token = req.headers.get("x-session-token") || "";
  const { data: sess } = await admin.from("sessions")
    .select("employee_id, employees!inner(role, active)")
    .eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const emp = (sess as any)?.employees;
  if (!sess || !emp?.active || emp.role !== "owner") return json({ error: "للمالك بس" }, 403);

  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { /* status */ }

  const { data: last } = await admin.from("tabsense_sales").select("date, imported_at").order("imported_at", { ascending: false }).limit(1).maybeSingle();
  if (!GH_TOKEN) return json({ error: "not_configured", lastImport: last }, 503);

  try {
    const run = await latestRun();
    const busy = run && run.status !== "completed";
    if (b.action === "start" && !busy) {
      const res = await gh(WF + "/dispatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: "main", inputs: { backfill_days: "" } }) });
      if (!res.ok) return json({ error: "github " + res.status, lastImport: last }, 502);
      return json({ ok: true, started: true, lastImport: last });
    }
    return json({ ok: true, started: false, busy: !!busy, run, lastImport: last });
  } catch (e) {
    return json({ error: (e as Error).message, lastImport: last }, 502);
  }
});
