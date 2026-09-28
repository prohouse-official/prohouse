// اختبار دخان: يفتح التطبيق بوضع التجربة (بيانات وهمية، ما يلمس السيرفر)، يدخل كمالك،
// ويمر على كل الشاشات — أي خطأ جافاسكربت يوقف التعديل قبل ما يوصل للموظفين.
// node tests/smoke.js   (يحتاج سيرفر محلي: python3 -m http.server 8765)
let pw;
try { pw = require("playwright"); } catch (e) { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.env.SMOKE_URL || "http://localhost:8765";

(async () => {
  const browser = await pw.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Riyadh" })).newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.goto(BASE + "/?demo=1", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.fill("#loginPinInput", "1111");
  await page.click("#loginSubmitBtn");
  await page.waitForTimeout(2500);
  const tabs = await page.evaluate(() => [...new Set([...document.querySelectorAll("[data-tab]")].map(e => e.dataset.tab))]);
  for (const t of tabs) {
    await page.evaluate(x => setActiveTab(x), t);
    await page.waitForTimeout(900);
  }
  // تنقّل سريع بين الأيام: الشاشة لازم تنتهي على آخر يوم انطلب
  await page.evaluate(() => setActiveTab("receiving"));
  const rec = await page.evaluate(async () => {
    const d = todayStr();
    loadReceivingData(addDaysStr(d, -1)); loadReceivingData(addDaysStr(d, -2));
    await loadReceivingData(d);
    return { shown: currentReceivingDate, key: receivingDataKey && receivingDataKey.date, want: d };
  });
  await browser.close();
  const problems = [...errors];
  if (tabs.length < 10) problems.push("شاشات قليلة: " + tabs.length);
  if (rec.shown !== rec.want || rec.key !== rec.want) problems.push("تاريخ الاستلام بعد التنقل غلط: " + JSON.stringify(rec));
  if (problems.length) { console.error("✗ smoke failed:\n" + problems.join("\n")); process.exit(1); }
  console.log(`✓ smoke passed (${tabs.length} screens)`);
})().catch(e => { console.error(e); process.exit(1); });
