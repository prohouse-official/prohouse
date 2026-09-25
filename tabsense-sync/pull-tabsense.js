// ==================== سحب تلقائي لتقرير "المبيعات حسب التصنيف" من تابسنس ====================
// سكربت أتمتة غير رسمي لسحب التقرير اليومي وإرساله لـ Pro House.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { PAYMENT_REPORT_URL, extractPaymentRows } = require("./payments");
const { MODIFIER_REPORT_URL, MEAL_WEIGHT_G, extractModifierRows, modifierGramsByCategory } = require("./modifiers");

const CONFIG_PATH = path.join(__dirname, "config.json");
if (!fs.existsSync(CONFIG_PATH)) {
  console.error("ما في ملف config.json — انسخ config.example.json وعبّي بياناتك فيه.");
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

const LOGIN_URL = "https://app.tabsense.ai/prohouse/dashboard/login";
const CATEGORY_REPORT_URL = "https://app.tabsense.ai/prohouse/dashboard/reports/sales-by-category";
const PRODUCT_REPORT_URL = "https://app.tabsense.ai/prohouse/dashboard/reports/sales-by-product";
const DOWNLOAD_DIR = path.join(__dirname, "downloads");

// تصنيفات تابسنس المتطابقة مع الأصناف عندنا
const CATEGORY_MAP = {
  "أطباق الدجاج": "دجاج",
  "أطباق اللحم": "لحم",
  "أطباق المأكولات البحرية": "بحري",
  "الدجاج": "دجاج",
  "اللحم": "لحم",
  "المأكولات البحرية": "بحري",
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
  "Breakfast": "ساندويتشات",
  "السلطات": "السلطات",
  "سلطات": "السلطات",
  "سلطة": "السلطات",
  "Salads": "السلطات",
  "Salad": "السلطات"
};

const UMM_ALI_PRODUCT_NAME = "ام علي";
const UMM_ALI_TARGET_CATEGORY = "ساندويتشات";

// تصنيفات تابسنس اللي منتجاتها بتعتبر عصيرات — بتتبعت لصفحة "جرد العصيرات" بالاسم.
// تقدر تغيّرها من config.json (juiceCategories) بدون ما تلمس الكود.
const DEFAULT_JUICE_CATEGORIES = ["العصائر", "عصائر", "المشروبات", "مشروبات", "Juices", "Juice", "Beverages", "Drinks"];
// احتياط لو تقرير المنتجات ما فيه عمود تصنيف أصلاً — بنعتمد على الاسم
const JUICE_NAME_HINTS = ["عصير", "juice"];

const VALID_BRANCHES = ["الروضة", "الشاطئ", "عبداللطيف جميل"];

// GitHub secrets حوّلت الاسم العربي لـ "????" من قبل، فالمتغير بملف الـ workflow (UTF-8) له الأولوية
function resolveBranch() {
  const candidate = String(process.env.TABSENSE_BRANCH || config.branch || "").trim();
  if (!VALID_BRANCHES.includes(candidate)) {
    throw new Error(`اسم الفرع غير صالح: "${candidate}". لازم يكون واحد من: ${VALID_BRANCHES.join("، ")}`);
  }
  return candidate;
}
const BRANCH = resolveBranch();

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
  // سحب أيام قديمة: BACKFILL_DAYS=14 بيسحب من 14 يوم لمبارح (زر التشغيل اليدوي بالـ workflow)
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

// إرسال لـ Supabase.
// على GitHub Actions: منستعمل هوية التشغيل الموقّعة من GitHub (OIDC) — ما في أي مفتاح سري بالكود.
// تشغيل محلي: بيحتاج supabaseToken بـ config.json (ما في قيمة افتراضية بالكود).
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
    if (!config.supabaseToken) throw new Error("ما في supabaseToken بـ config.json (تشغيل محلي)");
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

async function prepareReportPageAndSetDate(page, reportUrl, dateDisplay) {
  await page.goto(reportUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const arLangBtn = page.locator('a:has-text("ع"), button:has-text("ع")').first();
  if (await arLangBtn.isVisible().catch(() => false)) {
    await arLangBtn.click().catch(() => {});
    await page.waitForTimeout(2000);
  }

  await page.evaluate((d) => {
    const el = $('input[name="datefilter"]');
    if (el.length && el.data('daterangepicker')) {
      const picker = el.data('daterangepicker');
      picker.setStartDate(d);
      picker.setEndDate(d);
      el.val(d + ' - ' + d);
    } else {
      const input = document.querySelector('input[name="datefilter"]');
      if (input) {
        input.value = d + ' - ' + d;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    const btn = document.querySelector('#applyChartFilter') || document.querySelector('#applyChartFilterBlur') || document.querySelector('.applyBtn');
    if (btn) btn.click();
  }, dateDisplay);

  await page.waitForTimeout(3500);
}

async function extractCategoryTable(page) {
  return await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(th => th.innerText.trim());
    const catIdx = headers.findIndex(h => h.includes('التصنيف') || h.toLowerCase().includes('category'));
    // عمود المبلغ (اختياري): الإجمالي/صافي المبيعات
    let amtIdx = headers.findIndex(h => /صافي|net/i.test(h));
    if (amtIdx < 0) amtIdx = headers.findIndex(h => /الإجمالي|الاجمالي|إجمالي|اجمالي|المبلغ|total|amount/i.test(h));
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
          qty: parseFloat(qtyStr) || 0,
          amount: amtIdx >= 0 && tds[amtIdx] ? (parseFloat(tds[amtIdx].replace(/[^0-9.\-]/g, "")) || null) : null
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
    const targetDates = getTargetDates();
    console.log(`🔑 جاري تسجيل الدخول بتابسنس...`);
    await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
    await page.fill('input[type="email"], input[name="email"]', config.email);
    await page.fill('input[type="password"], input[name="password"]', config.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
      page.click('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("Login")')
    ]);

    for (const targetDate of targetDates) {
      const { display, iso } = targetDate;
      console.log(`\n--------------------------------------------------`);
      console.log(`📅 معالجة تاريخ: ${display} (${iso})...`);

      // ---- 1) تقرير "المبيعات حسب التصنيف" ----
      console.log(`📊 جاري سحب تقرير المبيعات حسب التصنيف ليوم ${display}...`);
      await prepareReportPageAndSetDate(page, CATEGORY_REPORT_URL, display);
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
      console.log("🍩 جاري سحب تقرير المبيعات حسب المنتج...");
      await prepareReportPageAndSetDate(page, PRODUCT_REPORT_URL, display);
      const products = await extractProductTable(page);
      // مبيعات كل منتج بالتفصيل (لتقارير الموقع)
      const productRows = products.filter(p => p.name && p.qty > 0);
      if (productRows.length) {
        try {
          await sendToSupabase("import_product_sales", iso, BRANCH, productRows);
          console.log(`🧾 تم حفظ مبيعات ${productRows.length} منتج ليوم ${iso}.`);
        } catch (prodErr) {
          console.warn("⚠ تعذر حفظ مبيعات المنتجات:", prodErr.message);
        }
      }
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

      // ---- 2ب) الإضافات (+50 دجاج/لحم/بحري): جزء من الوزن المستلم، فبتنحسب ضمن مبيعات التصنيف ----
      try {
        await prepareReportPageAndSetDate(page, MODIFIER_REPORT_URL, display);
        const modifierRows = await extractModifierRows(page);
        if (modifierRows.length) {
          await sendToSupabase("import_modifier_sales", iso, BRANCH, modifierRows);
          const grams = modifierGramsByCategory(modifierRows);
          Object.entries(grams).forEach(([cat, g]) => {
            const meals = Math.round((g / MEAL_WEIGHT_G) * 100) / 100;
            if (!meals || !mappedRows.length) return;
            const existing = mappedRows.find(r => r.category === cat);
            if (existing) existing.qty += meals;
            else mappedRows.push({ category: cat, qty: meals });
            console.log(`➕ إضافات ${cat}: ${g} جم = ${meals} وجبة`);
          });
        }
      } catch (modErr) {
        console.warn("⚠ تعذر سحب الإضافات:", modErr.message);
      }

      if (!mappedRows.length) {
        console.warn(`⚠️ تحذير: لم يتم العثور على مبيعات في تابسنس لفرع ${BRANCH} في تاريخ ${iso} (أو الجدول فارغ لهذا اليوم). سيتم تخطي الإرسال لهذا التاريخ والانتقال للتالي.`);
      } else {
        // ---- 3) إرسال النتيجة لموقع برو هاوس ----
        console.log(`🚀 جاري إرسال البيانات لموقع Pro House (فرع ${BRANCH} - تاريخ ${iso})...`);
        try {
          const res = await fetch(config.prohouseApiUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "importSalesByCategory",
              integrationToken: config.integrationToken,
              payload: { date: iso, branch: BRANCH, rows: mappedRows }
            })
          });
          const json = await res.json();
          if (!json.ok) console.warn("رفض السيرفر البيانات:", json.error);
        } catch (fetchErr) {
          console.warn("⚠ تعذر إرسال مبيعات التصنيفات إلى API:", fetchErr.message);
        }

        // نفس البيانات للنظام الجديد (Supabase)
        // تقرير تابسنس لفرع واحد، فما منكتبه لغير فرعه
        try {
          await sendToSupabase("import_sales", iso, BRANCH, mappedRows);
          console.log(`☁️ تم تحديث مبيعات التصنيفات على Supabase لفرع ${BRANCH}.`);
        } catch (supaErr) {
          console.warn(`⚠ تعذر تحديث Supabase (مبيعات التصنيفات لفرع ${BRANCH}):`, supaErr.message);
        }
      }

      // ---- 3ب) المبيعات حسب طريقة الدفع (لإغلاق العهدة: كاش مقابل مدى) ----
      try {
        await prepareReportPageAndSetDate(page, PAYMENT_REPORT_URL, display);
        const paymentRows = await extractPaymentRows(page);
        console.log(`💳 طرق الدفع ليوم ${iso}:`, paymentRows);
        if (paymentRows.length) {
          await sendToSupabase("import_payments", iso, BRANCH, paymentRows);
          console.log(`☁️ تم تحديث مبيعات طرق الدفع على Supabase لفرع ${BRANCH}.`);
        }
      } catch (payErr) {
        console.warn("⚠ تعذر سحب/إرسال المبيعات حسب طريقة الدفع:", payErr.message);
      }

      // ---- 4) مبيعات العصيرات (لصفحة جرد العصيرات) ----
      const juiceRows = pickJuiceRows(products, config.juiceCategories || DEFAULT_JUICE_CATEGORIES);
      if (juiceRows.length) {
        console.log(`🥤 جاري إرسال مبيعات ${juiceRows.length} عصير...`);
        try {
          const juiceRes = await fetch(config.prohouseApiUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "importJuiceSales",
              integrationToken: config.integrationToken,
              payload: { date: iso, branch: BRANCH, rows: juiceRows }
            })
          });
          const juiceJson = await juiceRes.json();
          if (!juiceJson.ok) console.warn("⚠ فشل إرسال مبيعات العصيرات:", juiceJson.error);
          else console.log("🥤 تم إرسال مبيعات العصيرات:", juiceRows);
        } catch (jErr) {
          console.warn("⚠ خطأ شبكة أثناء إرسال مبيعات العصيرات:", jErr.message);
        }
        try {
          await sendToSupabase("import_juice_sales", iso, BRANCH, juiceRows);
          console.log(`☁️ تم تحديث مبيعات العصيرات على Supabase لفرع ${BRANCH}.`);
        } catch (supaErr) {
          console.warn(`⚠ تعذر تحديث Supabase (مبيعات العصيرات لفرع ${BRANCH}):`, supaErr.message);
        }
      } else {
        console.log("🥤 ما لقينا منتجات عصيرات بتقرير المنتجات — تأكد من juiceCategories بـ config.json");
      }

      if (mappedRows.length || juiceRows.length) {
        console.log(`🎉 تم سحب وإرسال بيانات ${iso} لفرع ${BRANCH} بنجاح!`, mappedRows);

        // ---- 5) إشعارات الواتساب السحابية من GitHub Actions ----
        if ((config.whatsappPhone || config.adminPhone) && (config.whatsappApiKey || config.whatsappToken)) {
          const targetPhone = config.whatsappPhone || config.adminPhone;
          const key = config.whatsappApiKey || config.whatsappToken;
          const waText = encodeURIComponent(`📊 *تحديث سحابي أوتوماتيكي — Pro House*\n🏢 الفرع: ${BRANCH}\n📅 التاريخ: ${iso}\n\n🎉 تم سحب وإرسال أحدث بيانات تابسنس بنجاح لفرع ${BRANCH}.`);
          try {
            await fetch(`https://api.callmebot.com/whatsapp.php?phone=${targetPhone}&text=${waText}&apikey=${key}`);
            console.log("📲 تم إرسال إشعار الواتساب السحابي بنجاح!");
          } catch (waErr) {
            console.warn("⚠ تعذر إرسال إشعار الواتساب السحابي:", waErr.message);
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
