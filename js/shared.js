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
// الفرع اللي اختاره المستخدم بإيده بهالجلسة بيضل مختار (حتى لو ما فيه إدخالات قريبة، متل الروضة والشاطئ).
// غير هيك (أول فتح) منفتح على فرع شغّال لحتى ما يعلق الجوال على فرع قديم.
const Branch = {
  get() {
    const saved = localStorage.getItem("ph_branch") || "";
    let chosen = "";
    try { chosen = sessionStorage.getItem("ph_branch_chosen") || ""; } catch (e) {}
    if (saved && chosen === saved && allowedBranchList().includes(saved)) return saved;
    const working = workingBranchList();
    if (saved && working.includes(saved)) return saved;
    return working[0] || saved;
  },
  set(name) {
    localStorage.setItem("ph_branch", name);
    try { sessionStorage.setItem("ph_branch_chosen", name); } catch (e) {}
  }
};

// ---- الإدخال السريع: شريط تقدم، زر "الصنف الجاي"، وزر "التالي" بالكيبورد ----
// أي خانة إدخال رئيسية عليها class="entry-input" بتدخل بالحساب
function entryProgressHtml() {
  return `<div class="entry-progress">
    <div class="entry-progress-top"><span class="entry-progress-text"></span></div>
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
  bar.querySelector(".entry-progress-fill").style.width = (inputs.length ? Math.round((filled * 100) / inputs.length) : 0) + "%";
  bar.querySelector(".entry-progress-text").textContent = !inputs.length ? "" : (allDone ? "✅ خلصت كلها" : `✏️ ${filled} من ${inputs.length}`);
  // زر "الصنف الجاي" فوق شريط الحفظ الثابت تحت — يضل ظاهر وأنت تنزل
  const next = document.querySelector(`.entry-next-btn[data-view="${view.id}"]`);
  if (next) next.classList.toggle("hidden", allDone || !inputs.length);
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
    const nb = e.target.closest && e.target.closest(".entry-next-btn");
    if (nb) { jumpToNextEmpty(document.getElementById(nb.dataset.view)); return; }
    const view = e.target.closest && e.target.closest(".view");
    if (!view || !view.querySelector(".entry-progress")) return;
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
  const time = new Date().toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" });
  if (state === "saving") return "⏳ جاري الحفظ…";
  if (state === "saved") return `✓ تم الحفظ تلقائياً ${time}`;
  return "⚠ لم يتم الحفظ، نعيد المحاولة — " + ((e && e.message) || "");
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
  return phConfirm(`⚠️ انتبه: الحفظ يمسح أرقام محفوظة لـ ${lost.length} صنف:\n${sample}\n\nإذا الشاشة تعرض أصفار بالغلط، اضغط "لا" وحدّث الصفحة.\nمتأكد تبي تحفظ؟`);
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
  return phDialog({ message, ok: "نعم", cancel: "لا", ...opts });
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
const CHEF_SLOT_CATS = ["دجاج", "لحم", "بحري"];
// صنف شيف = خانة شيف اختيارية، أو صنف ثابت اسمه "... الشيف 1" (لحم الشيف 1، سمك الشيف 1)
function isChefItem(it) {
  return !!(it && usesChefSlots(it.category) && /الشيف\s*\d+\s*$/.test(String(it.name || "")));
}
// "بيكانت" ← "دجاج بيكانت" (الاسم الكامل بينحفظ مع التصنيف)
function normalizeCookName(category, name) {
  const v = String(name || "").trim().replace(/\s+/g, " ");
  if (!v) return "";
  return v.startsWith(String(category || "").trim()) ? v : `${category} ${v}`;
}

// ذاكرة أسماء الطبخات: من السجل (آخر 120 يوم) + اللي بينكتب بهالجلسة
const chefNameMemory = {};
let chefNameMemoryLoaded = null;
function rememberCookName(category, name) {
  if (!category || !name) return;
  (chefNameMemory[category] = chefNameMemory[category] || new Set()).add(name);
}
function loadChefNameMemory() {
  if (chefNameMemoryLoaded) return chefNameMemoryLoaded;
  chefNameMemoryLoaded = (typeof SupaEngine !== "undefined" && SupaEngine.getRecentCookNames
    ? SupaEngine.getRecentCookNames().then(rows => rows.forEach(r => {
        const it = Items.byId(r.itemId);
        if (it) rememberCookName(it.category, normalizeCookName(it.category, r.cookName));
      }))
    : Promise.resolve()).catch(() => {});
  return chefNameMemoryLoaded;
}
function chefNameDatalistHtml(category) {
  const id = "chefdl-" + CHEF_SLOT_CATS.indexOf(category);
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<datalist id="${id}">${chefDishOptions(category).map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>`;
}
function usesChefSlots(category) { return CHEF_SLOT_CATS.includes(String(category || "").trim()); }

