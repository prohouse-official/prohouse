// تقريرين عبداللطيف جميل اليوميين — نفس ملفات تابسنس بالضبط بدون أي تعديل:
//   ١) الملخص PDF  (Reports → Summary → زر PDF)
//   ٢) الطلبات Excel (Orders → All Orders → زر Excel)
// المستودع عام: ما نطبع أرقام مبيعات بالسجل، وما نرفع الملفات كـ artifacts.
const fs = require("fs");
const path = require("path");

const BASE = "https://app.tabsense.ai/prohouse/dashboard";
const SUMMARY_URL = `${BASE}/reports/summary`;
const ORDERS_URL = `${BASE}/orders`;
const mask = (s) => String(s || "").replace(/\d/g, "#");

// "2026-09-15" → "09/15/2026" (صيغة منتقي التاريخ بتابسنس)
const pickerDate = (iso) => { const [y, m, d] = iso.split("-"); return `${m}/${d}/${y}`; };

async function useArabic(page) {
  const ar = page.locator('a:has-text("ع"), button:has-text("ع")').first();
  if (await ar.isVisible().catch(() => false)) { await ar.click().catch(() => {}); await page.waitForTimeout(2000); }
}

async function setDate(page, iso) {
  await page.evaluate((d) => {
    const el = window.$ && $('input[name="datefilter"]');
    if (el && el.length && el.data("daterangepicker")) {
      const picker = el.data("daterangepicker");
      picker.setStartDate(d); picker.setEndDate(d); el.val(d + " - " + d);
      el.trigger("apply.daterangepicker", [picker]);
    } else {
      const input = document.querySelector('input[name="datefilter"]');
      if (input) { input.value = d + " - " + d; input.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    const btn = document.querySelector("#applyChartFilter") || document.querySelector("#applyChartFilterBlur") || document.querySelector(".applyBtn");
    if (btn) btn.click();
  }, pickerDate(iso));
  await page.waitForTimeout(4000);
}

// زر التنزيل: إما ينزّل الملف مباشرة، أو يفتح تبويب فيه الملف — نتعامل مع الحالتين
async function captureDownload(page, click, outPath) {
  const ctx = page.context();
  const dl = page.waitForEvent("download", { timeout: 60000 }).then(d => ({ d })).catch(() => null);
  const pop = ctx.waitForEvent("page", { timeout: 60000 }).then(p => ({ p })).catch(() => null);
  await click();
  const first = await Promise.race([dl, pop]);
  if (first && first.d) {
    await first.d.saveAs(outPath);
    return first.d.suggestedFilename();
  }
  if (first && first.p) {
    const p = first.p;
    const inner = await Promise.race([p.waitForEvent("download", { timeout: 60000 }).then(d => ({ d })).catch(() => null), p.waitForLoadState("load").then(() => null).catch(() => null)]);
    if (inner && inner.d) { await inner.d.saveAs(outPath); await p.close().catch(() => {}); return inner.d.suggestedFilename(); }
    const url = p.url();
    const res = await ctx.request.get(url);
    fs.writeFileSync(outPath, await res.body());
    await p.close().catch(() => {});
    return decodeURIComponent(url.split("/").pop().split("?")[0] || "file");
  }
  const late = await dl;
  if (late && late.d) { await late.d.saveAs(outPath); return late.d.suggestedFilename(); }
  throw new Error("ما نزل ملف");
}

async function downloadSummaryPdf(page, iso, dir) {
  await page.goto(SUMMARY_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await useArabic(page);
  await setDate(page, iso);
  const out = path.join(dir, `summary-${iso}.pdf`);
  const name = await captureDownload(page, () => page.click("#downloadPdfDaily"), out);
  return { path: out, name };
}

async function downloadOrdersExcel(page, iso, dir) {
  await page.goto(ORDERS_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await useArabic(page);
  await setDate(page, iso);
  // جدول الطلبات: نعرض كل الصفوف قبل التصدير (لو الجدول مقسّم صفحات)
  await page.evaluate(() => {
    const sel = document.querySelector(".dataTables_length select");
    if (sel) { const all = [...sel.options].find(o => o.value === "-1") || [...sel.options].pop(); sel.value = all.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await page.waitForTimeout(3000);
  const out = path.join(dir, `orders-${iso}.xlsx`);
  const name = await captureDownload(page, () => page.locator("button.buttons-excel").first().click(), out);
  return { path: out, name };
}

async function downloadAljReports(page, iso, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const summary = await downloadSummaryPdf(page, iso, dir);
  const orders = await downloadOrdersExcel(page, iso, dir);
  return { summary, orders };
}

module.exports = { downloadAljReports, mask };

// تجربة على فرع غير main: ينزّل الملفين ليوم معيّن ويطبع بس معلومات بدون أرقام مبيعات
if (require.main === module) {
  const { chromium } = require("playwright");
  const { execFileSync } = require("child_process");
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  const iso = process.env.ALJ_DATE || "2026-09-15";
  (async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true })).newPage();
    try {
      await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
      await page.fill('input[type="email"], input[name="email"]', config.email);
      await page.fill('input[type="password"], input[name="password"]', config.password);
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
        page.click('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("Login")')]);
      const dir = path.join(__dirname, "alj-out");
      const r = await downloadAljReports(page, iso, dir);
      const pdf = fs.readFileSync(r.summary.path);
      const pdfPages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
      const xlsx = r.orders.path;
      let rows = -1, headers = [];
      try {
        const sheet = execFileSync("unzip", ["-p", xlsx, "xl/worksheets/sheet1.xml"]).toString("utf8");
        rows = (sheet.match(/<row[ >]/g) || []).length;
        const strings = execFileSync("unzip", ["-p", xlsx, "xl/sharedStrings.xml"]).toString("utf8");
        headers = [...strings.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].slice(0, 15).map(m => m[1]);
      } catch (e) { headers = ["(unzip failed) " + mask(e.message)]; }
      const expect = Number(process.env.ALJ_EXPECT_ROWS || 0);
      console.log("ALJ_TEST", JSON.stringify({
        summary: { name: mask(r.summary.name), bytes: pdf.length, isPdf: pdf.slice(0, 4).toString() === "%PDF", pages: pdfPages },
        orders: { name: mask(r.orders.name), bytes: fs.statSync(xlsx).size, rowsMatchExpected: expect ? rows === expect : null, headers: headers.map(mask) }
      }));
    } catch (e) {
      console.error("ALJ_TEST_FAILED", mask(e.message));
      process.exitCode = 1;
    } finally {
      await browser.close();
    }
  })();
}
