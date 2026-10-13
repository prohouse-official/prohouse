// كيتا (Keeta): دخول لوحة التاجر لكل فرع (KEETA_CONFIG_JSON = {"branches":[{"name","email","password"}]}).
// KEETA_EXPLORE=1 → استكشاف بس: شكل صفحة الدخول، الروابط، عناوين الصفحات والجداول، ومسارات طلبات الـ API اللي تستخدمها اللوحة.
// المستودع عام: أي رقم ينستبدل بـ # — ما ينطبع مبلغ ولا بيانات عملاء ولا الإيميل.
const { chromium } = require("playwright");

const cfg = JSON.parse(process.env.KEETA_CONFIG || "{}");
const BASE = "https://merchant.mykeeta.com";
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>").replace(/\d/g, "#").slice(0, 90);

const snap = (page) => page.evaluate(() => ({
  url: location.href,
  inputs: Array.from(document.querySelectorAll("input")).filter(i => i.offsetParent).map(i => [i.type, i.name, i.placeholder].join("|")),
  buttons: Array.from(document.querySelectorAll("button,[role=button]")).filter(b => b.offsetParent).map(b => b.innerText).filter(Boolean).slice(0, 20),
  text: document.body.innerText.slice(0, 300)
}));
const show = (tag, f) => console.log(tag, JSON.stringify({ url: clean(f.url), inputs: f.inputs.map(clean), buttons: f.buttons.map(clean), text: clean(f.text) }));

async function clickNext(page) {
  const btn = page.locator('button:visible').filter({ hasText: /^(التالي|متابعة|استمرار|تسجيل الدخول|دخول|Next|Continue|Log ?in|Sign ?in)$/i }).first();
  if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); return true; }
  const any = page.locator('button[type="submit"]:visible').first();
  if (await any.isVisible().catch(() => false)) { await any.click().catch(() => {}); return true; }
  await page.keyboard.press("Enter").catch(() => {});
  return false;
}

async function login(page, br) {
  const region = cfg.region || "SA";
  await page.goto(`${BASE}/pc/login?service=merchants&locale=ar&region=${region}&loginRegion=${region}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  show("LOGIN_PAGE", await snap(page));
  const email = page.locator('input:visible').first();
  if (!(await email.isVisible().catch(() => false))) { console.log("NO_EMAIL_FIELD"); return false; }
  await email.fill(br.email);
  const cb = page.locator('input[type="checkbox"]:visible').first();
  if (await cb.isVisible().catch(() => false)) await cb.check().catch(() => {});
  await clickNext(page);
  await page.waitForTimeout(5000);
  const step2 = await snap(page);
  show("STEP2", step2);
  const pass = page.locator('input[type="password"]:visible').first();
  if (!(await pass.isVisible().catch(() => false))) {
    // ممكن فيه زر «الدخول بكلمة المرور» بدل الكود
    const pw = page.locator('text=/كلمة المرور|password/i').first();
    if (await pw.isVisible().catch(() => false)) { await pw.click().catch(() => {}); await page.waitForTimeout(3000); show("STEP2B", await snap(page)); }
  }
  if (!(await pass.isVisible().catch(() => false))) { console.log("NO_PASSWORD_FIELD (maybe OTP)"); return false; }
  await pass.fill(br.password);
  const cb2 = page.locator('input[type="checkbox"]:visible').first();
  if (await cb2.isVisible().catch(() => false)) await cb2.check().catch(() => {});
  await clickNext(page);
  await page.waitForTimeout(9000);
  const after = await snap(page);
  show("AFTER_LOGIN", after);
  return !/\/login/i.test(after.url);
}

async function explore(page) {
  const apis = new Set();
  page.on("request", (r) => { if (["xhr", "fetch"].includes(r.resourceType())) apis.add(r.method() + " " + r.url().split("?")[0].replace(/\d{3,}/g, "#")); });
  const seen = new Map();
  const grab = async () => (await page.evaluate(() => Array.from(document.querySelectorAll("a[href], [role=menuitem], li")).map(a => [a.href || "", (a.innerText || "").split("\n")[0]])))
    .forEach(([h, t]) => { const k = h || t; if (k && !seen.has(k)) seen.set(k, t); });
  await grab();
  console.log("MENU", JSON.stringify([...seen.entries()].slice(0, 80).map(([h, t]) => [clean(h), clean(t)])));
  const WANT = /order|bill|financ|settle|statement|invoice|report|revenue|sales|payout|wallet|طلب|فاتور|مالي|تسوي|تقرير|مبيعات|كشف|محفظ/i;
  const targets = [...seen.entries()].filter(([h, t]) => h.startsWith(BASE) && (WANT.test(h) || WANT.test(t))).slice(0, 14);
  for (const [href, text] of targets) {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const info = await page.evaluate(() => ({
      url: location.href, title: document.title,
      heads: Array.from(document.querySelectorAll("h1,h2,h3,.title")).map(e => e.innerText).slice(0, 10),
      tables: Array.from(document.querySelectorAll("table")).map(t => Array.from(t.querySelectorAll("th")).map(th => th.innerText.trim()).slice(0, 15)),
      buttons: Array.from(document.querySelectorAll("button,a")).map(e => e.innerText).filter(t => /export|download|pdf|excel|invoice|تصدير|تحميل|تنزيل|فاتور/i.test(t)).slice(0, 15)
    }));
    console.log("PAGE", JSON.stringify({ from: clean(text), url: clean(info.url), title: clean(info.title), heads: info.heads.map(clean), tables: info.tables.map(r => r.map(clean)), buttons: info.buttons.map(clean) }));
  }
  console.log("API_CALLS", JSON.stringify([...apis].slice(0, 120)));
}

(async () => {
  const branches = cfg.branches || [];
  if (!branches.length) throw new Error("KEETA_CONFIG_JSON فاضي أو ما فيه branches");
  const browser = await chromium.launch({ headless: true });
  try {
    // الاستكشاف يكفي على أول فرع — نتأكد بس إن الثاني يدخل
    for (const [i, br] of branches.entries()) {
      const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 }, locale: "ar-SA" })).newPage();
      console.log(`=== فرع ${i + 1}`);
      const ok = await login(page, br);
      console.log("LOGIN_OK", ok);
      if (ok && i === 0 && process.env.KEETA_EXPLORE) await explore(page);
      await page.context().close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error("ERROR:", clean(e.message)); process.exit(1); });
