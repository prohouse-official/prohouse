// ==================== سحب تلقائي لمبيعات فوديكس (Foodics) ====================
// سكربت أتمتة لسحب المبيعات اليومية لفرعي (الروضة والشاطئ) وإرسالها لـ Pro House و Supabase.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");
if (!fs.existsSync(CONFIG_PATH)) {
  console.error("ما في ملف config.json — انسخ config.example.json وعبّي بياناتك فيه.");
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

const LOGIN_URL = "https://console.foodics.com/login";
const DOWNLOAD_DIR = path.join(__dirname, "downloads");

// تصنيفات فوديكس المتطابقة مع أصناف Pro House
const CATEGORY_MAP = {
  "أطباق الدجاج": "دجاج",
  "أطباق اللحم": "لحم",
  "أطباق المأكولات البحرية": "بحري",
  "الدجاج": "دجاج",
  "اللحم": "لحم",
  "المأكولات البحرية": "بحري",
  "مأكولات بحرية": "بحري",
  "أسماك": "بحري",
  "Chicken": "دجاج",
  "Chicken Dishes": "دجاج",
  "Meat": "لحم",
  "Meat Dishes": "لحم",
  "Seafood": "بحري",
  "Seafood Dishes": "بحري",
  "ساندويتشات": "ساندويتشات",
  "الساندويتشات": "ساندويتشات",
  "ساندوتشات": "ساندويتشات",
  "الساندوتشات": "ساندويتشات",
  "فطور": "ساندويتشات",
  "الفطور": "ساندويتشات",
  "وجبات فطور": "ساندويتشات",
  "Breakfast": "ساندويتشات",
  "Sandwiches": "ساندويتشات",
  "Sandwich": "ساندويتشات",
  "السلطات": "السلطات",
  "سلطات": "السلطات",
  "سلطة": "السلطات",
  "Salads": "السلطات",
  "Salad": "السلطات"
};

const UMM_ALI_PRODUCT_NAME = "ام علي";
const UMM_ALI_TARGET_CATEGORY = "ساندويتشات";

// تصنيفات فوديكس التي تعتبر عصيرات (لشاشة جرد العصيرات)
const DEFAULT_JUICE_CATEGORIES = ["العصائر", "عصائر", "المشروبات", "مشروبات", "Juices", "Juice", "Beverages", "Drinks", "عصير"];
const JUICE_NAME_HINTS = ["عصير", "juice", "برتقال", "ليمون", "رمان", "أناناس"];

const VALID_BRANCHES = ["الروضة", "الشاطئ", "عبداللطيف جميل"];

function resolveBranches() {
  const envBranches = process.env.FOODICS_BRANCHES;
  if (envBranches) {
    return envBranches.split(",").map(b => b.trim()).filter(Boolean);
  }
  if (Array.isArray(config.branches) && config.branches.length) {
    return config.branches;
  }
  return ["الروضة", "الشاطئ"];
}

// سيرفرات GitHub شغالة على UTC، واليوم لازم يتحسب بتوقيت الرياض
function riyadhDateObj(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  const [yyyy, mm, dd] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(d).split("-");
  return { display: `${mm}/${dd}/${yyyy}`, iso: `${yyyy}-${mm}-${dd}` };
}

// يدعم كلا الصيغتين: YYYY-MM-DD و MM/DD/YYYY و BACKFILL_DAYS
function getTargetDates() {
  const customDate = process.argv[2];
  if (customDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
      const [yyyy, mm, dd] = customDate.split("-");
      return [{ display: `${mm}/${dd}/${yyyy}`, iso: customDate }];
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(customDate)) {
      const [mm, dd, yyyy] = customDate.split("/");
      return [{ display: customDate, iso: `${yyyy}-${mm}-${dd}` }];
    }
  }
  const backfill = parseInt(process.env.BACKFILL_DAYS || "", 10);
  if (backfill > 0) {
    const days = [];
    for (let n = Math.min(backfill, 60); n >= 1; n--) days.push(riyadhDateObj(n));
    return days;
  }
  return [riyadhDateObj(1), riyadhDateObj(0)];
}

function normalizeArabic(s) {
  return String(s || "").replace(/[إأآ]/g, "ا").trim();
}

