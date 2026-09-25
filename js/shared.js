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

// ---- الإدخال السريع: شريط تقدم، زر "الصنف الجاي"، وزر "التالي" بالكيبورد ----
// أي خانة إدخال رئيسية عليها class="entry-input" بتدخل بالحساب
function entryProgressHtml() {
  return `<div class="entry-progress">
    <div class="entry-progress-top"><span class="entry-progress-text"></span><button type="button" class="entry-next-btn">⤵ الصنف الجاي</button></div>
    <div class="entry-progress-track"><div class="entry-progress-fill"></div></div>
  </div>`;
}

function entryInputs(view) {
  if (!view) return [];
  return Array.from(view.querySelectorAll("input.entry-input"))
    .filter(i => !i.disabled && i.offsetParent !== null || (!i.disabled && i.closest(".category-section.collapsed")));
}

function updateEntryProgress(view) {
  const bar = view && view.querySelector(".entry-progress");
  if (!bar) return;
  const inputs = entryInputs(view);
  const filled = inputs.filter(i => i.value !== "").length;
  const allDone = inputs.length > 0 && filled >= inputs.length;
  bar.querySelector(".entry-progress-text").textContent = inputs.length ? `✏️ ${filled} من ${inputs.length}` : "";
  bar.querySelector(".entry-progress-fill").style.width = (inputs.length ? Math.round((filled * 100) / inputs.length) : 0) + "%";
  const btn = bar.querySelector(".entry-next-btn");
  btn.textContent = allDone ? "✅ خلصت كلها" : "⤵ الصنف الجاي";
  btn.disabled = allDone;
  const topbar = document.querySelector(".app-topbar");
  if (topbar) bar.style.top = topbar.offsetHeight + "px";
}

function focusEntry(input) {
  const section = input.closest(".category-section.collapsed");
  if (section) section.classList.remove("collapsed");
  input.scrollIntoView({ block: "center", behavior: "smooth" });
  input.focus({ preventScroll: true });
}

function jumpToNextEmpty(view) {
  const next = entryInputs(view).find(i => i.value === "");
  if (next) focusEntry(next);
}

if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (e.key !== "Enter" || !t.classList || !t.classList.contains("entry-input")) return;
    e.preventDefault();
    const inputs = entryInputs(t.closest(".view"));
    const next = inputs[inputs.indexOf(t) + 1];
    if (next) focusEntry(next); else t.blur();
  });
  document.addEventListener("input", (e) => {
    if (e.target.classList && e.target.classList.contains("entry-input")) updateEntryProgress(e.target.closest(".view"));
  });
  // أزرار "= المطلوب" و"لم يصل" و"0" بتغيّر القيمة من الكود، فمنعيد الحساب بعد أي كبسة
  document.addEventListener("click", (e) => {
    const view = e.target.closest && e.target.closest(".view");
    if (!view || !view.querySelector(".entry-progress")) return;
    if (e.target.closest(".entry-next-btn")) { jumpToNextEmpty(view); return; }
    setTimeout(() => updateEntryProgress(view), 0);
  });
}

// ---- حفظ تلقائي: بيبعت بس الأصناف اللي تغيّرت وإلها قيمة (الفاضي ما بيمسح رقم محفوظ أبداً) ----
function createAutosaver({ delay = 1500, collect, send, onStatus }) {
  let timer = null;
  let running = false;
  async function run() {
    if (running) { schedule(); return; }
    const job = collect();
    if (!job || !job.items.length) return;
    running = true;
    onStatus("saving");
    try {
      await send(job);
      job.commit();
      onStatus("saved");
    } catch (e) {
      onStatus("error", e);
      timer = setTimeout(run, 10000);
    } finally {
      running = false;
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }
  const saver = { schedule, flush: run };
  allAutosavers.push(saver);
  return saver;
}

const allAutosavers = [];
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") allAutosavers.forEach(a => a.flush());
  });
}

