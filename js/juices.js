// ==================== الجرد اليومي: صفحة العصيرات + صفحة البروتين بار (عدّ يومي + إضافات + مطابقة مبيعات) ====================
// نفس الشاشة بوضعين: juiceMode = "juice" (جرد العصيرات) أو "snack" (جرد البروتين بار) — كل صنف له kind،
// وكل فرع يشوف أصنافه بس (حسب «الفروع» بالكتالوج).
//
// المعادلة لكل عصير:  المتوقع = افتتاحي + إضافات − مبيعات
//                      الفرق   = العدّ الفعلي − المتوقع
// سالب = نقص/هدر، موجب = زيادة غير مفسّرة، صفر = مطابق.
//
// الافتتاحي بيتعبّى تلقائياً من "العدّ الفعلي" لأمس بنفس الفرع (سلسلة متصلة، ما حدا يعيد كتابته كل يوم)،
// والمبيعات بتتعبّى تلقائياً من تابسنس بمطابقة الاسم — والاثنين قابلين للتعديل اليدوي لو الواقع مختلف.

const JUICE_MODES = {
  snack: { tab: "🍫 البروتين بار والحلى", noun: "صنف", none: "ما فيه أصناف بروتين بار لهذا الفرع — أضفها من الكرت تحت." },
  juice: { tab: "🥤 المشروبات", noun: "مشروب", none: "ما فيه مشروبات مضافة لهذا الفرع — أضفها من الكرت تحت." }
};
let juiceMode = "snack";
const juiceM = () => JUICE_MODES[juiceMode] || JUICE_MODES.juice;
const juiceKind = (j) => (j.kind === "snack" ? "snack" : "juice");

const JUICE_VARIANCE_TOLERANCE = 0; // فرق أكبر من هيك (بالمطلق) بيتعلّم كتنبيه

const Juices = (() => {
  let current = [];
  let loadingPromise = null;

  function isActive(j) { return j.active !== false && j.active !== "FALSE"; }

  async function load() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      const data = await Sync.get("getJuices", { all: "1" }, "juices_v1", (val) => {
        current = (val || []).filter(isActive);
        if (!document.getElementById("juicesView").classList.contains("hidden")) renderJuicesView();
      });
      if (data) current = data.filter(isActive);
      return current;
    })();
    try { return await loadingPromise; }
    finally { loadingPromise = null; }
  }

  function newId() {
    return (crypto.randomUUID ? crypto.randomUUID() : "juice-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  }

  function save(juice) {
    if (!juice.id) juice.id = newId();
    juice.active = true;
    const idx = current.findIndex(j => j.id === juice.id);
    if (idx >= 0) current[idx] = { ...current[idx], ...juice };
    else current.push(juice);
    Sync.cacheSet("juices_v1", current);
    Sync.enqueue("saveJuice:" + juice.id, "saveJuice", juice);
    return juice;
  }

  function remove(id) {
    current = current.filter(j => j.id !== id);
    Sync.cacheSet("juices_v1", current);
    Sync.enqueue("deleteJuice:" + id, "deleteJuice", { id });
  }

  return { load, save, remove, newId, get current() { return current; } };
})();