// إرسال لـ Supabase عبر OIDC على GitHub Actions (بدون أي مفتاح سري بالكود)
// أو عبر supabaseToken محلياً إذا كان متوفراً
const SUPA_URL_DEFAULT = "https://sadtinfdwucwrxlmwxov.supabase.co";
const ANON_KEY_DEFAULT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZHRpbmZkd3Vjd3J4bG13eG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTM4MDgsImV4cCI6MjEwNTEyOTgwOH0.jMtjOIBQIuv0N0Q4ms9LJ5ys3h3lfakND4pVQXNbU2w";
let oidcCache = null;

async function githubOidcToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) return null;
  if (oidcCache && oidcCache.exp > Date.now() + 60000) return oidcCache.value;
  const res = await fetch(url + "&audience=prohouse-ingest", { headers: { Authorization: "bearer " + bearer } });
  if (!res.ok) throw new Error("GitHub OIDC [" + res.status + "]");
  const value = (await res.json()).value;
  oidcCache = { value, exp: Date.now() + 4 * 60 * 1000 };
  return value;
}

async function sendToSupabase(rpcName, iso, branch, rows) {
  const base = String(config.supabaseUrl || SUPA_URL_DEFAULT).replace(/\/$/, "");
  const anonKey = config.supabaseAnonKey || ANON_KEY_DEFAULT;
  const headers = { "Content-Type": "application/json", "apikey": anonKey, "Authorization": "Bearer " + anonKey };
  const oidc = await githubOidcToken();
  let res;
  if (oidc) {
    res = await fetch(base + "/functions/v1/tabsense-ingest", {
      method: "POST", headers: { ...headers, "x-github-oidc": oidc },
      body: JSON.stringify({ rpc: rpcName, date: iso, branch, rows })
    });
  } else {
    if (!config.supabaseToken) {
      console.warn("⚠️ لا يوجد supabaseToken في config.json للتشغيل المحلي (سيتم تخطي حفظ Supabase محلياً).");
      return false;
    }
    res = await fetch(base + "/rest/v1/rpc/" + rpcName, {
      method: "POST", headers,
      body: JSON.stringify({ p_token: config.supabaseToken, p_date: iso, p_branch: branch, p_rows: rows })
    });
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error("Supabase " + rpcName + " فشل [" + res.status + "]: " + t.slice(0, 200));
  }
  return true;
}

// إغلاق أي نافذة منبثقة أو تنبيه يعترض النقر
async function dismissFoodicsModals(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal-mask, [class*="modal"], [class*="popup"], .v-dialog').forEach(m => {
      const closeBtn = m.querySelector('button, [aria-label="Close"], .close');
      if (closeBtn) closeBtn.click();
      else m.remove();
    });
    document.querySelectorAll('.modal-backdrop, .overlay').forEach(el => el.remove());
  }).catch(() => {});
}

// تبديل الفرع في لوحة تحكم فوديكس
async function selectFoodicsBranch(page, targetBranchName) {
  // أسرار GitHub تخرّب العربي أحياناً (تصير ????) — نتجاهل أي قيمة فيها علامة استفهام
  const fromConfig = config.branchFoodicsNames && config.branchFoodicsNames[targetBranchName];
  const searchName = (fromConfig && !String(fromConfig).includes("?")) ? fromConfig : targetBranchName;
  console.log("🏢 جاري اختيار فرع (" + searchName + ") في فوديكس...");

  try {
    await dismissFoodicsModals(page);
    const branchBtn = page.locator('button:has-text("Branch"), button:has-text("الفرع"), button:has-text("الفروع"), [data-testid*="branch"], .branch-selector, .branch-filter, button:has-text("كل الفروع")').first();
    if (await branchBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await branchBtn.click();
      await page.waitForTimeout(1000);

      const searchInput = page.locator('input[placeholder*="بحث"], input[placeholder*="Search"], input[type="search"]').first();
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill(searchName);
        await page.waitForTimeout(800);
      }

      const branchOption = page.locator('li:has-text("' + searchName + '"), div:has-text("' + searchName + '"), span:has-text("' + searchName + '")').last();
      if (await branchOption.isVisible().catch(() => false)) {
        await branchOption.click();
        await page.waitForTimeout(2000);
      }
    }
  } catch (err) {
    console.warn("ملاحظة حول اختيار الفرع: " + err.message);
  }
}

