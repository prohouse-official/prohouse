// تكرار (techrar) عن طريق API token (قراءة بس) — بدل الدخول بالمتصفح (الدخول صار OTP).
// السر TAKRAR_CONFIG_JSON: التوكن لحاله، أو {"token": "...", "appId"?: "<Merchant ID>", "base"?: "...", "ordersPath"?: "..."}
// التوكن من panel.techrar.com ← API Tokens بصلاحية get_merchant_orders (قراءة بس)
// أوضاع التشغيل (TAKRAR_EXPLORE):
//   docs  → يطبع فهرس وثائق تكرار العامة (docs.techrar.com) عن الطلبات والاشتراكات — وثائق عامة، ما فيها بياناتنا
//   probe → يجرب مسار (TAKRAR_PATH) بالتوكن ويطبع الحالة وأسماء الحقول بس (بدون أي قيم)
//   (فاضي) → السحب العادي: طلبات آخر أيام (BACKFILL_DAYS، الافتراضي ٣) → الموقع كفرع «تكرار» (جدول طرق الدفع)
// المستودع عام: ما ينطبع أي رقم مبيعات ولا بيانات عملاء ولا التوكن.
const raw = (process.env.TAKRAR_CONFIG || "").trim();
let cfg = {};
try { cfg = JSON.parse(raw); } catch (e) { cfg = { token: raw }; }
if (typeof cfg === "string") cfg = { token: cfg };
const TOKEN = cfg.token || cfg.apiToken || "";
// رقم التاجر (app-id) إلزامي عند تكرار — إذا مش بالسر بناخده من التوكن نفسه (JWT: app_id)
if (!cfg.appId && TOKEN.split(".").length === 3) {
  try { cfg.appId = JSON.parse(Buffer.from(TOKEN.split(".")[1], "base64url").toString()).app_id; } catch (e) {}
}
const BASE = (cfg.base || "https://api.techrar.com").replace(/\/$/, "");
const MODE = (process.env.TAKRAR_EXPLORE || "").trim();

// شكل الرد بدون قيم: أسماء الحقول وأنواعها (أول عنصر من كل قائمة)
function shape(v, depth = 0) {
  if (depth > 4) return "…";
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1), `(${v.length} items)`] : [];
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).slice(0, 60).map(k => [k, shape(v[k], depth + 1)]));
  return v === null ? "null" : typeof v;
}

async function docs() {
  const hit = /order|subscription|sub-order|sub_order|authenticat|token|app-id|base url|merchant/i;
  for (const u of ["https://docs.techrar.com/llms.txt", "https://docs.techrar.com/llms-full.txt"]) {
    const res = await fetch(u).catch(e => ({ ok: false, status: e.message }));
    console.log("DOCS", u, res.status);
    if (!res.ok) continue;
    const text = await res.text();
    const lines = text.split("\n");
    console.log("lines:", lines.length);
    if (u.endsWith("llms.txt")) {
      lines.filter(l => hit.test(l)).slice(0, 200).forEach(l => console.log("  " + l.slice(0, 220)));
    } else {
      // صفحات الطلبات والاشتراكات بالكامل (أول 400 سطر منها)
      let keep = 0, out = 0;
      for (const l of lines) {
        if (/^#{1,3} /.test(l)) keep = /order|subscription|authenticat/i.test(l) ? 1 : 0;
        if (keep && out < 400 && l.trim()) { console.log("  " + l.slice(0, 220)); out++; }
      }
    }
  }
}

async function probe() {
  const p = (process.env.TAKRAR_PATH || "").trim();
  if (!TOKEN) throw new Error("ما فيه توكن بالسر");
  const paths = p ? p.split(",") : [];
  for (const path of paths) {
    const url = /^https?:/.test(path) ? path : BASE + (path.startsWith("/") ? "" : "/") + path;
    const headers = { Authorization: "Bearer " + TOKEN, Accept: "application/json" };
    if (cfg.appId) headers["app-id"] = String(cfg.appId);
    const res = await fetch(url, { headers }).catch(e => ({ ok: false, status: e.message, text: async () => "" }));
    let body = ""; try { body = await res.text(); } catch (e) {}
    let j = null; try { j = JSON.parse(body); } catch (e) {}
    console.log("PROBE", url.replace(BASE, ""), res.status, j ? JSON.stringify(shape(j)).slice(0, 1500) : "(not json, " + body.length + " bytes)");
    if (j && res.status >= 400) console.log("  error:", JSON.stringify(j).replace(/\d{4,}/g, "#").slice(0, 300));
  }
}

const SUPA_URL = "https://sadtinfdwucwrxlmwxov.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZHRpbmZkd3Vjd3J4bG13eG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTM4MDgsImV4cCI6MjEwNTEyOTgwOH0.jMtjOIBQIuv0N0Q4ms9LJ5ys3h3lfakND4pVQXNbU2w";
const BRANCH = "تكرار";
// حسب التوثيق: /public-api/v1/orders/ (وبعض الصفحات بتقول inventory/v1) — أول واحد يرد 200 هو المعتمد
const ORDER_PATHS = cfg.ordersPath ? [cfg.ordersPath] : ["/public-api/v1/orders/", "/inventory/v1/orders/"];

async function oidcToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) throw new Error("ما في هوية GitHub (OIDC)");
  const res = await fetch(url + "&audience=prohouse-ingest", { headers: { Authorization: "bearer " + bearer } });
  if (!res.ok) throw new Error("GitHub OIDC [" + res.status + "]");
  return (await res.json()).value;
}