// ---- مطابقة أسماء المنتجات القادمة من تابسنس ----
// تابسنس بيرجّع الاسم متل ما هو مكتوب بالكاشير — فيه فروقات مسافات/همزات/تشكيل عن الاسم عنا.
// نطبّع الطرفين قبل المقارنة، وإذا حطّ المالك "اسم تابسنس" صراحةً بالكتالوج بيكون هو الأولوية.
function normalizeArabic(str) {
  return String(str || "")
    .replace(/[ً-ْٰ]/g, "")   // تشكيل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")                        // تطويل
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

let currentJuiceDate = todayStr();
let currentJuiceBranch = "";
let currentJuiceEntry = {};   // juiceId -> {opening, added, sold, counted, notes}
let juicePrevCounted = {};    // juiceId -> إقفال أمس
let juiceSalesMap = {};       // normalized product name -> qty (من تابسنس)
let currentVisibleJuices = [];

function juiceBranches(j) {
  return (j.branches || "").split(",").map(s => s.trim()).filter(Boolean);
}

function visibleJuicesFor(branch, allKinds) {
  return Juices.current.filter(j => allKinds || juiceKind(j) === juiceMode).filter(j => {
    const list = juiceBranches(j);
    return list.length === 0 || list.includes(branch);
  });
}

// المبيعات المسحوبة تلقائياً لهذا العصير (أو undefined لو ما في تطابق)
// «اسم تابسنس» ممكن يكون أكثر من اسم مفصولة بـ | (كل فرع اسمه بالكاشير مختلف، أو نكهتين لنفس الصنف) — منجمعهم
function autoSoldFor(juice) {
  const names = juice.tabsenseName ? String(juice.tabsenseName).split("|") : [juice.name];
  const keys = [...new Set(names.map(normalizeArabic).filter(Boolean))];
  let found = false, total = 0;
  keys.forEach(k => { if (juiceSalesMap[k] !== undefined) { found = true; total += Number(juiceSalesMap[k]) || 0; } });
  return found ? total : undefined;
}

function num(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// المتوقع بينحسب بس لما يكون في رقم افتتاحي على الأقل — بدونه المعادلة بلا معنى
// لو ما انعدّ الصبح، منحسب من إغلاق أمس
function juiceExpected(e, prev) {
  const opening = num(e.opening) !== null ? num(e.opening) : num(prev);
  if (opening === null) return null;
  return opening + (num(e.added) || 0) - (num(e.sold) || 0);
}
function juiceVariance(e, prev) {
  const expected = juiceExpected(e, prev);
  const counted = num(e.counted);
  if (expected === null || counted === null) return null;
  return counted - expected;
}

function renderJuicesView() {
  const view = document.getElementById("juicesView");
  if (!view) return;

  const myBranches = allowedBranchList();
  const branchLocked = myBranches.length <= 1;
  const ro = Auth.isViewOnlyEntry() ? "disabled" : "";

  view.innerHTML = `
    <h2 class="juice-page-title">🧊 جرد الثلاجة اليومي</h2>
    <div class="juice-mode-tabs" role="tablist">
      ${Object.entries(JUICE_MODES).map(([k, m]) => `<button type="button" class="juice-mode-btn ${juiceMode === k ? "active" : ""}" data-jmode="${k}">${m.tab}</button>`).join("")}
    </div>
    <div class="item-card">
      <div class="inputs-row">
        <div class="field">
          <label>الموظف</label>
          <div class="readonly-field">${Auth.getEmployee() ? Auth.getEmployee().name : ""}</div>
        </div>
        <div class="field">
          <label>الفرع</label>
          ${branchLocked
            ? `<div class="readonly-field">${myBranches[0] || "لا يوجد فرع مرتبط بحسابك"}</div>`
            : `<select id="juiceBranchSelect">${branchOptionsHtml(currentJuiceBranch)}</select>`}
        </div>
      </div>
      ${Auth.isViewOnlyEntry() ? '<div class="badges"><span class="badge neutral">👁 عرض فقط — الشيف ما يعدّل هنا</span></div>' : ""}
    </div>
    <div id="juiceSummary"></div>
    <div id="juiceList"></div>
    <div id="juiceCatalog"></div>
  `;

  view.querySelectorAll("[data-jmode]").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.jmode === juiceMode) return;
    clearTimeout(juiceAutoSaveTimer);
    saveJuiceDayNow(false); // نحفظ أرقام الصفحة الحالية قبل ما نبدّل
    setJuiceMode(b.dataset.jmode);
    loadJuiceDay(currentJuiceDate);
  }));

  if (!branchLocked) {
    document.getElementById("juiceBranchSelect").addEventListener("change", (e) => {
      currentJuiceBranch = e.target.value;
      Branch.set(currentJuiceBranch);
      loadJuiceDay(currentJuiceDate);
    });
  }

  const list = document.getElementById("juiceList");
  const visible = visibleJuicesFor(currentJuiceBranch);
  currentVisibleJuices = visible;

  if (!visible.length) {
    list.innerHTML = `<div class="empty-state">${juiceM().none}</div>`;
  }

  visible.forEach(juice => {
    const e = currentJuiceEntry[juice.id] || { opening: "", added: "", sold: "", counted: "", notes: "" };
    const auto = autoSoldFor(juice);
    const card = document.createElement("div");
    card.className = "item-card juice-card";
    card.id = "juicecard-" + juice.id;
    card.innerHTML = `
      <div class="item-name">${juice.name}${juice.unit ? ` <span class="item-unit">(${juice.unit})</span>` : ""}</div>
      <div class="inputs-row">
        <div class="field">
          <label>☀️ عدّ بداية الدوام</label>
          <input type="number" inputmode="numeric" placeholder="—" data-jid="${juice.id}" data-jfield="opening" value="${e.opening}" ${ro}>
        </div>
        <div class="field">
          <label>📦 الواصل اليوم</label>
          <input type="number" inputmode="numeric" placeholder="0" data-jid="${juice.id}" data-jfield="added" value="${e.added}" ${ro}>
          ${ro ? "" : `<button type="button" class="btn juice-add-btn" data-jaddqty="${juice.id}">➕ وصلتنا كمية</button>`}
        </div>
      </div>
      <div class="inputs-row">
        <div class="field">
          <label>🧾 مبيعات اليوم</label>
          <div class="readonly-field juice-sold" id="juicesold-${juice.id}">${num(e.sold) !== null && (Number(e.sold) > 0 || auto !== undefined) ? e.sold : "—"}</div>
          <small class="juice-hint">تنزل تلقائياً من الكاشير</small>
        </div>
        <div class="field">
          <label>🌙 عدّ الإغلاق</label>
          <input type="number" inputmode="numeric" placeholder="—" data-jid="${juice.id}" data-jfield="counted" value="${e.counted}" ${ro}>
        </div>
      </div>
      <div class="badges" id="juicebadges-${juice.id}"></div>
    `;
    list.appendChild(card);
  });

  view.querySelectorAll("input[data-jfield]").forEach(inp => {
    inp.addEventListener("input", onJuiceFieldChange);
  });
  // وصلت كمية للفرع: تنضاف على «الإضافات» (تتجمع لو وصل أكثر من مرة باليوم)
  view.querySelectorAll("[data-jaddqty]").forEach(btn => btn.addEventListener("click", async () => {
    const juice = Juices.current.find(j => j.id === btn.dataset.jaddqty);
    if (!juice) return;
    const raw = await phPrompt(`كم حبة وصلت من «${juice.name}»؟`, "", { ok: "أضف" });
    const q = Number(String(raw || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    if (!(q > 0)) return;
    const inp = view.querySelector(`input[data-jid="${CSS.escape(juice.id)}"][data-jfield="added"]`);
    if (!inp) return;
    inp.value = round1((num(inp.value) || 0) + q);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    showToast(`✅ انضاف ${q} — إضافات اليوم صارت ${inp.value}`);
  }));

  visible.forEach(j => updateJuiceBadges(j));
  updateJuiceSummary();
  renderJuiceCatalog();
}

function updateJuiceBadges(juice) {
  const el = document.getElementById("juicebadges-" + juice.id);
  if (!el) return;
  const e = currentJuiceEntry[juice.id] || {};
  let html = "";

  const prev = juicePrevCounted[juice.id];
  const opening = num(e.opening);
  if (prev !== undefined && prev !== "" && prev !== null) {
    html += opening !== null && opening !== Number(prev)
      ? `<span class="badge warn">⚠ إغلاق أمس ${prev} — الصبح ${opening}</span>`
      : `<span class="badge neutral">إغلاق أمس: ${prev}</span>`;
  }

  const expected = juiceExpected(e, prev);
  if (expected !== null && num(e.counted) === null) html += `<span class="badge neutral">المفروض يكون بالثلاجة: ${round1(expected)}</span>`;

  const v = juiceVariance(e, prev);
  if (v !== null) {
    if (Math.abs(v) <= JUICE_VARIANCE_TOLERANCE) html += `<span class="badge ok">✅ مطابق للمبيعات</span>`;
    else if (v < 0) html += `<span class="badge warn">⚠ ناقص ${round1(Math.abs(v))} عن المفروض (${round1(expected)})</span>`;
    else html += `<span class="badge warn">⚠ زايد ${round1(v)} عن المفروض (${round1(expected)})</span>`;
  }

  el.innerHTML = html;
  const card = document.getElementById("juicecard-" + juice.id);
  if (card) card.classList.toggle("warn-empty", v !== null && Math.abs(v) > JUICE_VARIANCE_TOLERANCE);
}

function round1(n) { return Math.round(n * 10) / 10; }

function updateJuiceSummary() {
  const el = document.getElementById("juiceSummary");
  if (!el) return;
  const counted = currentVisibleJuices.filter(j => num((currentJuiceEntry[j.id] || {}).counted) !== null);
  const mismatched = currentVisibleJuices.filter(j => {
    const v = juiceVariance(currentJuiceEntry[j.id] || {}, juicePrevCounted[j.id]);
    return v !== null && Math.abs(v) > JUICE_VARIANCE_TOLERANCE;
  });
  const total = currentVisibleJuices.length;
  const pct = total > 0 ? Math.round((counted.length / total) * 100) : 0;
  el.innerHTML = `
    <div class="progress-bar-wrap">
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="progress-bar-label">${counted.length} من ${total} ${juiceM().noun} انعدّ عند الإغلاق (${pct}%)${mismatched.length ? ` — ⚠ ${mismatched.length} فيه فرق` : ""}</div>
    </div>
  `;
}

function onJuiceFieldChange(ev) {
  const id = ev.target.dataset.jid;
  const field = ev.target.dataset.jfield;
  if (!currentJuiceEntry[id]) currentJuiceEntry[id] = { opening: "", added: "", sold: "", counted: "", notes: "" };
  currentJuiceEntry[id][field] = ev.target.value;

  const juice = Juices.current.find(j => j.id === id);
  if (juice) updateJuiceBadges(juice);
  updateJuiceSummary();
  scheduleJuiceAutoSave();
}

function saveJuiceDayNow(showToastMsg) {
  if (Auth.isViewOnlyEntry()) return;
  if (juiceLoadFailed) { showToast("⚠ ما انحفظ — الجرد ما تحمّل من السيرفر. حدّث الشاشة أول"); return; }
  const branch = currentJuiceBranch || "";
  const employeeName = (Auth.getEmployee() || {}).name || "";

  const items = Juices.current
    .filter(j => juiceKind(j) === juiceMode)
    .filter(j => {
      const e = currentJuiceEntry[j.id];
      return e && (e.opening !== "" || e.added !== "" || e.sold !== "" || e.counted !== "");
    })
    .map(j => {
      const e = currentJuiceEntry[j.id];
      return {
        juiceId: j.id, juiceName: j.name, unit: j.unit || "",
        opening: e.opening, added: e.added, sold: e.sold, counted: e.counted, notes: e.notes || ""
      };
    });

  const payload = { date: currentJuiceDate, branch, employeeName, items };
  Sync.enqueue("saveJuiceDay:" + currentJuiceDate + ":" + branch, "saveJuiceDay", payload);
  // الكاش فيه الصفحتين (عصيرات + بروتين بار) — منحافظ على أرقام الصفحة الثانية
  const mineIds = new Set(Juices.current.filter(j => juiceKind(j) === juiceMode).map(j => j.id));
  const others = juiceLoadedItems.filter(it => !mineIds.has(it.juiceId));
  Sync.cacheSet("juiceday:" + currentJuiceDate + ":" + branch, { date: currentJuiceDate, branch, items: [...others, ...items], prevCounted: juicePrevCounted, sales: cachedJuiceSalesRows });

  const at = new Date().toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" });
  const statusEl = document.getElementById("juiceStatus");
  if (statusEl) statusEl.textContent = branch ? "✅ محفوظ — جاري المزامنة " + at : `✅ محفوظ (بدون الفرع — كمّله أول ما تقدر) — ${at}`;
  if (showToastMsg) showToast("تم الحفظ");
}

let juiceAutoSaveTimer = null;
function scheduleJuiceAutoSave() {
  const statusEl = document.getElementById("juiceStatus");
  if (statusEl) statusEl.textContent = "جاري الحفظ...";
  clearTimeout(juiceAutoSaveTimer);
  juiceAutoSaveTimer = setTimeout(() => saveJuiceDayNow(false), 900);
}

let cachedJuiceSalesRows = [];
let juiceLoadedItems = [];

function applyJuiceDayData(val) {
  if (!val) return;
  juicePrevCounted = val.prevCounted || {};
  cachedJuiceSalesRows = val.sales || [];
  juiceLoadedItems = val.items || [];
  juiceSalesMap = {};
  cachedJuiceSalesRows.forEach(r => { const k = normalizeArabic(r.productName); juiceSalesMap[k] = (Number(juiceSalesMap[k]) || 0) + (Number(r.qty) || 0); });

  const map = {};
  (val.items || []).forEach(it => {
    map[it.juiceId] = { opening: it.opening, added: it.added, sold: it.sold, counted: it.counted, notes: it.notes };
  });
  currentJuiceEntry = map;

  // تعبئة تلقائية لأي عصير ما انحفظ له شي بعد: الافتتاحي = إقفال أمس، المبيعات = تابسنس.
  // ما بنلمس أي قيمة الموظف كتبها أو انحفظت قبل — التلقائي بس بيملأ الفراغ.
  visibleJuicesFor(currentJuiceBranch).forEach(j => {
    if (!currentJuiceEntry[j.id]) currentJuiceEntry[j.id] = { opening: "", added: "", sold: "", counted: "", notes: "" };
    const e = currentJuiceEntry[j.id];
    // عدّ بداية الدوام ما يتعبّى تلقائياً — الموظف يعدّ بنفسه، وإغلاق أمس يطلع كمرجع
    // مبيعات تابسنس توصل متأخرة أحياناً: لو انحفظ الجرد والمبيعات صفر، منعبّيها لما توصل
    const auto = autoSoldFor(j);
    if (auto !== undefined && (e.sold === "" || e.sold === null || e.sold === undefined || (Number(e.sold) === 0 && Number(auto) > 0))) e.sold = auto;
  });
}

let juiceLoadSeq = 0, juiceLoadFailed = false;
async function loadJuiceDay(dateStr) {
  const seq = ++juiceLoadSeq;
  // أرقام اليوم/الفرع اللي قبل ما تضل معروضة (كانت تنحفظ على اليوم الجديد لو التحميل فشل)
  currentJuiceEntry = {};
  currentJuiceBranch = Branch.get();
  const myBranches = allowedBranchList();
  if (myBranches.length === 1 && currentJuiceBranch !== myBranches[0]) currentJuiceBranch = myBranches[0];
  if (currentJuiceBranch && !Auth.canSeeAllBranches() && !myBranches.includes(currentJuiceBranch)) currentJuiceBranch = myBranches[0] || "";
  Branch.set(currentJuiceBranch);

  await Juices.load();

  if (!currentJuiceBranch) {
    currentJuiceEntry = {};
    juicePrevCounted = {};
    juiceSalesMap = {};
    renderJuicesView();
    const statusEl = document.getElementById("juiceStatus");
    if (statusEl) statusEl.textContent = "اختر الفرع أولاً";
    return;
  }

  const cacheKey = "juiceday:" + dateStr + ":" + currentJuiceBranch;
  const data = await Sync.get("getJuiceDay", { date: dateStr, branch: currentJuiceBranch }, cacheKey);
  if (seq !== juiceLoadSeq) return;
  juiceLoadFailed = data === null || data === undefined;
  applyJuiceDayData(data);
  renderJuicesView();

  const statusEl = document.getElementById("juiceStatus");
  if (statusEl) {
    statusEl.textContent = juiceLoadFailed ? "⚠ تعذّر تحميل الجرد — تأكد من النت واسحب الشاشة لتحت (الحفظ موقّف لحتى ما ينمسح شي)"
      : (data && data.items && data.items.length)
      ? "تم تحميل جرد محفوظ لهذا اليوم لهذا الفرع — عدّل واحفظ لو احتجت"
      : "لم يُحفظ جرد لهذا اليوم لهذا الفرع بعد";
  }
}

// ---- كتالوج العصيرات (إضافة/تعديل/حذف داخل نفس الشاشة) ----
function renderJuiceCatalog() {
  const wrap = document.getElementById("juiceCatalog");
  if (!wrap || !Auth.canManageItems()) return;

  const isOwner = Auth.isOwner();
  const mine = allowedBranchList();

  wrap.innerHTML = `
    <div class="item-card">
      <button type="button" class="btn" id="juiceCatalogToggle">⚙ إدارة أصناف الجرد</button>
      <div id="juiceCatalogBody" class="hidden" style="margin-top:12px;">
        <div class="field"><label>اسم الصنف</label><input type="text" id="newJuiceName"></div>
        <div class="inputs-row">
          <div class="field"><label>الوحدة</label><input type="text" id="newJuiceUnit" placeholder="مثال: زجاجة"></div>
          <div class="field"><label>اسم المنتج بالكاشير (اختياري)</label><input type="text" id="newJuiceTabsense" placeholder="فاضي = نفس الاسم · أكثر من اسم: افصل بـ |"></div>
        </div>
        ${isOwner ? `
        <div class="field">
          <label>يظهر لهذي الفروع بس (بدون تحديد = كل الفروع)</label>
          <div class="badges" id="newJuiceBranchChecks">${branchCheckboxesHtml([])}</div>
        </div>` : `
        <div class="field"><label>الفرع</label>${branchLockedFieldHtml("newJuiceBranchLocked", mine[0] || "")}</div>`}
        <button class="btn gold" id="saveNewJuiceBtn">إضافة صنف</button>
        <div id="juiceCatalogList" style="margin-top:14px;"></div>
      </div>
    </div>
  `;

  document.getElementById("juiceCatalogToggle").addEventListener("click", () => {
    document.getElementById("juiceCatalogBody").classList.toggle("hidden");
  });

  document.getElementById("saveNewJuiceBtn").addEventListener("click", () => {
    const name = document.getElementById("newJuiceName").value.trim();
    const unit = document.getElementById("newJuiceUnit").value.trim();
    const tabsenseName = document.getElementById("newJuiceTabsense").value.trim();
    const branches = isOwner
      ? checkedBranches(document.getElementById("newJuiceBranchChecks"))
      : document.getElementById("newJuiceBranchLocked").value;
    if (!name) { showToast("اكتب اسم الصنف"); return; }
    if (!isOwner && !branches) { showToast("ما فيه فرع مرتبط بحسابك"); return; }
    Juices.save({ name, unit, tabsenseName, branches, kind: juiceMode, sortOrder: Juices.current.length + 1 });
    showToast("تمت إضافة الصنف");
    renderJuicesView();
  });

  const list = document.getElementById("juiceCatalogList");
  // غير المالك بيتحكم بس بالعصيرات الموسومة بفرع واحد من فروعه (نفس قاعدة إدارة الأصناف)
  const ofMode = Juices.current.filter(j => juiceKind(j) === juiceMode);
  const editable = isOwner ? ofMode : ofMode.filter(j => {
    const b = juiceBranches(j);
    return b.length === 1 && mine.includes(b[0]);
  });

  editable.forEach(juice => {
    const row = document.createElement("div");
    row.className = "item-card";
    row.innerHTML = `
      <div class="inputs-row">
        <div class="field"><label>الاسم</label><input type="text" data-jf="name" value="${juice.name}"></div>
        <div class="field"><label>الوحدة</label><input type="text" data-jf="unit" value="${juice.unit || ""}"></div>
      </div>
      <div class="field"><label>اسم المنتج بتابسنس</label><input type="text" data-jf="tabsenseName" value="${juice.tabsenseName || ""}"></div>
      ${isOwner ? `
      <div class="field"><label>الفروع</label><div class="badges" data-jbranches>${branchCheckboxesHtml(juiceBranches(juice))}</div></div>` : `
      <div class="field"><label>الفرع</label>${branchLockedFieldHtml("editJuiceBranch-" + juice.id, juiceBranches(juice)[0] || mine[0] || "")}</div>`}
      <div class="toolbar" style="margin-top:10px;margin-bottom:0;">
        <button class="btn gold" data-jact="save">حفظ</button>
        <button class="btn danger" data-jact="del">حذف</button>
      </div>
    `;
    row.querySelector('[data-jact="save"]').addEventListener("click", () => {
      const name = row.querySelector('[data-jf="name"]').value.trim();
      if (!name) { showToast("اكتب اسم الصنف"); return; }
      Juices.save({
        id: juice.id, name,
        unit: row.querySelector('[data-jf="unit"]').value.trim(),
        tabsenseName: row.querySelector('[data-jf="tabsenseName"]').value.trim(),
        branches: isOwner
          ? checkedBranches(row.querySelector("[data-jbranches]"))
          : document.getElementById("editJuiceBranch-" + juice.id).value,
        kind: juiceKind(juice),
        sortOrder: juice.sortOrder
      });
      showToast("تم الحفظ");
      renderJuicesView();
    });
    row.querySelector('[data-jact="del"]').addEventListener("click", async () => {
      if (!(await phConfirm(`متأكد من حذف "${juice.name}"؟`, { ok: "احذف", danger: true }))) return;
      Juices.remove(juice.id);
      renderJuicesView();
      showToast("تم حذف الصنف");
    });
    list.appendChild(row);
  });

  if (!editable.length) {
    list.innerHTML = '<div class="empty-state">ما فيه أصناف للحين.</div>';
  }
}

// تبديل الصفحة (عصيرات ↔ بروتين بار) من التنقل
function setJuiceMode(mode) {
  const changed = juiceMode !== mode;
  juiceMode = mode === "juice" ? "juice" : "snack";
  return changed;
}

let juicesTabInited = false;
function initJuicesTab() {
  if (juicesTabInited) return;
  juicesTabInited = true;
  const dateInput = document.getElementById("juiceDateInput");
  dateInput.value = currentJuiceDate;
  dateInput.addEventListener("change", (ev) => {
    currentJuiceDate = ev.target.value;
    loadJuiceDay(currentJuiceDate);
  });
  document.getElementById("juiceSaveBtn").addEventListener("click", () => saveJuiceDayNow(true));
  loadJuiceDay(currentJuiceDate);
}
