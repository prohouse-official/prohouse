// Sends the web-push reminders. pg_cron calls it every 5 minutes; push_due_reminders() decides what is due
// (and logs it so each reminder goes out once). A POST {"test": "<endpoint>"} sends a test to that one phone.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = "BHU1VIfVy4PYbagp0bGxq9_y5TIXThikYoorSBwD7vFYwrnJIm5nXONBeeMBBQ5NTwman88Ad4QOQXuzs2nGdh4";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg, error: cfgErr } = await supa.rpc("push_config");
  if (cfgErr || !cfg?.privateKey) return json({ error: "push is not configured" }, 500);
  webpush.setVapidDetails("https://prohouse-ashen.vercel.app", VAPID_PUBLIC_KEY, cfg.privateKey);

  let body: { test?: string } = {};
  try { body = await req.json(); } catch { /* cron sends {} */ }

  let jobs: { endpoint: string; p256dh: string; auth: string; title: string; body: string; tag: string }[] = [];
  if (body.test) {
    const { data } = await supa.from("push_subscriptions").select("endpoint,p256dh,auth").eq("endpoint", body.test).maybeSingle();
    if (!data) return json({ error: "this phone is not registered" }, 404);
    jobs = [{ ...data, title: "🔔 برو هاوس", body: "التنبيهات شغّالة على هالجوال ✅", tag: "test" }];
  } else {
    const { data, error } = await supa.rpc("push_due_reminders");
    if (error) return json({ error: error.message }, 500);
    jobs = data || [];
  }

  const kindTab: Record<string, string> = { receiving: "receiving", remaining: "remaining", custody: "custody" };
  let sent = 0, gone = 0, failed = 0;
  await Promise.all(jobs.map(async (j) => {
    const tab = kindTab[j.tag.split(":")[0]];
    const payload = JSON.stringify({ title: j.title, body: j.body, tag: j.tag, url: tab ? `./?tab=${tab}` : "./" });
    try {
      await webpush.sendNotification({ endpoint: j.endpoint, keys: { p256dh: j.p256dh, auth: j.auth } }, payload, { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { gone++; await supa.from("push_subscriptions").delete().eq("endpoint", j.endpoint); }
      else { failed++; console.error("push failed", code, String(e)); }
    }
  }));
  return json({ sent, gone, failed });
});
