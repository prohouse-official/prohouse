// كيتا (Keeta): دخول لوحة التاجر لكل فرع (KEETA_CONFIG_JSON = {"branches":[{"name","email","password"}]}).
// KEETA_EXPLORE=1 → استكشاف بس: شكل صفحة الدخول، الروابط، عناوين الصفحات والجداول، ومسارات طلبات الـ API اللي تستخدمها اللوحة.
// المستودع عام: أي رقم ينستبدل بـ # — ما ينطبع مبلغ ولا بيانات عملاء ولا الإيميل.
const { chromium } = require("playwright");

const cfg = JSON.parse(process.env.KEETA_CONFIG || "{}");
const BASE = "https://merchant.mykeeta.com";
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>").replace(/\d/g, "#").slice(0, 90);

async function login(page, br) {
  await page.goto(BASE + "/m/web/app/home", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  const form = await page.evaluate(() => ({
    url: location.href,
    inputs: Array.from(document.querySelectorAll("input")).map(i => [i.type, i.name, i.placeholder].join("|")),
    buttons: Array.from(document.querySelectorAll("button,[role=tab],a")).map(b => b.innerText).filter(Boolean).slice(0, 25)
  }));
  console.log("LOGIN_PAGE", JSON.stringify({ url: clean(form.url), inputs: form.inputs.map(clean), buttons: form.buttons.map(clean) }));
  // تبويب الدخول بالإيميل إذا موجود
  const emailTab = page.locator('text=/email|البريد|الإيميل/i').first();
  if (await emailTab.isVisible().catch(() => false)) { await emailTab.click().catch(() => {}); await page.waitForTimeout(1000); }
  const email = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="mail" i], input[placeholder*="بريد"], input[type="text"]').first();
  const pass = page.locator('input[type="password"]').first();
  if (!(await email.isVisible().catch(() => false)) || !(await pass.isVisible().catch(() => false))) {
    console.log("LOGIN_FIELDS_NOT_FOUND"); return false;
  }
  await email.fill(br.email); await pass.fill(br.password);
  // موافقة الشروط إذا فيه checkbox
  const cb = page.locator('input[type="checkbox"]').first();
  if (await cb.isVisible().catch(() => false)) await cb.check().catch(() => {});
  const btn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Login"), button:has-text("Sign in"), button:has-text("تسجيل الدخول"), button:has-text("دخول")').first();
  await btn.click().catch(() => {});
  await page.waitForTimeout(8000);
  const after = await page.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 400) }));
  console.log("AFTER_LOGIN", JSON.stringify({ url: clean(after.url), text: clean(after.text) }));
  return !/login|signin|passport/i.test(after.url);
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
