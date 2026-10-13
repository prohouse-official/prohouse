// سحب يومي لمبيعات اشتراكات تكرار: يدخل الداشبورد، ينزّل ملف الطلبات (orders.xlsx)،
// يجمعها حسب اليوم وطريقة الدفع، ويرسلها للموقع كفرع «تكرار» (نفس جدول طرق الدفع).
// config.json (من سر GitHub TAKRAR_CONFIG_JSON): { "url", "email", "password", "ordersUrl"?, "exportText"? }
// TAKRAR_EXPLORE=1 → يطبع شكل الصفحات بس (روابط، أزرار، عناوين جداول) بدون أي أرقام.
// المستودع عام: ما يطبع أرقام مبيعات ولا بيانات عملاء بالسجل.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const SUPA_URL = "https://sadtinfdwucwrxlmwxov.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZHRpbmZkd3Vjd3J4bG13eG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTM4MDgsImV4cCI6MjEwNTEyOTgwOH0.jMtjOIBQIuv0N0Q4ms9LJ5ys3h3lfakND4pVQXNbU2w";
const BRANCH = "تكرار";
const mask = (s) => String(s || "").replace(/\d/g, "#").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>");

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
  if (!res.ok) throw new Error("إرسال " + date + " فشل [" + res.status + "]");
}

async function login(page) {
  await page.goto(config.url, { waitUntil: "networkidle", timeout: 60000 });
  const email = page.locator('input[type="email"], input[name*="email" i], input[name*="user" i], input[type="text"]').first();
  await email.fill(config.email);
  await page.locator('input[type="password"]').first().fill(config.password);
  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => {}),
    page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("تسجيل")').first().click()
  ]);
  await page.waitForTimeout(4000);
  console.log("TAKRAR_LOGIN", mask(new URL(page.url()).pathname), (await page.locator('input[type="password"]').count()) ? "still-on-login" : "ok");
}

// شكل الصفحة بدون بيانات: الروابط والأزرار وعناوين الجداول
async function describe(page, label) {
  const info = await page.evaluate(() => {
    const t = (e) => (e.innerText || e.value || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return {
      path: location.pathname,
      links: [...document.querySelectorAll("a[href]")].map(a => [t(a), a.getAttribute("href")]).filter(x => x[0] && !/^(mailto|tel):/.test(x[1])).slice(0, 60),
      buttons: [...new Set([...document.querySelectorAll("button, [role=button]")].map(t).filter(Boolean))].slice(0, 40),
      tables: [...document.querySelectorAll("table")].map(tb => [...tb.querySelectorAll("th")].map(t)).slice(0, 5)
    };
  });
  console.log("TAKRAR_PAGE", label, mask(JSON.stringify(info)));
  return info;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  try {
    await login(page);
    if (process.env.TAKRAR_EXPLORE === "1") {
      const home = await describe(page, "home");
      // صفحات الطلبات/الاشتراكات من القائمة
      const want = home.links.filter(([txt, href]) => /order|subscri|طلب|اشتراك|report|تقرير|payment|مدفوع/i.test(txt + " " + href)).slice(0, 6);
      for (const [txt, href] of want) {
        try { await page.goto(new URL(href, page.url()).href, { waitUntil: "networkidle", timeout: 45000 }); await page.waitForTimeout(2500); await describe(page, txt); }
        catch (e) { console.log("TAKRAR_PAGE_FAIL", mask(txt), mask(e.message).slice(0, 80)); }
      }
      return;
    }
    // السحب: صفحة الطلبات → زر التصدير → ملف orders.xlsx
    if (!config.ordersUrl) throw new Error("ordersUrl ناقص بالإعدادات — شغّل explore أول");
    await page.goto(new URL(config.ordersUrl, config.url).href, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(3000);
    const btn = page.locator(`button:has-text("${config.exportText || "Export"}"), a:has-text("${config.exportText || "Export"}")`).first();
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), btn.click()]);
    const file = path.join(__dirname, "orders.xlsx");
    await dl.saveAs(file);
    const days = JSON.parse(execFileSync("python3", ["-I", path.join(__dirname, "parse_orders.py"), file]).toString());
    // آخر ٤٥ يوم بس (الأقدم ما يتغيّر) — يوم بيوم، فيستبدل اللي قبله لنفس اليوم
    const since = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
    let sent = 0;
    for (const [date, rows] of Object.entries(days)) { if (date >= since) { await sendDay(date, rows); sent++; } }
    fs.rmSync(file, { force: true });
    console.log("TAKRAR_OK days_sent=" + sent);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error("TAKRAR_FAIL", mask(e.message)); process.exit(1); });
