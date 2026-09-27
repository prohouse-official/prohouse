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
const CATEGORY_REPORT_URL = "https://console.foodics.com/reports/categories";
const PRODUCT_REPORT_URL = "https://console.foodics.com/reports/products";
const DOWNLOAD_DIR = path.join(__dirname, "downloads");

// تصنيفات فوديكس المتطابقة مع الأصناف عندنا
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

function getTargetDates() {
  const customDate = process.argv[2]; // مثال: node pull-tabsense.js 07/30/2026
  if (customDate && /\d{2}\/\d{2}\/\d{4}/.test(customDate)) {
    const parts = customDate.split("/");
    return [{ display: customDate, iso: `${parts[2]}-${parts[0]}-${parts[1]}` }];
  }
  return [riyadhDateObj(1), riyadhDateObj(0)];
}

function normalizeArabic(s) {
  return String(s || "").replace(/[إأآ]/g, "ا").trim();
}

// إرسال لـ Supabase: إذا كانت مفاتيح supabaseUrl/supabaseToken موجودة
// بـ config.json بينبعث الملف نفسه للنظام الجديد كمان
async function sendToSupabase(rpcName, iso, branch, rows, customUrl, customToken) {
  const finalUrl = customUrl || config.supabaseUrl;
  const finalToken = customToken || config.supabaseToken;
  if (!finalUrl || !finalToken) return false;
  const url = String(finalUrl).replace(/\/$/, "") + "/rest/v1/rpc/" + rpcName;
  const anonKey = config.supabaseAnonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZHRpbmZkd3Vjd3J4bG13eG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTM4MDgsImV4cCI6MjEwNTEyOTgwOH0.jMtjOIBQIuv0N0Q4ms9LJ5ys3h3lfakND4pVQXNbU2w";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": "Bearer " + anonKey
    },
    body: JSON.stringify({ p_token: finalToken, p_date: iso, p_branch: branch, p_rows: rows })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error("Supabase " + rpcName + " فشل [" + res.status + "]: " + t.slice(0, 200));
  }
  return true;
}

