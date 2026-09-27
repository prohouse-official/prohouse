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
  // وين تقرير الإضافات (+50 دجاج)؟ نجرب العناوين المحتملة ونطبع العنوان والأعمدة بس
  for (const h of ["/reports/sales-by-modifier-option", "/reports/sales-by-modifier-options", "/reports/sales-by-modifiers",
                   "/reports/modifiers", "/reports/sales-by-option", "/reports/product-modifiers", "/reports/sales-by-product-modifier"]) {
    await page.goto(`https://console.foodics.com${h}?date=${today}+-+${today}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await describe(h);
  }
  // روابط صفحات التقارير الثانية (الأعمال والتحليلات) — يمكن الإضافات هناك
  for (const h of ["/reports/business-report", "/reports/analysis-report", "/reports/sales-report"]) {
    await page.goto(`https://console.foodics.com${h}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => (document.querySelector("main") || document.body).innerText.replace(/\s+/g, " ").slice(0, 1200)).catch(() => "");
    console.log(`EXPLORE_TEXT[${h}] ` + text);
  }
}

// ---- الإضافات (+50 جم دجاج/لحم/بحري) ← أجزاء وجبة: الوجبة 150 جم، فـ +50 جم = ثلث وجبة ----
const MEAL_WEIGHT_G = 150;
function addOnCategory(name) {
  const t = normalizeArabic(name).toLowerCase();
  if (/دجاج|chicken/.test(t)) return "دجاج";
  if (/لحم|meat|beef|steak/.test(t)) return "لحم";
  if (/سمك|جمبري|روبيان|سالمون|سلمون|بحري|fish|shrimp|salmon/.test(t)) return "بحري";
  return null;
}
// كم جرام زيادة بالإضافة: "+50 دجاج" أو "إضافة دجاج 50 جرام" = 50، و"دجاج 200 جم" = 200 − 150 = 50
function addOnExtraGrams(name) {
  const t = String(name || "");
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (/^\s*\+/.test(t) || /[اإأ]ضاف|زياد|extra|add/i.test(t)) return n <= MEAL_WEIGHT_G ? n : n - MEAL_WEIGHT_G;
  return n > MEAL_WEIGHT_G ? n - MEAL_WEIGHT_G : 0;
}

// ---- قراءة تقرير فوديكس «مجمّع حسب الفرع» ----
const toNum = (t) => parseFloat(String(t || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[,٬\s]/g, "").replace("٫", ".")) || 0;
function branchMatches(cell, branch) {
  const c = normalizeArabic(cell || ""), b = normalizeArabic(branch);
  return !!c && c.includes(b);
}

// نجرّب مرتين: صفحات فوديكس أحياناً تتأخر بالتحميل فيختفي زر التجميع أو الجدول
async function readGroupedReport(page, path, iso, nameLabel) {
  let res = await readGroupedReportOnce(page, path, iso, nameLabel);
  if (!res.ok) {
    await page.waitForTimeout(3000);
    res = await readGroupedReportOnce(page, path, iso, nameLabel);
    if (!res.ok) console.warn(`⚠️ ${path}: ${res.reason}`);
  }
  return res;
}

