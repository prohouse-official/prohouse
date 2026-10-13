// تكرار (techrar) عن طريق API token (قراءة بس) — بدل الدخول بالمتصفح (الدخول صار OTP).
// السر TAKRAR_CONFIG_JSON: التوكن لحاله، أو {"token": "...", "appId"?: "...", "base"?: "...", "ordersPath"?: "..."}
// أوضاع التشغيل (TAKRAR_EXPLORE):
//   docs  → يطبع فهرس وثائق تكرار العامة (docs.techrar.com) عن الطلبات والاشتراكات — وثائق عامة، ما فيها بياناتنا
//   probe → يجرب مسار (TAKRAR_PATH) بالتوكن ويطبع الحالة وأسماء الحقول بس (بدون أي قيم)
//   (فاضي) → السحب العادي (يتركّب بعد ما نعرف شكل الرد)
// المستودع عام: ما ينطبع أي رقم مبيعات ولا بيانات عملاء ولا التوكن.
const raw = (process.env.TAKRAR_CONFIG || "").trim();
let cfg = {};
try { cfg = JSON.parse(raw); } catch (e) { cfg = { token: raw }; }
if (typeof cfg === "string") cfg = { token: cfg };
const TOKEN = cfg.token || cfg.apiToken || "";
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

(async () => {
  if (MODE === "docs") return docs();
  if (MODE === "probe") return probe();
  console.log("Takrar API sync: endpoints not configured yet — run with explore=docs / probe first");
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
