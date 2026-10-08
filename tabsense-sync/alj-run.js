// تشغيل يومي (GitHub Actions، فرع main): ينزّل تقريرين عبداللطيف جميل من تابسنس زي ما هم
// (ملخص PDF + طلبات Excel) ويحفظهم بالمخزن الخاص بالموقع. بدون أي تعديل على الملفات.
// ALJ_START / ALJ_END (YYYY-MM-DD) لسحب أيام قديمة — فاضي = اليوم بتوقيت الرياض.
// المستودع عام: السجل يطبع التاريخ وحالة الرفع بس، بدون أرقام مبيعات.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { downloadAljReports, mask } = require("./alj-reports");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const BASE = "https://app.tabsense.ai/prohouse/dashboard";
const SUPA_URL = String(config.supabaseUrl || "https://sadtinfdwucwrxlmwxov.supabase.co").replace(/\/$/, "");
const ANON = config.supabaseAnonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZHRpbmZkd3Vjd3J4bG13eG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTM4MDgsImV4cCI6MjEwNTEyOTgwOH0.jMtjOIBQIuv0N0Q4ms9LJ5ys3h3lfakND4pVQXNbU2w";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
function dateList(start, end) {
  const out = [];
  for (let t = Date.parse(start + "T00:00:00Z"); t <= Date.parse(end + "T00:00:00Z"); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
// نفس أسماء الملفات اللي ترسلونها: "Summary 15 sep.pdf" و "Orders (15 sep).xlsx"
function fileNames(iso) {
  const [, m, d] = iso.split("-");
  const label = `${Number(d)} ${MONTHS[Number(m) - 1]}`;
  return { summary: `Summary ${label}.pdf`, orders: `Orders (${label}).xlsx` };
}

async function oidcToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) throw new Error("ما في هوية GitHub (OIDC) — هالسكربت يشتغل من GitHub Actions بس");
  const res = await fetch(url + "&audience=prohouse-ingest", { headers: { Authorization: "bearer " + bearer } });
  if (!res.ok) throw new Error("GitHub OIDC [" + res.status + "]");
  return (await res.json()).value;
}

async function uploadFile(storagePath, filePath) {
  const res = await fetch(SUPA_URL + "/functions/v1/tabsense-ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + ANON, "x-github-oidc": await oidcToken() },
    body: JSON.stringify({ file: { path: storagePath, base64: fs.readFileSync(filePath).toString("base64") } })
  });
  if (!res.ok) throw new Error("رفع فشل [" + res.status + "] " + mask((await res.text().catch(() => "")).slice(0, 120)));
}

(async () => {
  const start = process.env.ALJ_START || riyadhToday();
  const end = process.env.ALJ_END || start;
  const days = dateList(start, end);
  if (!days.length || days.length > 40) throw new Error("فترة غلط");
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true })).newPage();
  let failed = 0;
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"], input[name="email"]', config.email);
    await page.fill('input[type="password"], input[name="password"]', config.password);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
      page.click('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("Login")')]);
    const dir = path.join(__dirname, "alj-out");
    for (const iso of days) {
      try {
        const r = await downloadAljReports(page, iso, dir);
        const names = fileNames(iso);
        const folder = `${iso.slice(0, 7)}/${iso}`;
        await uploadFile(`${folder}/${names.summary}`, r.summary.path);
        await uploadFile(`${folder}/${names.orders}`, r.orders.path);
        console.log("ALJ_OK", iso);
      } catch (e) {
        failed++;
        console.error("ALJ_FAIL", iso, mask(e.message));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally {
    await browser.close();
  }
  if (failed) process.exitCode = 1;
})().catch(e => { console.error("ALJ_FATAL", mask(e.message)); process.exit(1); });
