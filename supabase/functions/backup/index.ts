// نسخة احتياطية كاملة كل ليلة: كل الجداول بملف JSON مضغوط بـ Storage (خزنة backups الخاصة)، بنخلي آخر ٣٠ نسخة.
// بديل مجاني للنسخ الاحتياطي المدفوع. pg_cron بيناديها كل ليلة مع مفتاح سري من الخزنة.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "backups";
const KEEP = 30;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const key = req.headers.get("x-backup-key") || "";
  const { data: ok } = await admin.rpc("ph_backup_key_ok", { k: key });
  if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });

  const { data, error } = await admin.rpc("ph_export_all");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const raw = new TextEncoder().encode(JSON.stringify(data));
  const gz = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const path = `${day}.json.gz`;
  const up = await admin.storage.from(BUCKET).upload(path, gz, { contentType: "application/gzip", upsert: true });
  if (up.error) return new Response(JSON.stringify({ error: up.error.message }), { status: 500 });

  // الأقدم من آخر ٣٠ نسخة بينمسح
  const { data: files } = await admin.storage.from(BUCKET).list("", { limit: 1000, sortBy: { column: "name", order: "desc" } });
  const old = (files || []).map((f) => f.name).filter((n) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n)).slice(KEEP);
  if (old.length) await admin.storage.from(BUCKET).remove(old);

  return new Response(JSON.stringify({ path, bytes: gz.length, raw: raw.length, removed: old.length }), { headers: { "Content-Type": "application/json" } });
});
