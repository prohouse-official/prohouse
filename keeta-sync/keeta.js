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
  buttons: Array.from(document.querySelectorAll("body *")).filter(e => e.offsetParent && e.children.length <= 2 && (e.tagName === "BUTTON" || e.getAttribute("role") === "button" || getComputedStyle(e).cursor === "pointer") && (e.innerText || "").trim().length < 30)
    .map(e => e.tagName.toLowerCase() + ":" + (e.innerText || "").trim() + (e.disabled || /disabled/.test(e.className) ? "(disabled)" : "")).filter((t, i, a) => a.indexOf(t) === i).slice(0, 25),
  checks: Array.from(document.querySelectorAll("input[type=checkbox], [role=checkbox], [class*=checkbox]")).filter(e => e.offsetParent).length,
  text: document.body.innerText.slice(0, 300)
}));
const show = (tag, f) => console.log(tag, JSON.stringify({ url: clean(f.url), inputs: f.inputs.map(clean), buttons: f.buttons.map(clean), checks: f.checks, text: clean(f.text) }));

async function clickNext(page) {
  const btn = page.locator('button:visible, [role=button]:visible, div:visible, span:visible').filter({ hasText: /^\s*(التالي|متابعة|استمرار|تسجيل الدخول|دخول|Next|Continue|Log ?in|Sign ?in)\s*$/i }).last();
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
  const cb = page.locator('input[type="checkbox"], [role=checkbox], [class*=checkbox]').first();
  if (await cb.count()) await cb.click({ force: true }).catch(() => {});
  show("FILLED", await snap(page));
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

function shape(v, d = 0) {
  if (d > 5) return "…";
  if (Array.isArray(v)) return v.length ? [shape(v[0], d + 1), `(${v.length})`] : [];
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).slice(0, 70).map(k => [k, shape(v[k], d + 1)]));
  return v === null ? "null" : typeof v;
}

