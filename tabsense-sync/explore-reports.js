// Read-only: lists TabSense report pages and prints payment/summary tables for yesterday.
// Runs only on non-main branches (see workflow) to find where cash vs card sales live.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { PAYMENT_REPORT_URL, extractPaymentRows } = require("./payments");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const BASE = "https://app.tabsense.ai/prohouse/dashboard";
const INTERESTING = process.env.EXPLORE_MODE === "modifiers"
  ? /modifier|option|addon|add-on|extra|topping|إضاف|اضاف|خيار|تعديل/i
  : /payment|pay|method|tender|summary|shift|close|cash|drawer|دفع|الدفع|ملخص|وردية|نقد|كاش|اغلاق|إغلاق|صندوق/i;

function yesterdayDisplay() {
  const d = new Date(Date.now() - 86400000);
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d).split("-");
  return `${m}/${day}/${y}`;
}

async function dumpTables(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll("table")).slice(0, 3).map(t => ({
    headers: Array.from(t.querySelectorAll("thead th, thead td")).map(x => x.innerText.trim()),
    rows: Array.from(t.querySelectorAll("tbody tr")).slice(0, 15).map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.innerText.trim()))
  })));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"], input[name="email"]', config.email);
    await page.fill('input[type="password"], input[name="password"]', config.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
      page.click('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("Login")')
    ]);

    if (process.env.EXPLORE_MODE !== "modifiers") {
    // اختبار استخراج طرق الدفع بنفس طريقة سكربت السحب (بالواجهة العربية)
    await page.goto(PAYMENT_REPORT_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const ar = page.locator('a:has-text("ع"), button:has-text("ع")').first();
    if (await ar.isVisible().catch(() => false)) { await ar.click().catch(() => {}); await page.waitForTimeout(2000); }
    await page.evaluate((d) => {
      const input = document.querySelector('input[name="datefilter"]');
      if (input && window.$ && $(input).data("daterangepicker")) {
        const picker = $(input).data("daterangepicker"); picker.setStartDate(d); picker.setEndDate(d); $(input).val(d + " - " + d);
      }
      const btn = document.querySelector("#applyChartFilter") || document.querySelector("#applyChartFilterBlur") || document.querySelector(".applyBtn");
      if (btn) btn.click();
    }, yesterdayDisplay());
    await page.waitForTimeout(3500);
    const headers = await page.evaluate(() => Array.from(document.querySelectorAll("table thead th")).map(th => th.innerText.trim()));
    console.log("EXPLORE_PAYMENTS_AR", JSON.stringify({ headers, rows: await extractPaymentRows(page) }));
    if (process.env.EXPLORE_PAYMENTS_ONLY === "1") return;
    }

    const links = new Map();
    for (const start of [`${BASE}/reports/sales-by-category`, BASE]) {
      await page.goto(start, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(2000);
      (await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map(a => [a.href, a.innerText.trim().replace(/\s+/g, " ")])))
        .filter(([href]) => href.includes("/dashboard/")).forEach(([href, text]) => { if (!links.has(href)) links.set(href, text); });
    }
    console.log("EXPLORE_LINKS", JSON.stringify([...links.entries()]));

    const date = yesterdayDisplay();
    const targets = [...links.entries()].filter(([href, text]) => INTERESTING.test(href) || INTERESTING.test(text)).slice(0, 8);
    for (const [href, text] of targets) {
      await page.goto(href, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.evaluate((d) => {
        const input = document.querySelector('input[name="datefilter"]');
        if (!input) return;
        if (window.$ && $(input).data("daterangepicker")) {
          const picker = $(input).data("daterangepicker");
          picker.setStartDate(d); picker.setEndDate(d); $(input).val(d + " - " + d);
        } else { input.value = d + " - " + d; input.dispatchEvent(new Event("change", { bubbles: true })); }
        const btn = document.querySelector("#applyChartFilter") || document.querySelector("#applyChartFilterBlur") || document.querySelector(".applyBtn");
        if (btn) btn.click();
      }, date);
      await page.waitForTimeout(3500);
      const cards = await page.evaluate(() => Array.from(document.querySelectorAll(".card, .widget, .info-box, .small-box")).slice(0, 12).map(c => c.innerText.trim().replace(/\s+/g, " ").slice(0, 160)));
      console.log("EXPLORE_REPORT", JSON.stringify({ href, text, date, tables: await dumpTables(page), cards }));
    }
  } catch (e) {
    console.error("EXPLORE_FAILED", e.message);
  } finally {
    await browser.close();
  }
})();