// ضبط التاريخ في لوحة تحكم فوديكس
async function setFoodicsDate(page, dateObj) {
  console.log("📅 ضبط التاريخ إلى " + dateObj.display + " (" + dateObj.iso + ")...");
  try {
    await dismissFoodicsModals(page);
    const dateBtn = page.locator('button:has-text("Today"), button:has-text("اليوم"), button:has-text("Date"), button:has-text("التاريخ"), .date-picker, .date-filter, [data-testid*="date"]').first();
    if (await dateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dateBtn.click();
      await page.waitForTimeout(1000);

      const isToday = (dateObj.iso === riyadhDateObj(0).iso);
      const isYesterday = (dateObj.iso === riyadhDateObj(1).iso);

      if (isToday) {
        const todayOption = page.locator('button:has-text("اليوم"), button:has-text("Today"), li:has-text("اليوم"), li:has-text("Today")').first();
        if (await todayOption.isVisible().catch(() => false)) {
          await todayOption.click();
          await page.waitForTimeout(2000);
          return;
        }
      } else if (isYesterday) {
        const yestOption = page.locator('button:has-text("أمس"), button:has-text("Yesterday"), li:has-text("أمس"), li:has-text("Yesterday")').first();
        if (await yestOption.isVisible().catch(() => false)) {
          await yestOption.click();
          await page.waitForTimeout(2000);
          return;
        }
      }

      const inputs = page.locator('input[type="date"], input[placeholder*="YYYY"], input[placeholder*="yyyy"], input.date-input');
      const count = await inputs.count();
      if (count >= 1) {
        for (let i = 0; i < count; i++) {
          await inputs.nth(i).fill(dateObj.display).catch(() => {});
        }
        const applyBtn = page.locator('button:has-text("تطبيق"), button:has-text("Apply"), button:has-text("عرض")').first();
        if (await applyBtn.isVisible().catch(() => false)) {
          await applyBtn.click();
          await page.waitForTimeout(2500);
        }
      }
    }
  } catch (err) {
    console.warn("ملاحظة حول ضبط التاريخ: " + err.message);
  }
}

// استخراج جدول التصنيفات
async function extractCategoryTable(page) {
  return await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(th => th.innerText.trim());
    const catIdx = headers.findIndex(h => h.includes('التصنيف') || h.toLowerCase().includes('category'));
    const qtyIdx = headers.findIndex(h => h === 'الكمية' || h.toLowerCase() === 'qty' || h.toLowerCase() === 'quantity');
    
    const rows = [];
    const trs = Array.from(table.querySelectorAll('tbody tr'));
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      const catText = tds[catIdx] || '';
      if (catText && !catText.includes('لا يوجد بيانات') && !catText.includes('No data available')) {
        const qtyStr = tds[qtyIdx >= 0 ? qtyIdx : 4] ? tds[qtyIdx >= 0 ? qtyIdx : 4].replace(/,/g, '') : '0';
        rows.push({
          category: catText,
          qty: parseFloat(qtyStr) || 0
        });
      }
    }
    return rows;
  });
}

// استخراج جدول المنتجات (أم علي + العصيرات)
async function extractProductTable(page) {
  await page.evaluate(() => {
    const sel = document.querySelector('select[name*="length"]');
    if (sel) {
      sel.value = "100";
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }).catch(() => {});
  await page.waitForTimeout(1500);

  return await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(th => th.innerText.trim());
    const nameIdx = headers.findIndex(h => h === 'المنتج' || h.toLowerCase() === 'product' || h.toLowerCase() === 'item');
    const qtyIdx = headers.findIndex(h => h === 'الكمية' || h.toLowerCase() === 'qty' || h.toLowerCase() === 'quantity');
    const catIdx = headers.findIndex(h => h.includes('التصنيف') || h.toLowerCase().includes('category'));

    const targetQtyCol = qtyIdx >= 0 ? qtyIdx : 7;
    const targetNameCol = nameIdx >= 0 ? nameIdx : 0;

    const rows = [];
    const trs = Array.from(table.querySelectorAll('tbody tr'));
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      if (tds[targetNameCol]) {
        const qtyStr = tds[targetQtyCol] ? tds[targetQtyCol].replace(/,/g, '') : '0';
        rows.push({
          name: tds[targetNameCol],
          category: catIdx >= 0 ? (tds[catIdx] || '') : '',
          qty: parseFloat(qtyStr) || 0
        });
      }
    }
    return rows;
  });
}

function findProductQty(products, productName) {
  const target = normalizeArabic(productName);
  const found = products.find(p => normalizeArabic(p.name) === target || normalizeArabic(p.name).includes("ام علي"));
  return found ? found.qty : 0;
}

