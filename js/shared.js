// ==================== أدوات مشتركة بين كل الشاشات ====================
// هالملف بينحمّل بعد config.js مباشرة وقبل أي وحدة شاشة، لأن الوحدات بتنادي هالدوال
// وقت التحميل. كانت هالأدوات ساكنة جوا js/entry.js (شاشة الاستلام القديمة)، وهاد خلّى
// ١٢ ملف يعتمدوا على ملف شاشة — ولما تغيّر ترتيب التحميل انهار نص التطبيق.
// أي أداة بيحتاجها أكثر من شاشة مكانها هون، مو جوا ملف شاشة.

// ---- أعتاب التنبيهات ----
const SHORTAGE_THRESHOLD_DEFAULT = -0.20;
const SURPLUS_THRESHOLD_DEFAULT  = 0.25;
const RETURN_THRESHOLD_DEFAULT   = 0.30;

// تُقرأ من شاشة الإعدادات (currentSettings مُعرّفة بـ js/settings.js) إن كانت محفوظة، وإلا القيم الافتراضية فوق.
function thresholdFrom(key, fallback) {
  const v = (typeof currentSettings !== "undefined" && currentSettings[key] !== undefined && currentSettings[key] !== "")
    ? Number(currentSettings[key]) : NaN;
  return isNaN(v) ? fallback : v;
}

// ---- الوجبات ----
// الوجبة عند برو هاوس ~150 جرام — نحسب عدد الوجبات للأصناف اللي بتتوزن (دجاج/لحم/بحري) فقط
const MEAL_WEIGHT_G = 150;
const MEAL_CATEGORIES = ["دجاج", "لحم", "بحري", "ساندويتشات"];
// ---- ملصق وأيقونة التصنيف ----
function categoryIconSticker(catName) {
  if (!catName) return "📂";
  const c = String(catName).trim();
  if (c.includes("دجاج")) return "🍗";
  if (c.includes("لحم")) return "🥩";
  if (c.includes("بحري") || c.includes("سمك") || c.includes("أسماك")) return "🐟";
  if (c.includes("فطور") || c.includes("ساندويتش")) return "🥪";
  if (c.includes("عصير")) return "🥤";
  if (c.includes("سلط")) return "🥗";
  if (c.includes("حلو") || c.includes("حلويات")) return "🍰";
  if (c.includes("صوص")) return "🧄";
  if (c.includes("كارب") || c.includes("أرز") || c.includes("ارز")) return "🍚";
  if (c.includes("معدات") || c.includes("أدوات")) return "🛠️";
  return "📂";
}

function isMealCategory(cat) { return MEAL_CATEGORIES.includes(cat); }
function mealsCount(grams) {
  const n = Number(grams);
  if (grams === "" || grams === null || grams === undefined || isNaN(n)) return "";
  return (n / MEAL_WEIGHT_G).toFixed(1);
}

// ---- الفروع الشغّالة فعلياً (سجّلت استلام آخر 14 يوم) ----
const ActiveBranches = {
  KEY: "ph_active_branches",
  list() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; }
  },
  async refresh() {
    if (typeof SupaEngine === "undefined" || typeof SUPABASE_URL === "undefined" || !SUPABASE_URL) return;
    try {
      const since = addDaysStr(todayStr(), -14);
      localStorage.setItem(this.KEY, JSON.stringify(await SupaEngine.getActiveBranches(since)));
    } catch (e) { /* منضل على آخر قائمة معروفة */ }
  }
};

// الفروع المسموحة بدون الفروع اللي ما عم تستعمل النظام (إذا ما عرفنا مين شغّال، منرجع الكل)
function workingBranchList() {
  const allowed = allowedBranchList();
  const active = ActiveBranches.list().filter(b => allowed.includes(b));
  return active.length ? active : allowed;
}

// ---- الفرع الحالي ----
// آخر فرع اختاره المستخدم، بس إذا كان فرع مش شغّال منفتح على فرع شغّال بدالو
const Branch = {
  get() {
    const saved = localStorage.getItem("ph_branch") || "";
    const working = workingBranchList();
    if (saved && working.includes(saved)) return saved;
    return working[0] || saved;
  },
  set(name) { localStorage.setItem("ph_branch", name); }
};

// ---- شريط "تراجع" بعد شيل صنف ----
function showUndoBar(message, onUndo, ms = 8000) {
  document.querySelectorAll(".undo-bar").forEach(el => el.remove());
  const bar = document.createElement("div");
  bar.className = "undo-bar";
  bar.innerHTML = `<span></span><button type="button">↩️ تراجع</button>`;
  bar.querySelector("span").textContent = message;
  const timer = setTimeout(() => bar.remove(), ms);
  bar.querySelector("button").addEventListener("click", async () => {
    clearTimeout(timer);
    bar.remove();
    try {
      await onUndo();
      showToast("↩️ رجع الصنف مع أرقامه");
    } catch (e) {
      showToast("⚠ تعذّر التراجع — " + (e.message || e));
    }
  });
  document.body.appendChild(bar);
}