function chefSlotsFor(category, branch) {
  return (Items.current || [])
    .filter(it => it.category === category && isChefSlot(it))
    .filter(it => { const b = itemBranches(it); return !b.length || !branch || b.includes(branch); })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar", { numeric: true }));
}

// أسماء الطبخات اللي انسجلت قبل بهالتصنيف (دجاج بيكانت، بالكريمة، تكا…)
function chefDishOptions(category, extraNames) {
  const names = new Set();
  (Items.current || []).forEach(it => {
    if (it.category !== category || !isOptionalItem(it) || isChefSlot(it) || /الشيف/.test(it.name)) return;
    names.add(String(it.name).trim());
  });
  (extraNames || []).forEach(n => { if (n && String(n).trim().startsWith(category)) names.add(String(n).trim()); });
  (chefNameMemory[category] || []).forEach(n => names.add(n));
  return Array.from(names).sort((a, b) => a.localeCompare(b, "ar"));
}

function focusEntryById(id) {
  const inp = document.getElementById(id);
  if (inp) { inp.scrollIntoView({ block: "center", behavior: "smooth" }); inp.focus({ preventScroll: true }); }
}

// نافذة اختيار الطبخة: بتعبّي أول خانة شيف فاضية (1 ثم 2 ثم 3)
async function openChefPicker({ category, branch, isUsed, extraNames, onPick }) {
  await loadChefNameMemory();
  const slots = chefSlotsFor(category, branch);
  const free = slots.filter(it => !isUsed(it.id));
  if (!free.length) {
    phAlert(slots.length ? `كل خانات ${category} الشيف (${slots.length}) مستخدمة.` : `ما فيه خانات شيف لتصنيف ${category}.`);
    return;
  }
  const slot = free[0];
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const options = chefDishOptions(category, extraNames);
  const wrap = document.createElement("div");
  wrap.className = "ph-dialog";
  wrap.innerHTML = `
    <div class="ph-dialog-card chef-picker" role="dialog" aria-modal="true">
      <img class="ph-dialog-logo" src="assets/logo.png" alt="">
      <div class="ph-dialog-title">➕ ${esc(slot.name)}</div>
      <div class="ph-dialog-msg">اختار الطبخة:</div>
      <div class="chef-picker-list">
        ${options.map(n => `<button type="button" class="chef-opt" data-name="${esc(n)}">${esc(n)}</button>`).join("")}
        <button type="button" class="chef-opt plain" data-name="">${esc(slot.name)} (بدون اسم)</button>
      </div>
      <input class="ph-dialog-input chef-new" type="text" inputmode="text" placeholder="أو اكتب اسم طبخة جديدة">
      <div class="ph-dialog-actions">
        <button type="button" class="ph-dialog-ok chef-add-new">إضافة</button>
        <button type="button" class="ph-dialog-cancel">إلغاء</button>
      </div>
    </div>`;
  const close = () => { wrap.classList.add("closing"); setTimeout(() => wrap.remove(), 160); };
  const pick = (name) => {
    close();
    const full = normalizeCookName(category, name);
    rememberCookName(category, full);
    onPick(slot, full);
  };
  wrap.querySelectorAll(".chef-opt").forEach(b => b.addEventListener("click", () => pick(b.dataset.name)));
  wrap.querySelector(".chef-add-new").addEventListener("click", () => {
    const v = wrap.querySelector(".chef-new").value.trim();
    if (!v) { showToast("اكتب اسم الطبخة أو اختار من القائمة"); return; }
    pick(v);
  });
  wrap.querySelector(".ph-dialog-cancel").addEventListener("click", close);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("open"));
}

// "دجاج الشيف 1" + "دجاج بيكانت" ← "دجاج الشيف 1 (بيكانت)"
function chefSlotName(it, cookName) {
  const dish = String(cookName || "").trim();
  if (!dish) return it.name;
  const cat = String(it.category || "").trim();
  const short = dish.replace(new RegExp("^" + cat + "\\s+"), "").trim() || dish;
  return `${it.name} (${short})`;
}

// ---- العرض المدمج دائماً (انشال زر التبديل) ----
function applyCompactModeUI() {
  document.body.classList.add("compact-mode");
}

// تطبيق الوضع المحفوظ فوراً عند تحميل الصفحة
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyCompactModeUI);
  } else {
    applyCompactModeUI();
  }
}