function pickJuiceRows(products, juiceCategories) {
  const cats = juiceCategories.map(c => normalizeArabic(c).toLowerCase());
  const byCategory = products.filter(p => p.category && cats.includes(normalizeArabic(p.category).toLowerCase()));
  if (byCategory.length) return byCategory.map(p => ({ productName: p.name, qty: p.qty }));

  return products
    .filter(p => JUICE_NAME_HINTS.some(h => normalizeArabic(p.name).toLowerCase().includes(h)))
    .map(p => ({ productName: p.name, qty: p.qty }));
}

// دالة تصنيف المنتجات مع تصحيح أولوية السلطات قبل اللحوم والدواجن
function categorizeProduct(pCat, pName) {
  const pCatNorm = normalizeArabic(pCat).toLowerCase();
  const pNameNorm = normalizeArabic(pName).toLowerCase();

  // أولاً: مطابقة صريحة من جدول التصنيفات
  let target = CATEGORY_MAP[pCat];
  if (target) return target;

  // ثانياً: إذا كان الاسم يحتوي على سلطة أو salad يعامل كسلطات أولاً حتى لو كان "سلطة دجاج"
  if (pCatNorm.includes("سلط") || pNameNorm.includes("سلط") || pNameNorm.includes("salad")) {
    return "السلطات";
  }
  // ثالثاً: ساندويتشات وفطور
  if (pCatNorm.includes("فطور") || pCatNorm.includes("ساندويتش") || pNameNorm.includes("ساندويتش") || pNameNorm.includes("فطور") || pNameNorm.includes("ساندوتش")) {
    return "ساندويتشات";
  }
  // رابعاً: مأكولات بحرية
  if (pCatNorm.includes("بحري") || pCatNorm.includes("سمك") || pCatNorm.includes("جمبري") || pNameNorm.includes("بحري") || pNameNorm.includes("سمك") || pNameNorm.includes("fish") || pNameNorm.includes("جمبري") || pNameNorm.includes("سالمون") || pNameNorm.includes("سلمون")) {
    return "بحري";
  }
  // خامساً: دجاج
  if (pCatNorm.includes("دجاج") || pNameNorm.includes("دجاج") || pNameNorm.includes("chicken")) {
    return "دجاج";
  }
  // سادساً: لحم
  if (pCatNorm.includes("لحم") || pNameNorm.includes("لحم") || pNameNorm.includes("meat")) {
    return "لحم";
  }
  return null;
}

