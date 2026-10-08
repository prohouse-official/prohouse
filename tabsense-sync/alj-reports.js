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

// التصدير بتابسنس ما ينزّل الملف مباشرة: يجهّزه بصفحة "سجل التصدير" وينزل من هناك.
// فنطلب التصدير، وننتظر لين يطلع سطر جديد (رقم أكبر من آخر سطر قبل الطلب) جاهز، وننزّله زي ما هو.
const HISTORY_URL = `${BASE}/reports/export-history`;

async function readHistory(page) {
  // "load" بدل "networkidle": صفحة السجل أحياناً تضل تحمّل أشياء جانبية وتعلّق الانتظار
  await page.goto(HISTORY_URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector("table tbody tr", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return page.evaluate(() => [...document.querySelectorAll("table tbody tr")].map(tr => {
    const tds = [...tr.querySelectorAll("td")].map(td => td.innerText.trim());
    const a = tr.querySelector('a[href*="/export-history/"][href$="/download"]');
    const m = a && a.getAttribute("href").match(/export-history\/(\d+)\/download/);
    return { id: m ? Number(m[1]) : 0, href: a ? a.href : "", text: tds.join(" | ") };
  }).filter(r => r.id));
}

async function exportViaHistory(page, trigger, nameRe, outPath) {
  // سجل التصدير نقراه بتبويب لحاله — صفحة التقرير تضل زي ما هي عشان نضغط زرها
  const hp = await page.context().newPage();
  try {
    const before = Math.max(0, ...(await readHistory(hp)).map(r => r.id));
    await trigger();
    // الزر يفتح سجل التصدير بتبويب جديد — نسكّره
    await page.waitForTimeout(3000);
    for (const p of page.context().pages()) if (p !== page && p !== hp) await p.close().catch(() => {});
    for (let i = 0; i < 30; i++) {
      const row = (await readHistory(hp)).find(r => r.id > before && nameRe.test(r.text));
      if (row && /جاهز|ready|completed/i.test(row.text)) {
        const res = await page.context().request.get(row.href);
        if (!res.ok()) throw new Error("تنزيل من سجل التصدير فشل [" + res.status() + "]");
        fs.writeFileSync(outPath, await res.body());
        const cd = res.headers()["content-disposition"] || "";
        const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
        return m ? decodeURIComponent(m[1]) : path.basename(outPath);
      }
      if (row && /فشل|failed|error/i.test(row.text)) throw new Error("التصدير فشل بتابسنس");
      await hp.waitForTimeout(5000);
    }
    throw new Error("التصدير ما جهز خلال دقيقتين ونص");
  } finally {
    await hp.close().catch(() => {});
  }
}

// تشخيص (تجربة بس): وش بيصير لما ينضغط الزر — روابط الطلبات ونوعها، بدون أرقام
async function diagnose(page, selector) {
  const reqs = [];
  const onReq = (r) => reqs.push(r.method() + " " + mask(r.url()).slice(0, 160));
  const onRes = async (r) => { const ct = r.headers()["content-type"] || ""; if (!/image|font|css/.test(ct)) reqs.push("RES " + r.status() + " " + ct.slice(0, 40) + " " + mask(r.url()).slice(0, 120)); };
  page.on("request", onReq); page.on("response", onRes);
  const info = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const jq = window.$ && $._data ? ($._data(el, "events") || {}) : {};
    const handlers = Object.values(jq).flat().map(h => String(h.handler).slice(0, 600));
    return { found: true, visible: !!(el.offsetWidth || el.offsetHeight), onclick: String(el.getAttribute("onclick") || "").slice(0, 300), handlers };
  }, selector);
  try { await page.locator(selector).first().click({ force: true, timeout: 5000 }); } catch (e) { reqs.push("CLICK_ERR " + mask(e.message).slice(0, 100)); }
  await page.waitForTimeout(8000);
  page.off("request", onReq); page.off("response", onRes);
  return { selector, ...info, handlers: (info.handlers || []).map(mask), requests: reqs.slice(0, 25), pages: page.context().pages().map(p => mask(p.url()).slice(0, 120)) };
}

