// كيتا (Keeta): دخول لوحة التاجر لكل فرع (KEETA_CONFIG_JSON = {"branches":[{"name","email","password"}]}).
// بدون KEETA_EXPLORE: يسحب فواتير كيتا (بنود العمولة والرسوم لكل فترة) ويرسلها للمشتريات عن طريق tabsense-ingest (هوية GitHub).
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
    if (body && typeof body.data === "string" && /cate\/detail/.test(u)) { try { console.log("CATE_DATA_SHAPE", JSON.stringify(shape(JSON.parse(body.data))).slice(0, 3000)); } catch (e) { console.log("CATE_DATA_NOT_JSON", body.data.length); } }
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
    // زر «تنزيل الفاتورة»: نشوف نوع الملف وحجمه بس
    try {
      let dl = null;
      for (const f of page.frames()) { const el = f.getByText("تنزيل الفاتورة", { exact: true }).first(); if (await el.isVisible().catch(() => false)) { [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }).catch(() => null), el.click({ force: true }).catch(() => {})]); break; } }
      if (dl) { const fp = await dl.path().catch(() => null); const sz = fp ? require("fs").statSync(fp).size : 0; console.log("DOWNLOAD", clean(dl.suggestedFilename()), sz, "bytes", clean(dl.url().split("?")[0])); }
      else { await page.waitForTimeout(4000); console.log("DOWNLOAD none; popups:", page.context().pages().length, JSON.stringify(newApis(n0))); }
    } catch (e) { console.log("DOWNLOAD_ERR", clean(e.message)); }
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

// ---- السحب الفعلي: فواتير كيتا (كل فترة فوترة) → المشتريات (مورد «كيتا») ----
const SUPA_URL = "https://sadtinfdwucwrxlmwxov.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZHRpbmZkd3Vjd3J4bG13eG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTM4MDgsImV4cCI6MjEwNTEyOTgwOH0.jMtjOIBQIuv0N0Q4ms9LJ5ys3h3lfakND4pVQXNbU2w";
async function oidcToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) throw new Error("ما في هوية GitHub (OIDC)");
  const res = await fetch(url + "&audience=prohouse-ingest", { headers: { Authorization: "bearer " + bearer } });
  if (!res.ok) throw new Error("GitHub OIDC [" + res.status + "]");
  return (await res.json()).value;
}

// شجرة بنود الفاتورة → بنود التكاليف (عمولة ورسوم وإعلانات وخصومات يتحملها المطعم) + ضريبة العمولة
function billLines(cate) {
  const out = [];
  let vat = 0;
  const neg = (n) => (Number(n.amount) < 0) || /^\s*[-‎‏]*-/.test(String(n.amountText || ""));
  const walk = (nodes, top) => (nodes || []).forEach(n => {
    const name = String(n.categoryName || "").trim();
    const subs = n.subCategoryInfos || [];
    if (top && subs.length) return walk(subs, false);
    const amt = Math.abs(Number(n.amount) || 0);
    if (!amt || !neg(n)) return;
    if (/ضريبة القيمة المضافة|VAT/i.test(name)) { vat += amt; return; }
    out.push({ name, amount: Math.round(amt * 100) / 100, category: /عمولة|رسوم|commission|fee/i.test(name) ? "اشتراكات التطبيقات" : "أخرى" });
  });
  walk(cate.categoryInfoList || [], true);
  return { lines: out, vat: Math.round(vat * 100) / 100 };
}

async function syncBills(page, branchName) {
  const bills = new Map(), cates = new Map();
  page.on("response", async (res) => {
    const u = res.url();
    if (!/billPage\/(billList|cate\/detail)/.test(u)) return;
    try {
      const body = await res.json();
      if (/billList/.test(u)) (body.data && body.data.billInfoList || []).forEach(b => bills.set(String(b.periodStartDateStamp) + "-" + String(b.periodEndDateStamp), b));
      else {
        const req = JSON.parse(res.request().postData() || "{}");
        cates.set(String(req.periodStartDateStamp) + "-" + String(req.periodEndDateStamp), JSON.parse(body.data || "{}"));
      }
    } catch (e) {}
  });
  await page.goto(BASE + "/m/web/app/finance#/main/bill", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(9000);
  // نفتح «التفاصيل» لكل فاتورة بالقائمة (كل ضغطة تجيب تفاصيل فترتها)
  for (const f of page.frames()) {
    const items = f.getByText("التفاصيل", { exact: true });
    const n = await items.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      await f.evaluate(() => document.querySelectorAll(".roo-modal, .roo-modal-backdrop, [class*=guideModal]").forEach(e => e.remove())).catch(() => {});
      await items.nth(i).click({ force: true }).catch(() => {});
      await page.waitForTimeout(3500);
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(800);
    }
  }
  const out = [];
  for (const [key, b] of bills) {
    const cate = cates.get(key);
    if (!cate) continue;
    const { lines, vat } = billLines(cate);
    if (!lines.length) continue;
    const day = (ms) => new Date(Number(ms) + 3 * 3600 * 1000).toISOString().slice(0, 10);
    out.push({ billId: String(b.billId), start: day(b.periodStartDateStamp), end: day(b.periodEndDateStamp), status: Number(b.status), payDate: b.payTime ? day(b.payTime) : "", lines, vat });
  }
  console.log(`${branchName === "الروضة" ? "R" : "S"} bills=${bills.size} details=${cates.size} toSend=${out.length}`);
  if (!out.length) return 0;
  const res = await fetch(SUPA_URL + "/functions/v1/tabsense-ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + ANON, "x-github-oidc": await oidcToken() },
    body: JSON.stringify({ keetaBills: { branch: branchName, bills: out } })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("إرسال فواتير كيتا فشل [" + res.status + "] " + clean(j.error || ""));
  console.log("saved", j.saved || 0);
  return out.length;
}

(async () => {
  const branches = cfg.branches || [];
  if (!branches.length) throw new Error("KEETA_CONFIG_JSON فاضي أو ما فيه branches");
  const browser = await chromium.launch({ headless: true });
  let failed = 0;
  try {
    // الاستكشاف يكفي على أول فرع — نتأكد بس إن الثاني يدخل
    for (const [i, br] of branches.entries()) {
      const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 }, locale: "ar-SA", acceptDownloads: true })).newPage();
      const apis = new Set();
      page.on("request", (r) => { if (!["image", "stylesheet", "font", "media", "script"].includes(r.resourceType())) { const u = r.url().split("?")[0]; if (!/sentry|collect|\/lx|beacon/i.test(u)) apis.add(r.resourceType() + " " + r.method() + " " + u.replace(/\d{3,}/g, "#").slice(0, 140)); } });
      console.log(`=== فرع ${i + 1}`);
      const ok = await login(page, br);
      console.log("LOGIN_OK", ok);
      if (ok && i === 0 && process.env.KEETA_EXPLORE) await explore(page, apis);
      else if (ok && !process.env.KEETA_EXPLORE) {
        // أسرار GitHub أحياناً تخرّب العربي — لو الاسم مو مفهوم نعتمد الترتيب (الأول الروضة، الثاني الشاطئ)
        const name = ["الروضة", "الشاطئ"].includes(br.name) ? br.name : ["الروضة", "الشاطئ"][i];
        await syncBills(page, name);
      }
      else if (!ok) failed++;
      await page.context().close();
    }
  } finally { await browser.close(); }
  if (failed) throw new Error(failed + " فرع ما قدر يدخل");
})().catch(e => { console.error("ERROR:", clean(e.message)); process.exit(1); });