async function sendDay(date, rows) {
  const res = await fetch(SUPA_URL + "/functions/v1/tabsense-ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + ANON, "x-github-oidc": await oidcToken() },
    body: JSON.stringify({ rpc: "import_payments", date, branch: BRANCH, rows })
  });
  if (!res.ok) throw new Error("إرسال يوم فشل [" + res.status + "]");
}

// تاريخ اليوم بتوقيت الرياض (+03:00)
const riyadh = (ms) => new Date(ms + 3 * 3600000).toISOString().slice(0, 10);

async function getJson(url) {
  const headers = { Authorization: "Bearer " + TOKEN, Accept: "application/json" };
  if (cfg.appId) headers["app-id"] = String(cfg.appId); // رقم التاجر (من السر أو من التوكن)
  const res = await fetch(url, { headers });
  const body = await res.text();
  let j = null; try { j = JSON.parse(body); } catch (e) {}
  return { status: res.status, j };
}

// كل الطلبات بين تاريخين (الرد قائمة، أو صفحات {results, next})
async function fetchOrders(from, to) {
  for (const p of ORDER_PATHS) {
    let url = BASE + p + "?from_date=" + from + "&to_date=" + to + "&page_size=10000";
    const out = [];
    let first = true;
    while (url) {
      const { status, j } = await getJson(url);
      if (status !== 200 || !j) {
        if (first) {
          // رسالة الخطأ من تكرار (متل "Invalid token") — بلا أرقام
          const msg = j && (j.error || j.detail || j.message) ? JSON.stringify(j.error || j.detail || j.message).replace(/\d{4,}/g, "#").slice(0, 200) : "";
          console.log("TAKRAR_PATH", p, status, msg);
          break;
        }
        throw new Error("صفحة طلبات فشلت [" + status + "]");
      }
      first = false;
      if (Array.isArray(j)) { out.push(...j); url = null; }
      else { out.push(...(j.results || [])); url = j.next || null; }
    }
    if (!first) return out;
  }
  throw new Error("ولا مسار طلبات اشتغل — تأكد من التوكن والصلاحية get_merchant_orders وال appId");
}

const CH = { tamara: "اشتراكات تكرار — تمارا", tabby: "اشتراكات تكرار — تابي" };
function channelOf(o) {
  const p = String(o.payment_provider || o.payment_method || (o.payment && (o.payment.provider || o.payment.method)) || "").toLowerCase();
  for (const k of Object.keys(CH)) if (p.includes(k)) return CH[k];
  return "اشتراكات تكرار — بطاقة";
}

async function sync() {
  if (!TOKEN) throw new Error("السر ناقص: لازم token");
  const n = Math.min(Math.max(parseInt(process.env.BACKFILL_DAYS || "3", 10) || 3, 1), 120);
  const now = Date.now();
  const to = riyadh(now), from = riyadh(now - (n - 1) * 86400000);
  const orders = await fetchOrders(from, to);
  const days = {};
  for (let i = 0; i < n; i++) days[riyadh(now - i * 86400000)] = {};
  for (const o of orders) {
    const amt = Number(o.total_amount) || 0;
    if (amt <= 0 || o.is_paid === false) continue;
    const d = String(o.created_at || "").slice(0, 10); // الوقت بتوقيت الرياض (+03:00) بالرد
    if (!days[d]) continue;
    const c = channelOf(o);
    const r = days[d][c] || (days[d][c] = { channel: c, transactions: 0, amount: 0 });
    r.transactions++; r.amount += amt;
  }
  let sent = 0;
  for (const [d, chs] of Object.entries(days)) {
    await sendDay(d, Object.values(chs).map(r => ({ ...r, amount: Math.round(r.amount * 100) / 100 })));
    sent++;
  }
  // المستودع عام: بس عدد الأيام، بلا أرقام مبيعات
  console.log("TAKRAR_OK days_sent=" + sent);
}

(async () => {
  if (MODE === "docs") return docs();
  if (MODE === "probe") return probe();
  return sync();
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