async function explore(page, apis) {
  // شكل طلب/رد الـ API المهمة (أسماء الحقول وأنواعها بس — بدون قيم)
  page.on("response", async (res) => {
    const u = res.url();
    if (!/\/api\/(order\/history\/getOrders|settlement|bill|invoice|finance|data\/shop\/download-center)/.test(u)) return;
    let body = null; try { body = await res.json(); } catch (e) {}
    const req = res.request().postData() || "";
    let reqShape = req; try { reqShape = JSON.stringify(shape(JSON.parse(req))); } catch (e) { reqShape = clean(req).slice(0, 200); }
    // أسماء البنود (بدون مبالغ): رموز الرسوم بالطلب، وأنواع الحركات بكشف الحساب، وحالات الطلب
    try {
      const L = body && body.data && (body.data.list || body.data.pageContent) || [];
      const labels = new Set();
      L.forEach(o => {
        (o.feeDtls || []).forEach(f => labels.add("fee:" + f.code + "=" + f.name));
        if (o.merchantOrder) labels.add("status:" + o.merchantOrder.status + " bizLine:" + o.merchantOrder.bizLine);
        if (o.bizCode) {
          let ek = ""; try { const e = JSON.parse(o.ext || "{}"); ek = Object.keys(e).join(",") + " :: " + JSON.stringify(shape(e)).slice(0, 300); } catch (x) { ek = "ext-not-json:" + String(o.ext || "").length; }
          labels.add("flow:" + o.bizCode + "=" + o.bizCodeText + " / " + (o.bizCodeSubText || "") + " status:" + o.statusText + " ext{" + ek + "}");
        }
      });
      if (labels.size) console.log("LABELS", JSON.stringify([...labels].map(clean)));
    } catch (e) {}
    console.log("API_SHAPE", u.split("?")[0].replace(/\d{3,}/g, "#"), "query:", clean((u.split("?")[1] || "").replace(/=[^&]*/g, "=")), "req:", reqShape, "res:", JSON.stringify(shape(body)).slice(0, 2500));
  });
  // اللوحة SPA: القائمة عناصر بدون روابط — نضغط عليها بالاسم ونسجل الصفحة ومسارات الـ API اللي تنطلب
  const modal = await page.evaluate(() => Array.from(document.querySelectorAll("[class*=modal], [class*=dialog], [role=dialog], [class*=mask], [class*=guide], [class*=popover]")).filter(e => e.offsetParent || getComputedStyle(e).position === "fixed").map(e => (e.className + "").slice(0, 40) + " :: " + (e.innerText || "").slice(0, 80)).slice(0, 8));
  console.log("OVERLAYS", JSON.stringify(modal.map(clean)));
  for (let k = 0; k < 3; k++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(400); }
  for (const t of ["إغلاق", "تخطي", "حسناً", "فهمت", "لاحقاً", "Close", "Skip", "OK", "Got it"]) {
    const b = page.getByText(t, { exact: true }).first();
    if (await b.isVisible().catch(() => false)) { await b.click({ force: true }).catch(() => {}); console.log("CLOSED", t); }
  }
  await page.locator("[class*=close]:visible").first().click({ force: true, timeout: 2000 }).catch(() => {});
  const items = ["الشؤون المالية"];
  for (const name of items) {
    const before = apis.size;
    const clicked = await page.evaluate((name) => {
      document.querySelectorAll(".roo-modal, .roo-modal-backdrop, [class*=guideModal]").forEach(e => e.remove());
      document.body.style.overflow = "";
      const all = Array.from(document.querySelectorAll("li, span, div, a")).filter(e => (e.innerText || "").trim() === name);
      // أعمق عنصر بالاسم (عادة span جوّا li) — ونضغط على أبوه li كمان
      const el = all.find(e => !Array.from(e.children).some(c => (c.innerText || "").trim() === name)) || all[0];
      if (!el) return "none:" + all.length;
      el.click(); const li = el.closest("li"); if (li && li !== el) li.click();
      return "ok:" + el.tagName + (li ? "+li" : "");
    }, name);
    console.log("CLICK", name, clicked);
    await page.waitForTimeout(7000);
    const info = await page.evaluate(() => ({
      url: location.href,
      tabs: Array.from(document.querySelectorAll("[role=tab], .tab, [class*=tab-item], [class*=tabs] li")).filter(e => e.offsetParent).map(e => e.innerText).slice(0, 15),
      heads: Array.from(document.querySelectorAll("h1,h2,h3,[class*=title]")).filter(e => e.offsetParent).map(e => e.innerText).slice(0, 15),
      tables: Array.from(document.querySelectorAll("table")).map(t => Array.from(t.querySelectorAll("th")).map(th => th.innerText.trim()).slice(0, 15)),
      buttons: Array.from(document.querySelectorAll("button,a,div,span")).filter(e => e.offsetParent && e.children.length === 0).map(e => e.innerText.trim()).filter(t => /export|download|pdf|excel|invoice|statement|bill|تصدير|تحميل|تنزيل|فاتور|كشف|فواتير|تسوي/i.test(t)).filter((t, i, a) => a.indexOf(t) === i).slice(0, 20)
    }));
    await page.waitForTimeout(8000);
    await page.mouse.wheel(0, 2000).catch(() => {});
    await page.waitForTimeout(3000);
    // كل النصوص القصيرة الظاهرة بالصفحة (تبويبات وأزرار وعناوين) — بدون أرقام
    for (const f of page.frames()) {
      const leaf = await f.evaluate(() => Array.from(document.querySelectorAll("body *")).filter(e => e.offsetParent && e.children.length === 0).map(e => (e.innerText || "").trim()).filter(t => t && t.length < 40).filter((t, i, a) => a.indexOf(t) === i).slice(0, 120)).catch(() => []);
      console.log("TEXTS", clean(f.url().split("?")[0]), JSON.stringify(leaf.map(clean).filter(t => t.replace(/[#.,\s%]/g, "")).slice(0, 120)));
    }
    // نجرب نفتح «الفواتير» أو «الكشوفات» إذا موجودة
    for (const t of ["الفواتير", "فاتورة", "الكشوفات", "كشف الحساب", "Invoices", "Bills"]) {
      const b = page.getByText(t, { exact: true }).first();
      if (await b.isVisible().catch(() => false)) {
        const n0 = apis.size; await b.click({ force: true }).catch(() => {}); await page.waitForTimeout(5000);
        console.log("OPENED", t, clean(page.url()), JSON.stringify([...apis].slice(n0).filter(u => /\/api\//.test(u) && !/rapfront|i18n|log|metric/.test(u))));
        const leaf2 = await page.evaluate(() => Array.from(document.querySelectorAll("body *")).filter(e => e.offsetParent && e.children.length === 0).map(e => (e.innerText || "").trim()).filter(t => t && t.length < 40).filter((t, i, a) => a.indexOf(t) === i).slice(0, 100)).catch(() => []);
        console.log("TEXTS2", JSON.stringify(leaf2.map(clean).filter(t => t.replace(/[#.,\s%/\-]/g, ""))));
        break;
      }
    }
    // صفحة الفواتير: نفتح «التفاصيل» لأول فاتورة، وبعدين تبويب «تنزيل» — نسجل الأسماء ومسارات الـ API بس
    const leafAll = async () => { const t = []; for (const f of page.frames()) t.push(...(await f.evaluate(() => Array.from(document.querySelectorAll("body *")).filter(e => e.offsetParent && e.children.length === 0).map(e => (e.innerText || "").trim()).filter(x => x && x.length < 50)).catch(() => []))); return [...new Set(t)].map(clean).filter(x => x.replace(/[#.,\s%/\-‏‎ر.س]/g, "")); };
    const newApis = (n0) => [...apis].slice(n0).filter(u => /\/api\//.test(u) && !/rapfront|i18n|log|metric/.test(u));
    const clickIn = async (txt) => { for (const f of page.frames()) { const el = f.getByText(txt, { exact: true }).first(); if (await el.isVisible().catch(() => false)) { await el.click({ force: true }).catch(() => {}); return true; } } return false; };
    let n0 = apis.size;
    await page.goto("https://merchant.mykeeta.com/m/web/app/finance#/main/bill", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(9000);
    console.log("BILL_PAGE", JSON.stringify((await leafAll()).slice(0, 80)), JSON.stringify(newApis(n0)));
    n0 = apis.size;
    console.log("CLICK_DETAILS", await clickIn("التفاصيل"));
    await page.waitForTimeout(7000);
    console.log("BILL_DETAIL", clean(page.url()), JSON.stringify((await leafAll()).slice(0, 100)), JSON.stringify(newApis(n0)));
    await page.goto("https://merchant.mykeeta.com/m/web/app/finance#/main/bill", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(7000);
    n0 = apis.size;
    console.log("CLICK_DOWNLOAD_TAB", await clickIn("تنزيل"));
    await page.waitForTimeout(7000);
    console.log("DOWNLOAD_TAB", clean(page.url()), JSON.stringify((await leafAll()).slice(0, 100)), JSON.stringify(newApis(n0)));
    const frames = page.frames().map(f => clean(f.url().split("?")[0])).filter(u => u && u !== "about:blank");
    console.log("PAGE", JSON.stringify({ menu: name, url: clean(info.url), frames, tabs: info.tabs.map(clean), heads: info.heads.map(clean), tables: info.tables.map(r => r.map(clean)), buttons: info.buttons.map(clean), newApis: [...apis].slice(before).filter(u => /\/api\//.test(u) && !/rapfront|i18n|log|metric/.test(u)) }));
  }
}

(async () => {
  const branches = cfg.branches || [];
  if (!branches.length) throw new Error("KEETA_CONFIG_JSON فاضي أو ما فيه branches");
  const browser = await chromium.launch({ headless: true });
  try {
    // الاستكشاف يكفي على أول فرع — نتأكد بس إن الثاني يدخل
    for (const [i, br] of branches.entries()) {
      const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 }, locale: "ar-SA" })).newPage();
      const apis = new Set();
      page.on("request", (r) => { if (!["image", "stylesheet", "font", "media", "script"].includes(r.resourceType())) { const u = r.url().split("?")[0]; if (!/sentry|collect|\/lx|beacon/i.test(u)) apis.add(r.resourceType() + " " + r.method() + " " + u.replace(/\d{3,}/g, "#").slice(0, 140)); } });
      console.log(`=== فرع ${i + 1}`);
      const ok = await login(page, br);
      console.log("LOGIN_OK", ok);
      if (ok && i === 0 && process.env.KEETA_EXPLORE) await explore(page, apis);
      await page.context().close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error("ERROR:", clean(e.message)); process.exit(1); });