// بتشيل الصنف من قائمة المستبعدين عالسيرفر وبترجّع صفه متل ما كان
async function restoreRemovedItem(date, branch, itemId, savedRows) {
  if (typeof SupaEngine === "undefined" || typeof SUPABASE_URL === "undefined" || !SUPABASE_URL) return;
  const day = await SupaEngine.getDay(date, branch);
  const stillRemoved = ((day && day.removedItemIds) || []).filter(id => id !== itemId);
  await SupaEngine.saveDay({ date, branch, removedItemIds: stillRemoved });
  await SupaEngine.restoreEntryRows(savedRows);
}

// ---- حماية من مسح أرقام محفوظة بالغلط ----
// قبل الحفظ منقارن مع اللي عالسيرفر: إذا صنف إلو رقم محفوظ ورح ينحفظ فاضي/صفر، منسأل أول
async function confirmNoDataLoss(kind, date, branch, itemsPayload) {
  if (typeof SupaEngine === "undefined" || typeof SUPABASE_URL === "undefined" || !SUPABASE_URL) return true;
  let server;
  try { server = await SupaEngine.getDay(date, branch); } catch (e) { return true; }
  const byId = new Map(((server && server.items) || []).map(r => [r.itemId, r]));
  const isBlank = (v) => v === "" || v === null || v === undefined;
  const lost = [];
  itemsPayload.forEach(it => {
    const row = byId.get(it.itemId);
    if (!row) return;
    if (kind === "received") {
      const old = Number(row.received) || 0;
      if (old > 0 && (isBlank(it.received) || Number(it.received) === 0)) lost.push(`• ${it.itemName}: ${old} ← 0`);
    } else {
      const old = [row.remainingWeight, row.remaining, row.remainingSauce].find(v => !isBlank(v));
      if (!isBlank(old) && isBlank(it.remaining) && isBlank(it.remainingWeight) && isBlank(it.remainingSauce)) lost.push(`• ${it.itemName}: ${old} ← فاضي`);
    }
  });
  if (!lost.length) return true;
  const sample = lost.slice(0, 4).join("\n") + (lost.length > 4 ? "\n…" : "");
  return confirm(`⚠️ انتبه: الحفظ رح يمسح أرقام محفوظة لـ ${lost.length} صنف:\n${sample}\n\nإذا الشاشة عم تعرض أصفار بالغلط، اكبس "إلغاء" وحدّث الصفحة.\nمتأكد بدك تحفظ؟`);
}

function branchList() {
  const raw = (typeof currentSettings !== "undefined" && currentSettings.branches) || DEFAULT_BRANCHES_FALLBACK;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

// الفروع المسموحة للمستخدم المسجّل دخول (مالك/شيف بيشوفوا الكل، الباقي بس فروعهم)
function allowedBranchList() {
  const all = branchList();
  if (Auth.canSeeAllBranches()) return all;
  const mine = Auth.branches();
  return all.filter(b => mine.includes(b));
}

function branchOptionsHtml(selected) {
  const current = selected || Branch.get();
  return `<option value="">اختر الفرع</option>` + allowedBranchList().map(b =>
    `<option value="${b}" ${b === current ? "selected" : ""}>${b}</option>`
  ).join("");
}

// ---- واجهة ----
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// يحوّل اسم تصنيف عربي لمعرّف صالح كـ id بالـ DOM
function cssId(str) { return str.replace(/[^a-zA-Z0-9_؀-ۿ]/g, "_"); }

// ---- الكمية المطلوبة من طلبية الغد ----
// (من طلبية الغد يلي انحطت أمس مستهدفة هالتاريخ + هالفرع بالظبط)
async function loadRequestedQty(date, branch) {
  const data = await Sync.get("getTomorrowOrder", { date, branch }, "tomorrow:" + date + ":" + branch);
  const map = {};
  (data || []).forEach(it => { map[it.itemId] = it.qty; });
  return map;
}

// ---- وضع العرض المدمج بسطر واحد لتقليل السكرول للجوال (Compact View Mode) ----
function isCompactMode() {
  return localStorage.getItem("prohouse_compact_mode") === "true";
}

function toggleCompactMode() {
  const next = !isCompactMode();
  localStorage.setItem("prohouse_compact_mode", String(next));
  applyCompactModeUI();
  showToast(next ? "⚡ تم تفعيل العرض المدمج (سطر واحد)" : "📖 تم العودة للعرض الموسع");
}

function applyCompactModeUI() {
  const active = isCompactMode();
  document.body.classList.toggle("compact-mode", active);
  document.querySelectorAll(".compact-toggle-btn").forEach(btn => {
    btn.innerHTML = active 
      ? "📖 التبديل للعرض الموسع" 
      : "🗜️ عرض مدمج (تقليل السكرول)";
    btn.classList.toggle("active", active);
  });
}

function renderCompactToggleBtnHtml() {
  const active = isCompactMode();
  return `
    <button type="button" class="btn compact-toggle-btn ${active ? 'active' : ''}" onclick="toggleCompactMode()" title="تبديل كثافة العرض لتقليل السكرول بالجوال">
      ${active ? '📖 التبديل للعرض الموسع' : '🗜️ عرض مدمج (تقليل السكرول)'}
    </button>
  `;
}

// تطبيق الوضع المحفوظ فوراً عند تحميل الصفحة
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyCompactModeUI);
  } else {
    applyCompactModeUI();
  }
}