async function downloadSummaryPdf(page, iso, dir) {
  await page.goto(SUMMARY_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await useArabic(page);
  await setDate(page, iso);
  const out = path.join(dir, `summary-${iso}.pdf`);
  const name = await exportViaHistory(page, () => page.click("#downloadPdfDaily"), /ملخص|summary/i, out);
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
  const name = await exportViaHistory(page, () => page.locator("button.buttons-excel").first().click(), /الطلبات|orders/i, out);
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
      if (process.env.ALJ_DIAG === "1") {
        await page.goto(SUMMARY_URL, { waitUntil: "networkidle" }); await page.waitForTimeout(2500); await useArabic(page); await setDate(page, iso);
        console.log("ALJ_DIAG_SUMMARY", JSON.stringify(await diagnose(page, "#downloadPdfDaily")));
        await page.goto(ORDERS_URL, { waitUntil: "networkidle" }); await page.waitForTimeout(2500); await useArabic(page); await setDate(page, iso);
        console.log("ALJ_DIAG_ORDERS", JSON.stringify(await diagnose(page, "button.buttons-excel")));
        await page.waitForTimeout(15000);
        await page.goto(`${BASE}/reports/export-history`, { waitUntil: "networkidle" }); await page.waitForTimeout(3000);
        const hist = await page.evaluate(() => {
          const t = document.querySelector("table");
          return {
            headers: t ? [...t.querySelectorAll("thead th")].map(x => x.innerText.trim()) : [],
            rows: t ? [...t.querySelectorAll("tbody tr")].slice(0, 6).map(tr => [...tr.querySelectorAll("td")].map(td => {
              const a = td.querySelector("a, button");
              return td.innerText.trim().slice(0, 60) + (a ? " [" + a.tagName + " " + (a.getAttribute("href") || "") + " " + (a.className || "") + "]" : "");
            })) : []
          };
        });
        console.log("ALJ_DIAG_HISTORY", mask(JSON.stringify(hist)));
        return;
      }
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
      const crypto = require("crypto");
      let sheetSha = "";
      try { sheetSha = crypto.createHash("sha256").update(execFileSync("unzip", ["-p", xlsx, "xl/worksheets/sheet1.xml"])).digest("hex").slice(0, 16); } catch (e) {}
      const [yy, mm, dd] = iso.split("-");
      const pdfHasDate = pdf.toString("latin1").includes(`${dd}-${mm}-${yy}`);
      let dates = [];
      try {
        const strs = execFileSync("unzip", ["-p", xlsx, "xl/sharedStrings.xml"]).toString("utf8");
        const sheet = execFileSync("unzip", ["-p", xlsx, "xl/worksheets/sheet1.xml"]).toString("utf8");
        const all = [...(strs + sheet).matchAll(/(20\d\d-\d\d-\d\d)[ T]\d\d:/g)].map(m => m[1]);
        dates = [...new Set(all)].slice(0, 10);
      } catch (e) {}
      const filterInfo = await page.evaluate(() => {
        const inp = document.querySelector('input[name="datefilter"]');
        return { val: inp ? inp.value : "", cls: inp ? inp.className : "", others: [...document.querySelectorAll("input")].filter(i => /date|from|to|start|end/i.test(i.name + i.id + i.className)).map(i => (i.name || i.id) + "=" + i.value).slice(0, 8) };
      });
      console.log("ALJ_DATES", JSON.stringify({ dates, rowsDelta: expect ? Math.sign(rows - expect) : null, filterInfo }));
      console.log("ALJ_TEST", JSON.stringify({
        summary: { name: mask(r.summary.name), bytes: pdf.length, isPdf: pdf.slice(0, 4).toString() === "%PDF", pages: pdfPages, pdfHasDate },
        orders: { name: mask(r.orders.name), bytes: fs.statSync(xlsx).size, rowsMatchExpected: expect ? rows === expect : null, sheetSha, headers: headers.map(mask) }
      }));
    } catch (e) {
      console.error("ALJ_TEST_FAILED", mask(e.message));
      process.exitCode = 1;
    } finally {
      await browser.close();
    }
  })();
}