// تبديل الفرع في لوحة تحكم فوديكس
async function selectFoodicsBranch(page, targetBranchName) {
  const searchName = (config.branchFoodicsNames && config.branchFoodicsNames[targetBranchName]) || targetBranchName;
  console.log("🏢 جاري اختيار فرع (" + searchName + ") في فوديكس...");

  try {
    const branchBtn = page.locator('button:has-text("Branch"), button:has-text("الفرع"), button:has-text("الفروع"), [data-testid*="branch"], .branch-selector, .branch-filter').first();
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
  console.log("📅 ضبط التاريخ إلى " + dateObj.display + "...");
  try {
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

async function prepareFoodicsReportPage(page, reportUrl, branch, dateObj) {
  console.log(`🌐 فتح تقرير فوديكس: ${reportUrl}...`);
  await page.goto(reportUrl, { waitUntil: "networkidle", timeout: 45000 }).catch(async () => {
    await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  });
  await page.waitForTimeout(2500);

  // اختيار الفرع
  await selectFoodicsBranch(page, branch);
  await page.waitForTimeout(1500);

  // ضبط التاريخ
  await setFoodicsDate(page, dateObj);
  await page.waitForTimeout(2500);
}

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

// بنسحب جدول المنتجات مرة وحدة بس ونشتق منه كل شي (أم علي + العصيرات) —
// أرخص من فتح نفس الصفحة مرتين، وبيضمن إن الرقمين من نفس اللقطة الزمنية.
async function extractProductTable(page) {
  // تمديد الجدول لإظهار 100 عنصر لمنع حجب منتجات بالصفحات التالية
  await page.evaluate(() => {
    const sel = document.querySelector('select[name*="length"]');
    if (sel) {
      sel.value = "100";
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
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

  // ما في عمود تصنيف (أو ما طابق شي) — نرجع للاسم كاحتياط
  return products
    .filter(p => JUICE_NAME_HINTS.some(h => normalizeArabic(p.name).toLowerCase().includes(h)))
    .map(p => ({ productName: p.name, qty: p.qty }));
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
    await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2000);

    if (page.url().includes("/login")) {
      // إدخال رقم الحساب
      if (config.accountNumber) {
        const accInput = page.locator('#business_ref, input[name="business"]').first();
        if (await accInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await accInput.fill(String(config.accountNumber));
          console.log(`✓ تم إدخال رقم الحساب: ${config.accountNumber}`);
        }
      }

      // إدخال البريد الإلكتروني
      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      await emailInput.fill(config.email);

      // إدخال كلمة المرور
      const passInput = page.locator('input[type="password"], input[name="password"]').first();
      await passInput.fill(config.password);

      console.log(`⏳ بانتظار تفعيل زر تسجيل الدخول (حل كابتشا فوديكس)...`);
      await page.waitForFunction(() => {
        const btn = document.querySelector('button[type="submit"], button.btn-primary');
        return btn && !btn.hasAttribute('disabled');
      }, { timeout: 20000 }).catch(() => {
        console.warn("⚠️ لم يتم إزالة disabled تلقائياً، سيتم المحاولة بالنقر مباشرة.");
      });

      await page.waitForTimeout(1000);
      const submitBtn = page.locator('button[type="submit"], button.btn-primary, button:has-text("Log In"), button:has-text("تسجيل الدخول")').first();
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 35000 }).catch(() => {}),
        submitBtn.click()
      ]);
      await page.waitForTimeout(3000);
      console.log(`📍 الصفحة الحالية بعد تسجيل الدخول: ${page.url()}`);
    } else {
      console.log(`✅ مسجل الدخول مسبقاً في فوديكس.`);
    }

    for (const branch of branches) {
      console.log(`\n==================================================`);
      console.log(`🏢 بدء سحب مبيعات فوديكس لفرع: [${branch}]`);
      console.log(`==================================================`);

      for (const targetDate of targetDates) {
        const { display, iso } = targetDate;
        console.log(`\n--------------------------------------------------`);
        console.log(`📅 معالجة تاريخ: ${display} (${iso}) لفرع: ${branch}...`);

        // ---- 1) تقرير "المبيعات حسب التصنيف" ----
        console.log(`📊 جاري سحب تقرير المبيعات حسب التصنيف ليوم ${display} لفرع ${branch}...`);
        await prepareFoodicsReportPage(page, CATEGORY_REPORT_URL, branch, targetDate);
        const categoryRows = await extractCategoryTable(page);
        console.log("جدول التصنيفات المستخرج:", categoryRows);

        const mappedRows = [];
        categoryRows.forEach(r => {
          const targetCat = CATEGORY_MAP[r.category];
          if (targetCat) {
            const existing = mappedRows.find(m => m.category === targetCat);
            if (existing) {
              existing.qty += r.qty;
            } else {
              mappedRows.push({ category: targetCat, qty: r.qty });
            }
          }
        });

        // ---- 2) تقرير "المبيعات حسب المنتج" (منه: أم علي + مبيعات العصيرات) ----
        console.log(`🍩 جاري سحب تقرير المبيعات حسب المنتج لفرع ${branch}...`);
        await prepareFoodicsReportPage(page, PRODUCT_REPORT_URL, branch, targetDate);
        const products = await extractProductTable(page);
        const ummAliQty = findProductQty(products, UMM_ALI_PRODUCT_NAME);
        console.log(`كمية منتج أم علي المباعة ليوم ${display}: ${ummAliQty}`);
        
        const sandwichesFromUmmAli = ummAliQty / 2;
        if (sandwichesFromUmmAli > 0) {
          console.log(`تم إضافة ${sandwichesFromUmmAli} ساندويتش من مبيعات أم علي (${ummAliQty} حبة).`);
          const existing = mappedRows.find(r => r.category === UMM_ALI_TARGET_CATEGORY);
          if (existing) existing.qty += sandwichesFromUmmAli;
          else mappedRows.push({ category: UMM_ALI_TARGET_CATEGORY, qty: sandwichesFromUmmAli });
        }

        // احتياط: إذا كان جدول التصنيفات فارغاً أو ناقصاً، نستخرج مبيعات التصنيفات من جدول المنتجات التفصيلي مباشرة
        if (products && products.length) {
          console.log(`ℹ️ جاري مطابقة مبيعات ${products.length} منتج مع التصنيفات الرئيسية...`);
          products.forEach(p => {
            const pCat = p.category || "";
            const pName = p.name || "";
            const pCatNorm = normalizeArabic(pCat).toLowerCase();
            const pNameNorm = normalizeArabic(pName).toLowerCase();
            
            let targetCat = CATEGORY_MAP[pCat];
            if (!targetCat) {
              if (pCatNorm.includes("دجاج") || pNameNorm.includes("دجاج") || pNameNorm.includes("chicken")) targetCat = "دجاج";
              else if (pCatNorm.includes("لحم") || pNameNorm.includes("لحم") || pNameNorm.includes("meat")) targetCat = "لحم";
              else if (pCatNorm.includes("بحري") || pCatNorm.includes("سمك") || pNameNorm.includes("بحري") || pNameNorm.includes("سمك") || pNameNorm.includes("fish")) targetCat = "بحري";
              else if (pCatNorm.includes("فطور") || pCatNorm.includes("ساندويتش") || pNameNorm.includes("ساندويتش") || pNameNorm.includes("فطور")) targetCat = "ساندويتشات";
              else if (pCatNorm.includes("سلط") || pNameNorm.includes("سلط") || pNameNorm.includes("salad")) targetCat = "السلطات";
            }
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

        if (!mappedRows.length) {
          console.warn(`⚠️ تحذير: لم يتم العثور على مبيعات في فوديكس لفرع ${branch} في تاريخ ${iso} (أو الجدول فارغ لهذا اليوم).`);
        } else {
          // ---- 3) إرسال النتيجة لموقع برو هاوس ----
          console.log(`🚀 جاري إرسال البيانات لموقع Pro House (فرع ${branch} - تاريخ ${iso})...`);
          try {
            const res = await fetch(config.prohouseApiUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                action: "importSalesByCategory",
                integrationToken: config.integrationToken,
                payload: { date: iso, branch: branch, rows: mappedRows }
              })
            });
            const json = await res.json();
            if (!json.ok) console.warn("رفض السيرفر البيانات:", json.error);
          } catch (fetchErr) {
            console.warn("⚠ تعذر إرسال مبيعات التصنيفات إلى API:", fetchErr.message);
          }

          // نفس البيانات للنظام الجديد (Supabase)
          const supaUrl = config.supabaseUrl || "https://sadtinfdwucwrxlmwxov.supabase.co";
          const supaToken = config.supabaseToken || "83354f8b8614b5aa649f1828e05da526b42a69ac9d97ad36";
          try {
            await sendToSupabase("import_sales", iso, branch, mappedRows, supaUrl, supaToken);
            console.log(`☁️ تم تحديث مبيعات التصنيفات على Supabase لفرع ${branch}.`);
          } catch (supaErr) {
            console.warn(`⚠ تعذر تحديث Supabase (مبيعات التصنيفات لفرع ${branch}):`, supaErr.message);
          }
        }

        // ---- 4) مبيعات العصيرات (لصفحة جرد العصيرات) ----
        const juiceRows = pickJuiceRows(products, config.juiceCategories || DEFAULT_JUICE_CATEGORIES);
        if (juiceRows.length) {
          console.log(`🥤 جاري إرسال مبيعات ${juiceRows.length} عصير لفرع ${branch}...`);
          try {
            const juiceRes = await fetch(config.prohouseApiUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                action: "importJuiceSales",
                integrationToken: config.integrationToken,
                payload: { date: iso, branch: branch, rows: juiceRows }
              })
            });
            const juiceJson = await juiceRes.json();
            if (!juiceJson.ok) console.warn("⚠ فشل إرسال مبيعات العصيرات:", juiceJson.error);
            else console.log("🥤 تم إرسال مبيعات العصيرات:", juiceRows);
          } catch (jErr) {
            console.warn("⚠ خطأ شبكة أثناء إرسال مبيعات العصيرات:", jErr.message);
          }

          const supaUrl = config.supabaseUrl || "https://sadtinfdwucwrxlmwxov.supabase.co";
          const supaToken = config.supabaseToken || "83354f8b8614b5aa649f1828e05da526b42a69ac9d97ad36";
          try {
            await sendToSupabase("import_juice_sales", iso, branch, juiceRows, supaUrl, supaToken);
            console.log(`☁️ تم تحديث مبيعات العصيرات على Supabase لفرع ${branch}.`);
          } catch (supaErr) {
            console.warn(`⚠ تعذر تحديث Supabase (مبيعات العصيرات لفرع ${branch}):`, supaErr.message);
          }
        } else {
          console.log(`🥤 ما لقينا منتجات عصيرات بتقرير المنتجات لفرع ${branch} — تأكد من juiceCategories بـ config.json`);
        }

        if (mappedRows.length || juiceRows.length) {
          console.log(`🎉 تم سحب وإرسال بيانات ${iso} لفرع ${branch} بنجاح!`, mappedRows);

          // ---- 5) إشعارات الواتساب السحابية من GitHub Actions ----
          if ((config.whatsappPhone || config.adminPhone) && (config.whatsappApiKey || config.whatsappToken)) {
            const targetPhone = config.whatsappPhone || config.adminPhone;
            const key = config.whatsappApiKey || config.whatsappToken;
            const waText = encodeURIComponent(`📊 *تحديث سحابي أوتوماتيكي — Foodics*\n🏢 الفرع: ${branch}\n📅 التاريخ: ${iso}\n\n🎉 تم سحب وإرسال أحدث بيانات فوديكس بنجاح لفرع ${branch}.`);
            try {
              await fetch(`https://api.callmebot.com/whatsapp.php?phone=${targetPhone}&text=${waText}&apikey=${key}`);
              console.log("📲 تم إرسال إشعار الواتساب السحابي بنجاح!");
            } catch (waErr) {
              console.warn("⚠ تعذر إرسال إشعار الواتساب السحابي:", waErr.message);
            }
          }
        }
      }
    }

  } catch (err) {
    console.error("❌ فشل السحب:", err.message);
    await page.screenshot({ path: path.join(DOWNLOAD_DIR, "error-screenshot.png") }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
