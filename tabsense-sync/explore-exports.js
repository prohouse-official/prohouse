// قراءة فقط: يدوّر على صفحة "الملخص" وصفحة "الطلبات" بتابسنس وأزرار التصدير فيها.
// المستودع عام: ما يطبع ولا رقم مبيعات — بس أسماء الروابط والأزرار، وأي رقم ينستبدل بـ #.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const BASE = "https://app.tabsense.ai/prohouse/dashboard";
const WANT = /refund|return|void|cancel|credit|مرتجع|مسترد|استرجاع|مردود|ملغ|إلغاء|order|summary|invoice|receipt|z-?report|طلب|ملخص|فاتور|فواتير/i;
const EXPORT = /export|download|excel|xlsx|csv|pdf|print|تصدير|تحميل|تنزيل|طباعة|اكسل|إكسل/i;
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().replace(/\d/g, "#").slice(0, 60);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true })).newPage();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"], input[name="email"]', config.email);
    await page.fill('input[type="password"], input[name="password"]', config.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
      page.click('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("Login")')
    ]);

    if (process.env.EXPLORE_MODE === "billing") {
      await exploreBilling(page, BASE, ["", "/settings", "/billing", "/subscription", "/invoices", "/account", "/profile", "/settings/billing"]);
      return;
    }
    const links = new Map();
    for (const start of [BASE, `${BASE}/reports/sales-by-category`, `${BASE}/orders`]) {
      await page.goto(start, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(2000);
      (await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map(a => [a.href, a.innerText])))
        .filter(([href]) => href.includes("/dashboard/")).forEach(([href, text]) => { if (!links.has(href)) links.set(href, text); });
    }
    console.log("EXPLORE_LINKS", JSON.stringify([...links.entries()].map(([h, t]) => [h.replace(/\d{4,}/g, "#"), clean(t)])));

    const targets = [...links.entries()].filter(([h, t]) => WANT.test(h) || WANT.test(t)).slice(0, 16);
    for (const [href, text] of targets) {
      await page.goto(href, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(2500);
      const info = await page.evaluate((src) => {
        const re = new RegExp(src, "i");
        const els = Array.from(document.querySelectorAll("a, button, [role=button], .dropdown-item, input[type=button], input[type=submit]"));
        return {
          title: document.title,
          hasDate: !!document.querySelector('input[name="datefilter"]'),
          exports: els.filter(e => re.test((e.innerText || e.value || "") + " " + (e.getAttribute("href") || "") + " " + (e.className || "") + " " + (e.id || "")))
            .map(e => ({ tag: e.tagName, text: e.innerText || e.value || "", href: e.getAttribute("href") || "", id: e.id || "", cls: String(e.className || "").slice(0, 80) })),
          buttons: els.filter(e => e.tagName === "BUTTON").map(e => e.innerText || e.id || "").filter(Boolean).slice(0, 30),
          tables: Array.from(document.querySelectorAll("table")).map(t => Array.from(t.querySelectorAll("thead th")).map(th => th.innerText.trim()).slice(0, 20))
        };
      }, EXPORT.source);
      console.log("EXPLORE_PAGE", JSON.stringify({
        href: href.replace(/\d{4,}/g, "#"), text: clean(text), title: clean(info.title), hasDate: info.hasDate,
        exports: info.exports.map(e => ({ ...e, text: clean(e.text), href: clean(e.href), cls: clean(e.cls) })),
        buttons: info.buttons.map(clean), tables: info.tables.map(h => h.map(clean))
      }));
    }
  } catch (e) {
    console.error("EXPLORE_FAILED", clean(e.message));
  } finally {
    await browser.close();
  }
})();

// ---- استكشاف فاتورة الاشتراك (قراءة بس): يدوّر على صفحة الفوترة/الاشتراك/الفواتير ويطبع أسماء الروابط وعناوين الجداول بس ----
// المستودع عام: أي رقم ينستبدل بـ # — ما ينطبع مبلغ ولا رقم فاتورة.
async function exploreBilling(page, base, guesses) {
  const BILL = /billing|invoice|subscription|subscribe|plan|payment-history|license|فوتر|فاتور|فواتير|اشتراك|الباقة|الخطة|ترخيص/i;
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().replace(/\d/g, "#").slice(0, 70);
  const seen = new Map();
  const grab = async () => (await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map(a => [a.href, a.innerText || a.title || ""])))
    .forEach(([h, t]) => { if (!seen.has(h)) seen.set(h, t); });
  await grab();
  for (const g of guesses) {
    await page.goto(base + g, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await grab();
  }
  const hits = [...seen.entries()].filter(([h, t]) => BILL.test(h) || BILL.test(t));
  console.log("BILLING_LINKS", JSON.stringify(hits.map(([h, t]) => [clean(h), clean(t)])));
  const pages = [...new Set([...hits.map(([h]) => h), ...guesses.map(g => base + g)])].slice(0, 14);
  for (const href of pages) {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => ({
      url: location.href, title: document.title,
      heads: Array.from(document.querySelectorAll("h1,h2,h3")).map(e => e.innerText).slice(0, 10),
      tables: Array.from(document.querySelectorAll("table")).map(t => Array.from(t.querySelectorAll("th")).map(th => th.innerText.trim()).slice(0, 12)),
      rows: document.querySelectorAll("table tbody tr").length,
      buttons: Array.from(document.querySelectorAll("a,button")).map(e => e.innerText || e.title || "").filter(t => /download|pdf|invoice|view|تحميل|تنزيل|عرض|فاتور|طباعة|print/i.test(t)).slice(0, 15)
    }));
    console.log("BILLING_PAGE", JSON.stringify({ from: clean(href), url: clean(info.url), title: clean(info.title), heads: info.heads.map(clean), tables: info.tables.map(r => r.map(clean)), rows: info.rows, buttons: info.buttons.map(clean) }));
  }
}