async function readGroupedReportOnce(page, path, iso, nameLabel) {
  const url = `https://console.foodics.com${path}?date=${iso}+-+${iso}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForSelector("table", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await dismissFoodicsModals(page);

  // «تجميع بـ» ← «الفرع»
  const groupBtn = page.locator('button:has-text("تجميع")').first();
  await groupBtn.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  if (!(await groupBtn.isVisible().catch(() => false))) return { ok: false, reason: "ما لقينا زر التجميع", rows: [] };
  await groupBtn.click().catch(() => {});
  await page.waitForTimeout(1000);
  const opt = page.getByText("الفرع", { exact: true }).last();
  if (!(await opt.isVisible().catch(() => false))) return { ok: false, reason: "ما لقينا خيار الفرع", rows: [] };
  await opt.click().catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);

  const all = [];
  for (let pageNo = 0; pageNo < 20; pageNo++) {
    const part = await page.evaluate((nameLabel) => {
      const first = (el) => (el.innerText || "").split("\n")[0].trim();
      const table = document.querySelector("table");
      if (!table) return { error: "ما فيه جدول" };
      const headers = Array.from(table.querySelectorAll("thead th, thead td")).map(first);
      const idx = (re) => headers.findIndex(h => re.test(h));
      const nameIdx = idx(new RegExp("^" + nameLabel));
      const branchIdx = idx(/^الفرع/);
      const qtyIdx = idx(/^صافي الكمية/);
      const rows = [];
      let groupBranch = "";
      Array.from(table.querySelectorAll("tbody tr")).forEach(tr => {
        const tds = Array.from(tr.querySelectorAll("td"));
        const texts = tds.map(td => (td.innerText || "").trim());
        // صف عنوان مجموعة (خلية ممتدة) = اسم الفرع
        if (tds.length && (tds.length < headers.length / 2 || tds.some(td => td.colSpan > 1)) && texts[0]) { groupBranch = texts[0]; return; }
        const name = nameIdx >= 0 ? texts[nameIdx] : "";
        if (!name || /لا يوجد|no data|الإجمالي|المجموع|total/i.test(name)) return;
        rows.push({ branch: branchIdx >= 0 ? texts[branchIdx] : groupBranch, name, qty: qtyIdx >= 0 ? texts[qtyIdx] : "" });
      });
      return { headers: headers.map(h => h.slice(0, 20)), nameIdx, branchIdx, qtyIdx, rows };
    }, nameLabel).catch(e => ({ error: e.message }));
    if (part.error) return { ok: false, reason: part.error, rows: [] };
    if (pageNo === 0) {
      const branchesSeen = Array.from(new Set(part.rows.map(r => r.branch).filter(Boolean)));
      console.log(`🔎 ${path}: أعمدة ${JSON.stringify(part.headers.slice(0, 4))} · اسم=${part.nameIdx} فرع=${part.branchIdx} كمية=${part.qtyIdx} · فروع: ${branchesSeen.join("، ")}`);
      if (part.nameIdx < 0 || part.qtyIdx < 0) return { ok: false, reason: "أعمدة الاسم/الكمية مو موجودة", rows: [] };
      if (part.rows.length && !branchesSeen.length) return { ok: false, reason: "ما بان اسم الفرع بالصفوف", rows: [] };
    }
    part.rows.forEach(r => all.push({ branch: r.branch, name: r.name, qty: toNum(r.qty) }));
    // الصفحة الجاية إذا فيه
    const next = page.locator('button[aria-label*="next" i], button[aria-label*="التالي"], a[rel="next"], li.next:not(.disabled) a').first();
    if (!(await next.isVisible().catch(() => false)) || !(await next.isEnabled().catch(() => false))) break;
    await next.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  return { ok: true, rows: all };
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

    // التقرير يعرض كل الفروع مع بعض، فمنجمّعه «حسب الفرع» ومنقسّم الصفوف على الفروع
    let sentAny = false, structureOk = false;
    for (const targetDate of targetDates) {
      const { iso } = targetDate;
      console.log(`\n📅 ${iso}`);
      const cats = await readGroupedReport(page, "/reports/sales-by-category", iso, "التصنيف");
      const prods = await readGroupedReport(page, "/reports/sales-by-product", iso, "المنتج");
      const mods = await readGroupedReport(page, "/reports/sales-by-modifier-option", iso, "خيار الإضافة");
      if (cats.ok) structureOk = true;
      if (!cats.ok) { console.warn(`⚠️ ما قدرنا نقرأ تقرير التصنيفات حسب الفرع (${cats.reason}) — ما انرسل شي لهاليوم`); continue; }

      for (const branch of branches) {
        const mine = (rows) => rows.filter(r => branchMatches(r.branch, branch));
        const catRows = mine(cats.rows), prodRows = prods.ok ? mine(prods.rows) : [];
        const mapped = {}, unknown = new Set();
        catRows.forEach(r => {
          const target = CATEGORY_MAP[r.name] || categorizeProduct(r.name, "");
          if (target) mapped[target] = (mapped[target] || 0) + r.qty; else unknown.add(r.name);
        });
        const ummAli = prodRows.filter(p => normalizeArabic(p.name).includes("ام علي")).reduce((t, p) => t + p.qty, 0);
        if (ummAli > 0) mapped[UMM_ALI_TARGET_CATEGORY] = (mapped[UMM_ALI_TARGET_CATEGORY] || 0) + ummAli / 2;
        // الإضافات: جراماتها ÷ 150 = أجزاء وجبة تنضاف لقسمها
        const modRows = mods.ok ? mine(mods.rows) : [];
        const addOnNames = [], noGrams = [];
        modRows.forEach(r => {
          const cat = addOnCategory(r.name), g = addOnExtraGrams(r.name);
          if (cat && g && r.qty > 0) { mapped[cat] = (mapped[cat] || 0) + (g * r.qty) / MEAL_WEIGHT_G; addOnNames.push(`${r.name}→${cat} ${g}جم`); }
          else if (cat && r.qty > 0) noGrams.push(r.name);
        });
        if (noGrams.length) console.log(`ℹ️ ${branch}: إضافات بروتين بدون وزن بالاسم (ما انحسبت): ${Array.from(new Set(noGrams)).join("، ")}`);
        // أسماء الإضافات اللي انحسبت وجرامها للحبة (بدون الكميات) عشان نتأكد من القراءة
        if (addOnNames.length) console.log(`➕ ${branch}: إضافات محسوبة: ${Array.from(new Set(addOnNames)).join("، ")}`);
        const mappedRows = Object.keys(mapped).map(c => ({ category: c, qty: Math.round(mapped[c] * 100) / 100 }));
        // أسماء التصنيفات اللي ما عرفناها (أسماء بس، بدون أرقام) عشان نضيفها للخريطة
        if (unknown.size) console.log(`ℹ️ ${branch}: تصنيفات ما لها مقابل: ${Array.from(unknown).join("، ")}`);
        console.log(`🏢 ${branch}: ${catRows.length} تصنيف · ${prodRows.length} منتج`);

        if (mappedRows.length) {
          try { await sendToSupabase("import_sales", iso, branch, mappedRows); sentAny = true; console.log(`☁️ ${branch}: انحفظت مبيعات ${mappedRows.length} قسم`); }
          catch (e) { console.warn(`⚠ ${branch}: تعذر حفظ مبيعات الأقسام:`, e.message); }
        }
        if (modRows.length) {
          try { await sendToSupabase("import_modifier_sales", iso, branch, modRows.filter(r => r.qty > 0).map(r => ({ modifier: "", option: r.name, qty: r.qty, net: null }))); }
          catch (e) { console.warn(`⚠ ${branch}: تعذر حفظ الإضافات:`, e.message); }
        }
        const productRows = prodRows.filter(p => p.name && p.qty > 0).map(p => ({ name: p.name, category: "", qty: p.qty }));
        if (productRows.length) {
          try { await sendToSupabase("import_product_sales", iso, branch, productRows); console.log(`🧾 ${branch}: انحفظت مبيعات ${productRows.length} منتج`); }
          catch (e) { console.warn(`⚠ ${branch}: تعذر حفظ مبيعات المنتجات:`, e.message); }
        }
        const juiceRows = pickJuiceRows(prodRows, config.juiceCategories || DEFAULT_JUICE_CATEGORIES);
        if (juiceRows.length) {
          try { await sendToSupabase("import_juice_sales", iso, branch, juiceRows); console.log(`🥤 ${branch}: انحفظت مبيعات ${juiceRows.length} عصير`); }
          catch (e) { console.warn(`⚠ ${branch}: تعذر حفظ العصيرات:`, e.message); }
        }
      }
    }
    // إذا ولا مرة قدرنا نقرأ التقرير (صفحة فوديكس تغيّرت) نطلع بخطأ عشان يبان أحمر
    if (!structureOk) throw new Error("ما قدرنا نقرأ تقرير فوديكس حسب الفرع — غالباً شكل الصفحة تغيّر");
    if (!sentAny) console.log("ℹ️ ما فيه مبيعات جديدة للإرسال.");

  } catch (err) {
    console.error("❌ خطأ أثناء السحب:", err.message);
    await page.screenshot({ path: path.join(DOWNLOAD_DIR, "error-screenshot.png") }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