function autosaveStatusText(state, e) {
  const time = new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  if (state === "saving") return "⏳ جاري الحفظ…";
  if (state === "saved") return `✓ انحفظ تلقائياً ${time}`;
  return "⚠ ما انحفظ، بنعيد المحاولة — " + ((e && e.message) || "");
}

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
  return phConfirm(`⚠️ انتبه: الحفظ بيمسح أرقام محفوظة لـ ${lost.length} صنف:\n${sample}\n\nإذا الشاشة تعرض أصفار بالغلط، اضغط "لا" وحدّث الصفحة.\nمتأكد تبي تحفظ؟`);
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
// ---- نوافذ برو هاوس (بدل confirm/alert/prompt تبع المتصفح) ----
function phDialog({ title = "", message = "", ok = "تمام", cancel = null, danger = false, input = null }) {
  return new Promise((resolve) => {
    const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const wrap = document.createElement("div");
    wrap.className = "ph-dialog";
    wrap.innerHTML = `
      <div class="ph-dialog-card" role="dialog" aria-modal="true">
        <img class="ph-dialog-logo" src="assets/logo.png" alt="">
        ${title ? `<div class="ph-dialog-title">${esc(title)}</div>` : ""}
        ${message ? `<div class="ph-dialog-msg">${esc(message)}</div>` : ""}
        ${input !== null ? `<input class="ph-dialog-input" type="text" inputmode="numeric" value="${esc(input)}">` : ""}
        <div class="ph-dialog-actions">
          <button type="button" class="ph-dialog-ok${danger ? " danger" : ""}">${esc(ok)}</button>
          ${cancel ? `<button type="button" class="ph-dialog-cancel">${esc(cancel)}</button>` : ""}
        </div>
      </div>`;
    const field = wrap.querySelector(".ph-dialog-input");
    const close = (val) => {
      document.removeEventListener("keydown", onKey, true);
      wrap.classList.add("closing");
      setTimeout(() => wrap.remove(), 160);
      resolve(val);
    };
    const okVal = () => (input !== null ? field.value : true);
    const cancelVal = input !== null ? null : false;
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(cancel ? cancelVal : okVal()); }
      if (e.key === "Enter") { e.preventDefault(); close(okVal()); }
    }
    wrap.querySelector(".ph-dialog-ok").addEventListener("click", () => close(okVal()));
    const cBtn = wrap.querySelector(".ph-dialog-cancel");
    if (cBtn) cBtn.addEventListener("click", () => close(cancelVal));
    wrap.addEventListener("click", (e) => { if (e.target === wrap && cancel) close(cancelVal); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("open"));
    (field || wrap.querySelector(".ph-dialog-ok")).focus({ preventScroll: true });
  });
}
function phConfirm(message, opts = {}) {
  return phDialog({ message, ok: "إيه", cancel: "لا", ...opts });
}
function phAlert(message, opts = {}) {
  return phDialog({ message, ok: "تمام", ...opts });
}
function phPrompt(message, value = "", opts = {}) {
  return phDialog({ message, input: value, ok: "حفظ", cancel: "إلغاء", ...opts });
}

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
  return (await loadRequestedOrder(date, branch)).qty;
}

// الطلبية المعتمدة لهاليوم: الكميات + اسم الطبخة لخانات الشيف
async function loadRequestedOrder(date, branch) {
  const data = await Sync.get("getTomorrowOrder", { date, branch }, "tomorrow:" + date + ":" + branch);
  const qty = {}, cook = {};
  (data || []).forEach(it => { qty[it.itemId] = it.qty; if (it.cookName) cook[it.itemId] = it.cookName; });
  return { qty, cook };
}

// ---- الأصناف الثابتة والاختيارية ----
// الصنف الاختياري (مثل دجاج الشيف 1/2/3 أو طبخة بتنعمل أحياناً) ما بيطلع إلا باليوم اللي انطلب فيه
function isOptionalItem(it) {
  return !!(it && (it.optional === true || it.optional === "TRUE" || it.optional === "true"));
}
function isChefSlot(it) {
  return isOptionalItem(it) && /الشيف\s*\d+\s*$/.test(String(it.name || ""));
}
// "دجاج الشيف 1" + "دجاج بيكانت" ← "دجاج الشيف 1 (بيكانت)"
function chefSlotName(it, cookName) {
  const dish = String(cookName || "").trim();
  if (!dish) return it.name;
  const cat = String(it.category || "").trim();
  const short = dish.replace(new RegExp("^" + cat + "\\s+"), "").trim() || dish;
  return `${it.name} (${short})`;
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