// ---- وضع الاستكشاف (FOODICS_EXPLORE=1): نعرف شكل صفحات فوديكس الحقيقية ----
// يطبع روابط التقارير وأسماء أعمدة الجداول وعدد الصفوف بس — بدون أي أرقام مبيعات (السجل عام)
async function exploreFoodics(page) {
  const describe = async (label) => {
    const info = await page.evaluate(() => {
      const txt = (el) => (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
      const links = Array.from(document.querySelectorAll("a[href]"))
        .filter(a => /report/i.test(a.getAttribute("href")))
        .map(a => txt(a) + " -> " + a.getAttribute("href"));
      const tables = Array.from(document.querySelectorAll("table")).map(t => ({
        headers: Array.from(t.querySelectorAll("thead th, thead td")).map(txt),
        rows: t.querySelectorAll("tbody tr").length
      }));
      const gridRows = document.querySelectorAll('[role="row"]').length;
      const buttons = Array.from(document.querySelectorAll("button, [role='button'], select"))
        .map(txt).filter(t => t && t.length < 40).slice(0, 40);
      return { url: location.href, title: document.title, links: Array.from(new Set(links)).slice(0, 80), tables, gridRows, buttons };
    }).catch(e => ({ error: e.message }));
    console.log(`EXPLORE[${label}] ` + JSON.stringify(info));
  };
  const today = riyadhDateObj(0).iso;
  const txt = (el) => (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
  // 1) أسماء كروت التقارير بصفحة تقارير المبيعات (نصوص بس)
  await page.goto("https://console.foodics.com/reports/sales-report", { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const cards = await page.evaluate(() => (document.querySelector("main") || document.body).innerText.replace(/\s+/g, " ").slice(0, 1500)).catch(() => "");
  console.log("EXPLORE_SALES_REPORT_TEXT " + cards);
  // 2) عناوين محتملة لتقارير التصنيف والمنتج
  for (const h of ["/reports/sales-by-category", "/reports/sales-by-product", "/reports/sales-by-product-category", "/reports/sales-by-modifier", "/reports/sales-by-order-type"]) {
    await page.goto(`https://console.foodics.com${h}?date=${today}+-+${today}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await dismissFoodicsModals(page);
    await describe(h);
  }
  // 3) قائمة «تجميع بـ» بتقرير المبيعات حسب الفرع
  await page.goto(`https://console.foodics.com/reports/sales-by-branch?date=${today}+-+${today}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await dismissFoodicsModals(page);
  const groupBtn = page.locator('button:has-text("تجميع")').first();
  if (await groupBtn.isVisible().catch(() => false)) {
    await groupBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
    const opts = await page.evaluate(() => Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], li, .dropdown-item'))
      .map(e => (e.innerText || "").trim().replace(/\s+/g, " ")).filter(t => t && t.length < 40).slice(0, 40)).catch(() => []);
    console.log("EXPLORE_GROUPBY " + JSON.stringify(opts));
    await page.keyboard.press("Escape").catch(() => {});
  }
  // 4) لوحة التصفية: حقل الفروع وخياراته
  const filterBtn = page.locator('button:has-text("تصفية")').first();
  if (await filterBtn.isVisible().catch(() => false)) {
    await filterBtn.click().catch(() => {});
    await page.waitForTimeout(2000);
    const branchField = page.locator('label:has-text("الفروع")').first();
    if (await branchField.isVisible().catch(() => false)) {
      const box = page.locator('label:has-text("الفروع") ~ *, label:has-text("الفروع") + *').first();
      await (await box.isVisible().catch(() => false) ? box : branchField).click().catch(() => {});
      await page.waitForTimeout(1500);
    }
    const panel = await page.evaluate(() => ({
      options: Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], li, .multiselect__option, .vs__dropdown-option'))
        .map(e => (e.innerText || "").trim().replace(/\s+/g, " ")).filter(t => t && t.length < 40).slice(0, 40),
      buttons: Array.from(document.querySelectorAll("button")).map(b => (b.innerText || "").trim()).filter(t => t && t.length < 30).slice(-12),
      html: (document.querySelector('label') && document.querySelector('label').parentElement ? document.querySelector('label').parentElement.outerHTML : "").replace(/\s+/g, " ").slice(0, 900)
    })).catch(e => ({ error: e.message }));
    console.log("EXPLORE_FILTER_BRANCHES " + JSON.stringify(panel));
  }
}

async function run() {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  try {
    const branches = resolveBranches();
    const targetDates = getTargetDates();

    console.log(`🔑 جاري تسجيل الدخول إلى فوديكس...`);
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2000);

    if (page.url().includes("/login")) {
      if (config.accountNumber) {
        const accInput = page.locator('#business_ref, input[name="business"]').first();
        if (await accInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await accInput.fill(String(config.accountNumber));
          console.log("✓ تم إدخال رقم الحساب");
        }
      }

      await page.fill('input[type="email"], input[name="email"]', config.email);
      await page.fill('input[type="password"], input[name="password"]', config.password);

      console.log(`⏳ بانتظار تفعيل زر تسجيل الدخول (حل كابتشا فوديكس)...`);
      await page.waitForFunction(() => {
        const btn = document.querySelector('button[type="submit"], button.btn-primary');
        return btn && !btn.hasAttribute('disabled');
      }, { timeout: 20000 }).catch(() => {
        console.warn("⚠️ محاولة النقر المباشر على زر تسجيل الدخول...");
      });

      await page.waitForTimeout(1000);
      const submitBtn = page.locator('button[type="submit"], button.btn-primary').first();
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {}),
        submitBtn.click()
      ]);
      await page.waitForTimeout(4000);
      console.log(`📍 الصفحة بعد تسجيل الدخول: ${page.url()}`);
      // إذا لسه على صفحة الدخول (غالباً الكابتشا أو كلمة مرور غلط) نوقف بخطأ واضح بدل ما نسحب جداول فاضية ونقول نجح
      if (page.url().includes("/login")) {
        throw new Error("تسجيل الدخول لفوديكس ما نجح — غالباً الكابتشا أو بيانات الدخول (شوف صورة الشاشة)");
      }
    }

    // إغلاق أي نافذة منبثقة أو رسالة تجديد
    await dismissFoodicsModals(page);

    if (process.env.FOODICS_EXPLORE === "1") {
      await exploreFoodics(page);
      return;
    }

    for (const branch of branches) {
      console.log(`\n==================================================`);
      console.log(`🏢 بدء سحب مبيعات فوديكس لفرع: [${branch}]`);
      console.log(`==================================================`);

      for (const targetDate of targetDates) {
        const { display, iso } = targetDate;
        console.log(`\n--------------------------------------------------`);
        console.log(`📅 معالجة تاريخ: ${display} (${iso}) لفرع: ${branch}...`);

        // ---- 1) فتح صفحة تقرير المبيعات المباشرة بالتاريخ المحدد ----
        const reportUrl = `https://console.foodics.com/reports/sales-by-branch?date=${iso}+-+${iso}`;
        console.log(`🌐 فتح تقرير المبيعات: ${reportUrl}`);
        await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(3000);
        await dismissFoodicsModals(page);

        // ضبط الفرع
        await selectFoodicsBranch(page, branch);
        await page.waitForTimeout(2000);

        // سحب التصنيفات
        const categoryRows = await extractCategoryTable(page);
        console.log(`📊 صفوف جدول التصنيفات: ${categoryRows.length}`); // المستودع عام — لا نطبع أرقام المبيعات بالسجل

        const mappedRows = [];
        categoryRows.forEach(r => {
          const targetCat = CATEGORY_MAP[r.category];
          if (targetCat) {
            const existing = mappedRows.find(m => m.category === targetCat);
            if (existing) existing.qty += r.qty;
            else mappedRows.push({ category: targetCat, qty: r.qty });
          }
        });

        // ---- 2) سحب المنتجات (أم علي + العصيرات) ----
        console.log(`🍩 جاري سحب تقرير المنتجات لفرع ${branch}...`);
        const products = await extractProductTable(page);
        const ummAliQty = findProductQty(products, UMM_ALI_PRODUCT_NAME);
        console.log(`أم علي ليوم ${display}: ${ummAliQty > 0 ? "موجود" : "ما فيه"}`);
        
        const sandwichesFromUmmAli = ummAliQty / 2;
        if (sandwichesFromUmmAli > 0) {
          console.log("تم إضافة أم علي للساندويتشات.");
          const existing = mappedRows.find(r => r.category === UMM_ALI_TARGET_CATEGORY);
          if (existing) existing.qty += sandwichesFromUmmAli;
          else mappedRows.push({ category: UMM_ALI_TARGET_CATEGORY, qty: sandwichesFromUmmAli });
        }

        // مطابقة المنتجات مع التصنيفات الرئيسية مع إعطاء الأولوية للسلطات
        if (products && products.length) {
          products.forEach(p => {
            const targetCat = categorizeProduct(p.category || "", p.name || "");
            if (targetCat && p.qty > 0) {
              const hasFromCategoryTable = categoryRows.some(r => CATEGORY_MAP[r.category] === targetCat);
              if (!hasFromCategoryTable) {
                const existing = mappedRows.find(m => m.category === targetCat);
                if (existing) existing.qty += p.qty;
                else mappedRows.push({ category: targetCat, qty: p.qty });
              }
            }
          });
        }

        // ---- 3) إرسال مبيعات التصنيفات إلى Supabase ----
        if (mappedRows.length) {
          try {
            await sendToSupabase("import_sales", iso, branch, mappedRows);
            console.log(`☁️ تم تحديث مبيعات التصنيفات على Supabase لفرع ${branch} (${mappedRows.length} تصنيف).`);
          } catch (supaErr) {
            console.warn(`⚠ تعذر تحديث Supabase (مبيعات التصنيفات لفرع ${branch}):`, supaErr.message);
          }
        } else {
          console.warn(`⚠️ لم يتم العثور على مبيعات تصنيفات في فوديكس لفرع ${branch} في تاريخ ${iso}.`);
        }

        // ---- 4) مبيعات العصيرات ----
        const juiceRows = pickJuiceRows(products, config.juiceCategories || DEFAULT_JUICE_CATEGORIES);
        if (juiceRows.length) {
          console.log(`🥤 جاري إرسال مبيعات ${juiceRows.length} عصير لفرع ${branch}...`);
          try {
            await sendToSupabase("import_juice_sales", iso, branch, juiceRows);
            console.log(`☁️ تم تحديث مبيعات ${juiceRows.length} عصير على Supabase لفرع ${branch}.`);
          } catch (supaErr) {
            console.warn(`⚠ تعذر تحديث Supabase (مبيعات العصيرات لفرع ${branch}):`, supaErr.message);
          }
        }
      }
    }

  } catch (err) {
    console.error("❌ خطأ أثناء السحب:", err.message);
    await page.screenshot({ path: path.join(DOWNLOAD_DIR, "error-screenshot.png") }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
