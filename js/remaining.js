// ==================== وحدة تقرير المتبقي والجرد السريع للجوال (Fast Mobile Closing & Remaining Module) ====================

let currentRemainingDate = todayStr();
let currentRemainingBranch = "";
let currentRemainingData = {}; // itemId -> { remaining, remainingWeight, remainingSauce, notes }
let currentRemainingMeta = { isClosed: false, closedBy: "", closedAt: "" };
let isRemainingSaving = false;
let remainingActiveFilter = "all"; // 'all', 'uncounted', 'protein', 'sauce', 'variance'
let remainingCollapsed = {};
let currentRemainingExtraItems = [];
let currentRemainingWaste = []; // سجلات الهدر لهاليوم والفرع (نفس جدول سجل الهدر)
let currentRemainingAddedSlots = {}; // خانات الشيف اللي انضافت من شاشة المتبقي: id -> اسم الطبخة
let currentRemainingRemovedIds = new Set();
let cachedReceivingDataForRemaining = null;
let cachedSalesDataForRemaining = null;
let remainingBaseline = {}; // itemId -> نسخة من قيم المتبقي كما هي عالسيرفر (للحفظ التلقائي)
let remainingDataKey = null; // اليوم والفرع اللي الأرقام المعروضة تابعة إلهم

const REM_FIELDS = ["remaining", "remainingWeight", "remainingSauce", "notes"];
function remainingSnapshot(d) {
  const out = {};
  REM_FIELDS.forEach(f => { out[f] = d && d[f] != null ? String(d[f]) : ""; });
  out.isSauce = !!(d && d.isSauce);
  return out;
}

const remainingAutosave = createAutosaver({
  collect() {
    if (!remainingDataKey) return null;
    const { date, branch } = remainingDataKey;
    const blank = (v) => v === "" || v === null || v === undefined;
    const items = [];
    getAllRemainingActiveItems(cachedReceivingDataForRemaining).forEach(it => {
      const d = currentRemainingData[it.id];
      if (!d || (blank(d.remaining) && blank(d.remainingWeight) && blank(d.remainingSauce))) return;
      const now = remainingSnapshot(d);
      const base = remainingBaseline[it.id] || remainingSnapshot(null);
      if (JSON.stringify(now) === JSON.stringify(base)) return;
      items.push({ itemId: it.id, itemName: it.name, unit: it.unit || "جرام", category: it.category || "عام", isCustom: !!it.isCustom,
        remaining: d.remainingWeight || d.remaining || "", remainingWeight: d.remainingWeight || "", remainingSauce: d.remainingSauce || "",
        isSauce: !!d.isSauce, notes: d.notes || "", _snapshot: now });
    });
    return {
      items,
      payload: { date, branch, items: items.map(({ _snapshot, ...rest }) => rest) },
      commit() { items.forEach(i => { remainingBaseline[i.itemId] = i._snapshot; }); }
    };
  },
  send: (job) => Sync.postOnce("saveRemainingReport", job.payload),
  onStatus(state, e) {
    const el = document.getElementById("remainingSaveStatus");
    if (!el) return;
    el.textContent = autosaveStatusText(state, e);
    el.classList.toggle("dirty", state === "error");
  }
});

function getAllRemainingActiveItems(receivingData) {
  const branch = currentRemainingBranch;
  const itemsMap = new Map();

  // 1. الأصناف الأساسية من Items.current التابعة لهذا الفرع
  (Items.current || []).forEach(it => {
    const branches = itemBranches(it);
    if (branches.length && branch && !branches.includes(branch)) return;
    itemsMap.set(it.id, { ...it });
  });

  // 2. دمج الأصناف المستلمة اليوم من شاشة الاستلام (بما فيها أي صنف إضافي أضافه الشيف أو الفرع)
  const recData = receivingData || cachedReceivingDataForRemaining;
  if (recData && Array.isArray(recData.items)) {
    recData.items.forEach(recIt => {
      const id = recIt.itemId || recIt.id;
      if (!id) return;
      if (!itemsMap.has(id)) {
        itemsMap.set(id, {
          id: id,
          name: recIt.itemName || recIt.name || id,
          unit: recIt.unit || "جرام",
          category: recIt.category || "عام",
          isCustom: true,
          branches: branch
        });
      } else {
        const item = itemsMap.get(id);
        if (recIt.itemName && recIt.itemName !== item.name) item.name = recIt.itemName;
        if (recIt.unit && recIt.unit !== item.unit) item.unit = recIt.unit;
        if (recIt.category && recIt.category !== item.category) item.category = recIt.category;
        if (recIt.isCustom) item.isCustom = true;
      }
    });
  }

  // 3. الأصناف المضافة يدوياً في شاشة جرد المتبقي
  currentRemainingExtraItems.forEach(it => {
    if (!itemsMap.has(it.id)) itemsMap.set(it.id, { ...it });
  });

  // 4. استبعاد الأصناف المحذوفة في الاستلام أو في المتبقي
  const recRemoved = new Set((recData && Array.isArray(recData.removedItemIds)) ? recData.removedItemIds : ((recData && recData.meta && Array.isArray(recData.meta.removedItemIds)) ? recData.meta.removedItemIds : []));
  const extraIds = new Set(currentRemainingExtraItems.map(it => it.id));

  // الاختياري (خانات الشيف والطبخات المتغيرة) بيطلع بس إذا انستلم اليوم أو انسجل متبقيه
  const recById = {};
  if (recData && Array.isArray(recData.items)) recData.items.forEach(r => { recById[r.itemId || r.id] = r; });
  const result = [];
  itemsMap.forEach((item, id) => {
    if (currentRemainingRemovedIds.has(id)) return;
    if (recRemoved.has(id) && !extraIds.has(id)) return;
    const def = Items.byId(id);
    if (def && isOptionalItem(def) && !extraIds.has(id)) {
      const r = recById[id];
      const received = r && Number(r.received) > 0;
      const d = currentRemainingData[id];
      const counted = d && [d.remaining, d.remainingWeight, d.remainingSauce].some(v => v !== "" && v !== null && v !== undefined);
      const added = Object.prototype.hasOwnProperty.call(currentRemainingAddedSlots, id);
      if (!received && !counted && !added) return;
      if (added && currentRemainingAddedSlots[id] && item.name === def.name) item.name = chefSlotName(def, currentRemainingAddedSlots[id]);
      if (isChefItem(def) && r && r.cookName && item.name === def.name) item.name = chefSlotName(def, r.cookName);
    }
    const cat = String(item.category || "").trim();
    if (cat.includes("كارب") || cat.toLowerCase().includes("carb")) return;
    result.push(item);
  });

  return result;
}

function formatRemainingItemChip(actualChickenWeight, actualSauceWeight, isProtein, isSauceCat, cat, isSauceToggled) {
  const c = Number(actualChickenWeight || 0);
  const s = Number(actualSauceWeight || 0);

  if (isSauceToggled || s > 0) {
    return `🥣 ${Math.round(s || c)} جم صوص`;
  }
  if (isSandwichCategory(cat)) {
    return c > 0 ? `🥪 ${Math.round(c)} ساندويتش` : '';
  }
  if (isSaladCategory(cat)) {
    return c > 0 ? `🥗 ${Math.round(c)} حبة` : '';
  }
  if (isProtein || isWeightMealCategory(cat)) {
    const meals = c > 0 ? mealsCount(c) : 0;
    return `🍽 ${meals} وجبة`;
  }
  return c > 0 ? `⚖️ ${Math.round(c)} جم` : '';
}

function formatCategoryRemainingPill(hasRecorded, remMeals, chickenWeightGrams, sauceWeightGrams, cat) {
  if (!hasRecorded) return `🍗 متبقي: <b>—</b>`;

  if (isSandwichCategory(cat)) {
    return `🥪 متبقي: <b>${Math.round(chickenWeightGrams)} ساندويتش</b>`;
  }
  if (isSaladCategory(cat)) {
    return `🥗 متبقي: <b>${Math.round(chickenWeightGrams)} حبة</b>`;
  }
  if (isWeightMealCategory(cat)) {
    const meals = (remMeals !== null && remMeals !== undefined) ? remMeals : (chickenWeightGrams > 0 ? (chickenWeightGrams / MEAL_WEIGHT_G).toFixed(1).replace(/\.0$/, "") : "0");
    let html = `🍗 متبقي: <b>${meals} وجبة</b>`;
    if (sauceWeightGrams > 0) {
      html += ` + 🥣 <b>${Math.round(sauceWeightGrams)} جم صوص</b>`;
    }
    return html;
  } else {
    if (sauceWeightGrams > 0) {
      let html = `🥣 متبقي: <b>${Math.round(sauceWeightGrams)} جم صوص</b>`;
      if (chickenWeightGrams > 0) {
        html += ` (${Math.round(chickenWeightGrams)} جم)`;
      }
      return html;
    }
    return `🍗 متبقي: <b>${Math.round(chickenWeightGrams)} جم</b>`;
  }
}

function updateItemRemainingDisplay(itemId) {
  const remData = currentRemainingData[itemId] || {};
  const isSauce = !!remData.isSauce;
  const rawVal = remData.remaining || remData.remainingWeight || remData.remainingSauce || "";
  const numVal = Number(rawVal || 0);
  const actualChicken = !isSauce ? numVal : 0;
  const actualSauce = isSauce ? numVal : 0;

  const card = document.querySelector(`.remaining-card-mobile[data-item-id="${itemId}"]`);
  const cat = card ? (card.dataset.cat || "") : "";

  const mealEl = document.getElementById("remmeals-" + itemId);
  if (mealEl) {
    const text = formatRemainingItemChip(actualChicken, actualSauce, isWeightMealCategory(cat), false, cat, isSauce);
    mealEl.textContent = text;
    mealEl.style.display = numVal > 0 ? "" : "none";
  }
}

function mergeFreshRemainingData(freshRem) {
  if (!freshRem) return;
  if (freshRem.meta) currentRemainingMeta = freshRem.meta;
  if (Array.isArray(freshRem.removedItemIds)) {
    freshRem.removedItemIds.forEach(id => currentRemainingRemovedIds.add(id));
  } else if (freshRem.meta && Array.isArray(freshRem.meta.removedItemIds)) {
    freshRem.meta.removedItemIds.forEach(id => currentRemainingRemovedIds.add(id));
  }
  (freshRem.items || []).forEach(it => {
    const existing = currentRemainingData[it.itemId];
    const userHasLocal = existing && (
      (existing.remainingWeight !== "" && existing.remainingWeight !== null && existing.remainingWeight !== undefined) ||
      (existing.remainingSauce !== "" && existing.remainingSauce !== null && existing.remainingSauce !== undefined) ||
      (existing.remaining !== "" && existing.remaining !== null && existing.remaining !== undefined)
    );

    if (!existing || !userHasLocal) {
      const isSauce = !!it.isSauce || (Number(it.remainingSauce || 0) > 0 && (!it.remainingWeight || Number(it.remainingWeight) === 0));
      const val = isSauce
        ? String(it.remainingSauce || it.remaining || "")
        : String(it.remainingWeight !== undefined && it.remainingWeight !== null && it.remainingWeight !== "" ? it.remainingWeight : (it.remaining ?? ""));

      currentRemainingData[it.itemId] = {
        remaining: val,
        remainingWeight: isSauce ? "" : val,
        remainingSauce: isSauce ? val : "",
        isSauce: isSauce,
        notes: it.remainingNotes || ""
      };
    }

    if (!Items.byId(it.itemId) && !currentRemainingExtraItems.some(x => x.id === it.itemId)) {
      currentRemainingExtraItems.push({
        id: it.itemId,
        name: it.itemName || it.name || it.itemId,
        unit: it.unit || "جرام",
        category: it.category || "عام",
        isCustom: true
      });
    }
  });
}

function initRemainingModule() {
  currentRemainingBranch = Branch.get() || allowedBranchList()[0] || "";
  currentRemainingDate = todayStr();
}

async function loadRemainingData(date, branch) {
  await remainingAutosave.flush(); // أرقام اليوم اللي كان مفتوح بتنحفظ عيومها قبل ما نفتح يوم تاني
  remainingDataKey = null;
  currentRemainingDate = date || currentRemainingDate;
  currentRemainingBranch = branch || Branch.get() || allowedBranchList()[0] || "";

  const view = document.getElementById("remainingView");
  if (view) view.innerHTML = '<div class="loader"><div class="spinner"></div> جاري تجميع تقرير المتبقي والجرد والانحراف…</div>';

  try {
    await Items.load();

    // 1) فحص وجود أحدث بيانات استلام مسجلة محلياً في الذاكرة لنفس اليوم والفرع
    const activeRec = (typeof getActiveReceivingData === "function")
      ? getActiveReceivingData(currentRemainingDate, currentRemainingBranch)
      : null;

    const [receivingData, salesData, remainingData, wasteData] = await Promise.all([
      (activeRec ? Promise.resolve(activeRec) : Sync.get("getDay", { date: currentRemainingDate, branch: currentRemainingBranch }, "day:" + currentRemainingDate + ":" + currentRemainingBranch, (freshRec) => {
        if (freshRec && freshRec.items) {
          cachedReceivingDataForRemaining = freshRec;
          renderRemainingView(freshRec, cachedSalesDataForRemaining);
        }
      }).catch(() => null)),
      Sync.get("getSalesByCategory", { start: currentRemainingDate, end: currentRemainingDate, branch: currentRemainingBranch }, "tabsense:" + currentRemainingDate + ":" + currentRemainingBranch).catch(() => null),
      Sync.get("getRemainingReport", { date: currentRemainingDate, branch: currentRemainingBranch }, "remaining:" + currentRemainingDate + ":" + currentRemainingBranch, (freshRem) => {
        if (freshRem) {
          mergeFreshRemainingData(freshRem);
          renderRemainingView(cachedReceivingDataForRemaining, cachedSalesDataForRemaining);
        }
      }).catch(() => null),
      SupaEngine.getWasteReport(currentRemainingDate, currentRemainingBranch).catch(() => null)
    ]);
    currentRemainingWaste = (wasteData && wasteData.items) || [];

    cachedReceivingDataForRemaining = activeRec || receivingData || cachedReceivingDataForRemaining;
    cachedSalesDataForRemaining = salesData || cachedSalesDataForRemaining;

    currentRemainingData = {};
    currentRemainingMeta = { isClosed: false, closedBy: "", closedAt: "" };
    currentRemainingExtraItems = [];
    currentRemainingAddedSlots = {};
    currentRemainingRemovedIds = new Set();

    if (remainingData) {
      mergeFreshRemainingData(remainingData);
    }
    remainingBaseline = {};
    Object.keys(currentRemainingData).forEach(id => { remainingBaseline[id] = remainingSnapshot(currentRemainingData[id]); });
    remainingDataKey = { date: currentRemainingDate, branch: currentRemainingBranch };

    renderRemainingView(cachedReceivingDataForRemaining, cachedSalesDataForRemaining);
  } catch (err) {
    console.error("loadRemainingData error:", err);
    renderRemainingView(null, null);
  }
}

function calculateCategorySales(salesRows, categoryName) {
  if (!salesRows || !Array.isArray(salesRows)) return 0;
  let totalQty = 0;
  salesRows.forEach(r => {
    if (r.category === categoryName) {
      totalQty += Number(r.qty || 0);
    }
  });
  return totalQty;
}

function calculateItemVariance(receivedGrams, soldMeals, actualRemainingGrams) {
  const rec = Number(receivedGrams || 0);
  const sold = Number(soldMeals || 0);
  const consumedGrams = sold * MEAL_WEIGHT_G; // 150 جرام لكل وجبة مباعة
  const expectedRemainingGrams = Math.max(0, rec - consumedGrams);
  const actualRemaining = Number(actualRemainingGrams || 0);
  const varianceGrams = actualRemaining - expectedRemainingGrams;
  const variancePct = rec > 0 ? (varianceGrams / rec) * 100 : 0;

  return {
    consumedGrams,
    consumedMeals: sold,
    expectedRemainingGrams,
    actualRemaining,
    varianceGrams,
    variancePct
  };
}

function getVarianceBadge(variancePct) {
  const absPct = Math.abs(variancePct);
  if (absPct <= 5) return { label: "🟢 طبيعي", class: "ok", level: "normal" };
  if (absPct <= 15) return { label: "🟡 تنبيه", class: "warn", level: "attention" };
  return { label: "🔴 انحراف / عجز", class: "danger", level: "critical" };
}

function isWeightMealCategory(cat) {
  const c = String(cat || "").trim();
  return c.includes("دجاج") || c.includes("لحم") || c.includes("بحري") || c.includes("سمك") || c.includes("أسماك");
}
function isSandwichCategory(cat) {
  const c = String(cat || "").trim();
  return c.includes("فطور") || c.includes("ساندويتش") || c.includes("ساندوتش");
}
function isSaladCategory(cat) {
  const c = String(cat || "").trim();
  return c.includes("سلط");
}
function isMealMatchingCategory(cat) {
  return isWeightMealCategory(cat) || isSandwichCategory(cat) || isSaladCategory(cat);
}

function getMatchedCategorySales(salesMap, cat) {
  if (!salesMap || !cat) return 0;
  const normCat = String(cat).trim();

  if (salesMap[normCat] !== undefined && Number(salesMap[normCat]) > 0) {
    return Number(salesMap[normCat]);
  }

  let total = 0;
  Object.keys(salesMap).forEach(key => {
    const k = String(key).trim();
    if (isWeightMealCategory(normCat)) {
      if ((normCat.includes("دجاج") && k.includes("دجاج")) ||
          (normCat.includes("لحم") && k.includes("لحم")) ||
          ((normCat.includes("بحري") || normCat.includes("سمك")) && (k.includes("بحري") || k.includes("سمك")))) {
        total += Number(salesMap[key] || 0);
      }
    } else if (isSandwichCategory(normCat)) {
      if (k.includes("فطور") || k.includes("ساندويتش") || k.includes("ساندوتش")) {
        total += Number(salesMap[key] || 0);
      }
    } else if (isSaladCategory(normCat)) {
      if (k.includes("سلط")) {
        total += Number(salesMap[key] || 0);
      }
    }
  });
  return total;
}

function setRemainingFilter(filterName) {
  remainingActiveFilter = filterName;
  document.querySelectorAll(".rem-filter-chip").forEach(el => {
    el.classList.toggle("active", el.dataset.filter === filterName);
  });
  filterRemainingCardsUI();
}

function filterRemainingCardsUI() {
  document.querySelectorAll(".remaining-card-mobile").forEach(card => {
    const isCounted = card.dataset.counted === "true";
    const isProtein = card.dataset.isprotein === "true";
    const hasSauce = card.dataset.hassauce === "true";
    const hasVariance = card.dataset.hasvariance === "true";

    let visible = true;
    if (remainingActiveFilter === "uncounted") {
      visible = !isCounted;
    } else if (remainingActiveFilter === "protein") {
      visible = isProtein;
    } else if (remainingActiveFilter === "sauce") {
      visible = hasSauce;
    } else if (remainingActiveFilter === "variance") {
      visible = hasVariance;
    }
    card.style.display = visible ? "" : "none";
  });

  document.querySelectorAll(".category-section-rem").forEach(sec => {
    const visibleCards = sec.querySelectorAll('.remaining-card-mobile:not([style*="display: none"])');
    sec.style.display = visibleCards.length > 0 ? "" : "none";
  });
  updateEntryProgress(document.getElementById("remainingView"));
}

function renderRemainingView(receivingData, salesData) {
  const view = document.getElementById("remainingView");
  if (!view) return;

  cachedReceivingDataForRemaining = receivingData || cachedReceivingDataForRemaining;
  cachedSalesDataForRemaining = salesData || cachedSalesDataForRemaining;

  const items = getAllRemainingActiveItems(cachedReceivingDataForRemaining);
  const isClosed = !!currentRemainingMeta.isClosed;

  const receivingMap = {};
  if (receivingData && receivingData.items) {
    receivingData.items.forEach(it => { receivingMap[it.itemId] = it; });
  }

  const salesMap = {};
  if (salesData && Array.isArray(salesData)) {
    salesData.forEach(r => {
      salesMap[r.category] = (salesMap[r.category] || 0) + Number(r.qty || 0);
    });
  }

  let totalItemsCount = 0;
  let countedItemsCount = 0;
  let grandTotalReceivedWeight = 0;
  let grandTotalSoldMeals = 0;
  let grandTotalActualRemainingWeight = 0;
  let grandTotalActualSauce = 0;
  let grandTotalWasteGrams = 0;
  let highVarianceCount = 0;

  const byCat = {};
  items.forEach(it => {
    const branches = itemBranches(it);
    if (branches.length && !branches.includes(currentRemainingBranch)) return;
    const cat = it.category || "عام";
    if (cat.includes("كارب") || cat.toLowerCase().includes("carb")) return;
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(it);
  });

  const categories = Object.keys(byCat).sort((a, b) => categoryRank(a) - categoryRank(b));
  categories.forEach(cat => byCat[cat].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)));

  categories.forEach(cat => {
    const isMealCat = isMealMatchingCategory(cat);
    const categorySoldMeals = isMealCat ? getMatchedCategorySales(salesMap, cat) : 0;
    if (isMealCat) grandTotalSoldMeals += categorySoldMeals;

    byCat[cat].forEach(it => {
      totalItemsCount++;
      const recEntry = receivingMap[it.id] || {};
      const recQty = Number(recEntry.received || 0);
      grandTotalReceivedWeight += recQty;

      const remData = currentRemainingData[it.id] || { remainingWeight: "", remainingSauce: "" };
      const actualWeight = Number(remData.remainingWeight || remData.remaining || 0);
      const actualSauce = Number(remData.remainingSauce || 0);
      grandTotalActualRemainingWeight += actualWeight;
      grandTotalActualSauce += actualSauce;

      const isCounted = (remData.remainingWeight !== "" && remData.remainingWeight !== null && remData.remainingWeight !== undefined) ||
                        (remData.remainingSauce !== "" && remData.remainingSauce !== null && remData.remainingSauce !== undefined);
      if (isCounted) countedItemsCount++;
    });
  });

  let html = `
    <div class="remaining-mobile-header">
      <div class="rem-top-row">
        <div>
          <h2 class="rem-main-title">🌙 جرد الإغلاق والمتبقي</h2>
          <span class="rem-date-subtitle">📅 تاريخ: ${currentRemainingDate} | فرز دقيق بين الدجاج/اللحم والصوصات</span>
        </div>
        <div class="branch-closing-wrap" style="display:flex;gap:8px;align-items:center;">
          ${Auth.isBranchStaff() || allowedBranchList().length <= 1 ? `
            <span class="badge neutral" style="font-size:13px;padding:6px 12px;font-weight:900;">🏪 ${currentRemainingBranch}</span>
          ` : `
            <select id="remainingBranchSelect" onchange="onRemainingBranchChange(this.value)">
              ${branchOptionsHtml(currentRemainingBranch)}
            </select>
          `}
          ${isClosed ? `
            <span class="badge danger" style="font-size:13px;padding:8px 14px;">🔒 اليوم مغلق ومقتنع</span>
          ` : `
            <button class="btn gold rem-close-btn" onclick="closeOperationalDay()" style="min-height:38px;padding:6px 14px;">🔒 إغلاق اليوم</button>
          `}
        </div>
      </div>

      <div class="rem-stats-row">
        <div class="rem-stat-pill">
          <span class="rem-stat-num">${countedItemsCount}/${totalItemsCount}</span>
          <span class="rem-stat-lbl">أصناف تم جردها</span>
        </div>
        <div class="rem-stat-pill ok">
          <span class="rem-stat-num">${Math.round(grandTotalReceivedWeight)}g</span>
          <span class="rem-stat-lbl">المستلم صباحاً</span>
        </div>
        ${Auth.canSeeSales() ? `
        <div class="rem-stat-pill">
          <span class="rem-stat-num">${Math.round(grandTotalSoldMeals)}</span>
          <span class="rem-stat-lbl">وجبات مباعة (تابسنس)</span>
        </div>
        <div class="rem-stat-pill ${grandTotalWasteGrams > 0 ? 'warn' : 'ok'}">
          <span class="rem-stat-num">${Math.round(grandTotalWasteGrams)}g</span>
          <span class="rem-stat-lbl">إجمالي الفاقد/الهدر</span>
        </div>
        ` : `
        <div class="rem-stat-pill">
          <span class="rem-stat-num">${Math.round(grandTotalActualRemainingWeight)}g${grandTotalActualSauce > 0 ? ` | 🥣 ${grandTotalActualSauce}` : ''}</span>
          <span class="rem-stat-lbl">إجمالي المتبقي الفعلي</span>
        </div>
        `}
      </div>

      <div class="rem-quick-actions-bar">
        ${renderCompactToggleBtnHtml()}
      </div>

      <div class="rem-filters-scroll">
        <button type="button" class="rem-filter-chip ${remainingActiveFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="setRemainingFilter('all')">
          الكل (${totalItemsCount})
        </button>
        <button type="button" class="rem-filter-chip ${remainingActiveFilter === 'uncounted' ? 'active' : ''}" data-filter="uncounted" onclick="setRemainingFilter('uncounted')">
          ⏳ باقي لم يُجرد (${totalItemsCount - countedItemsCount})
        </button>
        <button type="button" class="rem-filter-chip ${remainingActiveFilter === 'protein' ? 'active' : ''}" data-filter="protein" onclick="setRemainingFilter('protein')">
          🍗 الدجاج والبروتين
        </button>
        <button type="button" class="rem-filter-chip ${remainingActiveFilter === 'sauce' ? 'active' : ''}" data-filter="sauce" onclick="setRemainingFilter('sauce')">
          🥣 الصوصات
        </button>
        ${Auth.canSeeSales() ? `
        <button type="button" class="rem-filter-chip ${remainingActiveFilter === 'variance' ? 'active' : ''}" data-filter="variance" onclick="setRemainingFilter('variance')">
          ⚠️ تدقيق الانحراف
        </button>
        ` : ''}
      </div>
    </div>
    ${entryProgressHtml()}
  `;

  if (!categories.length) {
    html += `<div class="empty-state">لا توجد أصناف مسجلة لهذا الفرع.</div>`;
    view.innerHTML = html;
    return;
  }

  categories.forEach(cat => {
    const catItems = byCat[cat];
    const isWeightMeal = isWeightMealCategory(cat);
    const isSandwich = isSandwichCategory(cat);
    const isSalad = isSaladCategory(cat);
    const isMealCat = isMealMatchingCategory(cat);
    const categorySoldMeals = isMealCat ? getMatchedCategorySales(salesMap, cat) : 0;
    const categoryConsumedGrams = isWeightMeal ? (categorySoldMeals * MEAL_WEIGHT_G) : 0;

    let catReceivedSum = 0;
    let catActualChickenSum = 0;
    let catActualSauceSum = 0;
    const catWaste = catItems.reduce((sum, it) => sum + remainingWasteFor(it.id), 0);

    const cardsHtml = catItems.map(it => {
      const recEntry = receivingMap[it.id] || {};
      const recQty = Number(recEntry.received || 0);
      catReceivedSum += recQty;

      const remData = currentRemainingData[it.id] || { remaining: "", remainingWeight: "", remainingSauce: "", isSauce: false, notes: "" };
      const rawVal = remData.remaining || remData.remainingWeight || remData.remainingSauce || "";
      const isSauceWeight = !!remData.isSauce;
      const numVal = Number(rawVal || 0);

      const actualChicken = !isSauceWeight ? numVal : 0;
      const actualSauce = isSauceWeight ? numVal : 0;

      catActualChickenSum += actualChicken;
      catActualSauceSum += actualSauce;

      const isCounted = rawVal !== "" && rawVal !== null && rawVal !== undefined;

      const isProtein = isWeightMeal || (!isSandwich && !isSalad && it.unit && (it.unit.includes("جرام") || it.unit.includes("جم") || it.unit.includes("كجم")));
      const isSauce = !isSandwich && !isSalad && ((it.name && it.name.includes("صوص")) || (cat && cat.includes("صوص")) || (it.unit && it.unit.includes("علبة")));

      let itemVarianceText = "";
      let hasVariance = false;
      if (recQty > 0 && Auth.canSeeSales()) {
        if (isWeightMeal) {
          const itemExpected = Math.max(0, recQty - categoryConsumedGrams - remainingWasteFor(it.id));
          const diff = actualChicken - itemExpected;
          if (Math.abs(diff) > 50) {
            hasVariance = true;
            itemVarianceText = diff < 0 ? `🔻 عجز تقريبي: ${Math.round(diff)} جم` : `🔺 زيادة: +${Math.round(diff)} جم`;
          }
        } else if (isSandwich || isSalad) {
          const itemExpected = Math.max(0, recQty - categorySoldMeals - remainingWasteFor(it.id));
          const diff = numVal - itemExpected;
          if (diff !== 0 && numVal > 0) {
            hasVariance = true;
            const u = isSandwich ? "ساندويتش" : "حبة";
            itemVarianceText = diff < 0 ? `🔻 عجز: ${Math.abs(diff)} ${u}` : `🔺 زيادة: +${diff} ${u}`;
          }
        }
      }

      const notesExpanded = remainingNotesExpanded[it.id] || !!remData.notes;
      const remFieldIconLabel = isSandwich ? "🥪 المتبقي:" : (isSalad ? "🥗 المتبقي:" : "🍗 المتبقي:");
      const itemUnitLabel = isSandwich ? "ساندويتش" : (isSalad ? "حبة" : (it.unit || "جم"));

      return `
        <div class="remaining-card-mobile" 
             data-item-id="${it.id}" 
             data-cat="${cat}"
             data-counted="${isCounted}"
             data-isprotein="${isWeightMeal}"
             data-hassauce="${isSauceWeight}"
             data-hasvariance="${hasVariance}"
             data-issauceweight="${isSauceWeight}">
          
          <!-- سطر الصنف الموحد والمختصر (اسم، استلام، وجبات، إدخال متبقي، صوص، وإجراءات) -->
          <div class="rem-single-row">
            <!-- معلومات الصنف -->
            <div class="rem-info-group">
              <span class="rem-item-name">${it.name}</span>
              <span class="rem-item-unit">(${itemUnitLabel})</span>
              ${it.isCustom ? '<span class="badge ok rec-custom-badge">إضافي</span>' : ''}
              <span class="rec-meta-chip rec-req-chip" title="المستلم صباحاً">📦 ${recQty > 0 ? Math.round(recQty) : '—'}</span>
              ${numVal > 0 ? `
                <span id="remmeals-${it.id}" class="rec-meta-chip rec-meal-chip">
                  ${formatRemainingItemChip(actualChicken, actualSauce, isWeightMeal, false, cat, isSauceWeight)}
                </span>
              ` : ''}
              ${itemVarianceText && Auth.canSeeSales() ? `
                <span class="rec-meta-chip diff-red" title="انحراف">⚠️ ${itemVarianceText}</span>
              ` : ''}
            </div>

            <!-- خانات الإدخال المدمجة بصف واحد -->
            <div class="rem-inputs-group">
              <!-- خانة وزن أو عدد المتبقي -->
              <div class="rem-inline-input-group protein">
                <span class="rem-field-label">${remFieldIconLabel}</span>
                <div class="rem-mini-input-wrap">
                  <input type="number" step="any" min="0" inputmode="decimal"
                         id="remweight-${it.id}"
                         enterkeyhint="next"
                         value="${rawVal}"
                         placeholder="—"
                         ${isClosed ? 'disabled' : ''}
                         oninput="onRemainingWeightChange('${it.id}', this.value)"
                         class="entry-input rem-mini-input ${numVal > 0 ? 'border-green' : ''}">
                  <span class="rem-mini-unit">${itemUnitLabel}</span>
                </div>
                <button type="button" class="rem-mini-zero-btn" ${isClosed ? 'disabled' : ''} onclick="onQuickRemWeightZero('${it.id}')" title="نفد (0)">0</button>
              </div>

              <!-- زر تبديل الصوص: لو كان متبقي الوزن صوص مو دجاج/لحم -->
              ${isWeightMeal ? `
                <button type="button" 
                        id="remsauce-btn-${it.id}"
                        class="rem-btn-sauce-toggle ${isSauceWeight ? 'active' : ''}" 
                        ${isClosed ? 'disabled' : ''} 
                        onclick="toggleRemainingIsSauce('${it.id}')" 
                        title="${isSauceWeight ? 'الوزن المسجل محسوب كصوص (اضغط لإعادته كدجاج/لحم)' : 'اضغط هنا لو كان متبقي الوزن صوص مو دجاج/لحم'}">
                  ${isSauceWeight ? '✅ 🥣 صوص' : '🥣 صوص'}
                </button>
              ` : ''}

              <!-- الإجراءات (ملاحظة وحذف) -->
              <div class="rem-inline-actions">
                <button type="button" class="rem-waste-btn ${remainingWasteFor(it.id) ? 'has-waste' : ''}" ${isClosed ? 'disabled' : ''} onclick="openRemainingWaste('${it.id}')" title="تسجيل هدر">🗑${remainingWasteFor(it.id) ? ` ${Math.round(remainingWasteFor(it.id))}` : ''}</button>
                <button type="button" class="rem-mini-note-btn ${remData.notes ? 'has-notes' : ''}" onclick="toggleRemainingNote('${it.id}')" title="ملاحظة">📝</button>
                <button type="button" class="rec-btn-remove" onclick="onRemoveRemainingItem('${it.id}', '${String(it.name).replace(/'/g, "\\'")}')" title="استبعاد الصنف">✕</button>
              </div>
            </div>
          </div>

          <!-- درج الملاحظات القابل للطي -->
          <div class="rem-note-drawer ${notesExpanded ? 'expanded' : 'hidden'}" id="remnote-drawer-${it.id}">
            <input type="text" value="${remData.notes || ''}" 
                   placeholder="ملاحظات جرد هذا الصنف (تالف، هدر في التحضير، عينات...)"
                   id="remnote-${it.id}"
                   ${isClosed ? 'disabled' : ''}
                   oninput="onRemainingNotesChange('${it.id}', this.value)"
                   class="rec-note-input">
          </div>
        </div>
      `;
    }).join("");

    const filledCount = catItems.filter(it => {
      const rem = currentRemainingData[it.id] || {};
      const raw = rem.remaining || rem.remainingWeight || rem.remainingSauce;
      return raw !== "" && raw !== null && raw !== undefined;
    }).length;

    const catSafeId = cssId(cat);
    const hasRemainingRecorded = filledCount > 0;
    let recDisplay = "";
    let soldDisplay = "";
    let varBadgeHtml = "";

    if (isWeightMeal) {
      const expectedRemainingGrams = Math.max(0, catReceivedSum - categoryConsumedGrams - catWaste);
      const catVarianceGrams = catActualChickenSum - expectedRemainingGrams;
      const catVariancePct = catReceivedSum > 0 ? (catVarianceGrams / catReceivedSum) * 100 : 0;
      const catBadge = getVarianceBadge(catVariancePct);

      if (catVarianceGrams < 0) grandTotalWasteGrams += Math.abs(catVarianceGrams);
      if (catBadge.level === "critical") highVarianceCount++;

      const recMeals = (catReceivedSum / MEAL_WEIGHT_G).toFixed(1).replace(/\.0$/, "");
      const soldMeals = categorySoldMeals;
      const remMeals = (catActualChickenSum / MEAL_WEIGHT_G).toFixed(1).replace(/\.0$/, "");
      const varMeals = (catVarianceGrams / MEAL_WEIGHT_G).toFixed(1).replace(/\.0$/, "");

      recDisplay = `${recMeals} وجبة`;
      soldDisplay = `${soldMeals || 0} وجبة`;
      if (hasRemainingRecorded && Auth.canSeeSales()) {
        if (Math.abs(catVarianceGrams) <= 50) {
          varBadgeHtml = `<span class="cat-pill pill-ok">✅ مطابق</span>`;
        } else if (catVarianceGrams < 0) {
          varBadgeHtml = `<span class="cat-pill pill-danger">🔻 عجز: ${Math.abs(varMeals)} وجبة</span>`;
        } else {
          varBadgeHtml = `<span class="cat-pill pill-warn">🔺 زيادة: +${varMeals} وجبة</span>`;
        }
      } else {
        varBadgeHtml = `<span class="cat-pill pill-pending">⏳ بانتظار الجرد</span>`;
      }
    } else if (isSandwich) {
      const recCount = Math.round(catReceivedSum);
      const soldCount = categorySoldMeals;
      const expectedRem = Math.max(0, recCount - soldCount - Math.round(catWaste));
      const catVariance = Math.round(catActualChickenSum) - expectedRem;

      recDisplay = `${recCount} ساندويتش`;
      soldDisplay = `${soldCount || 0} ساندويتش`;
      if (hasRemainingRecorded && Auth.canSeeSales()) {
        if (catVariance === 0) {
          varBadgeHtml = `<span class="cat-pill pill-ok">✅ مطابق</span>`;
        } else if (catVariance < 0) {
          varBadgeHtml = `<span class="cat-pill pill-danger">🔻 عجز: ${Math.abs(catVariance)} ساندويتش</span>`;
        } else {
          varBadgeHtml = `<span class="cat-pill pill-warn">🔺 زيادة: +${catVariance} ساندويتش</span>`;
        }
      } else {
        varBadgeHtml = `<span class="cat-pill pill-pending">⏳ بانتظار الجرد</span>`;
      }
    } else if (isSalad) {
      const recCount = Math.round(catReceivedSum);
      const soldCount = categorySoldMeals;
      const expectedRem = Math.max(0, recCount - soldCount - Math.round(catWaste));
      const catVariance = Math.round(catActualChickenSum) - expectedRem;

      recDisplay = `${recCount} حبة`;
      soldDisplay = `${soldCount || 0} حبة`;
      if (hasRemainingRecorded && Auth.canSeeSales()) {
        if (catVariance === 0) {
          varBadgeHtml = `<span class="cat-pill pill-ok">✅ مطابق</span>`;
        } else if (catVariance < 0) {
          varBadgeHtml = `<span class="cat-pill pill-danger">🔻 عجز: ${Math.abs(catVariance)} حبة</span>`;
        } else {
          varBadgeHtml = `<span class="cat-pill pill-warn">🔺 زيادة: +${catVariance} حبة</span>`;
        }
      } else {
        varBadgeHtml = `<span class="cat-pill pill-pending">⏳ بانتظار الجرد</span>`;
      }
    } else {
      recDisplay = `${Math.round(catReceivedSum)} جم`;
      soldDisplay = "—";
      const catVarianceGrams = catActualChickenSum - catReceivedSum;
      if (hasRemainingRecorded && Auth.canSeeSales()) {
        if (Math.abs(catVarianceGrams) <= 50) {
          varBadgeHtml = `<span class="cat-pill pill-ok">✅ مطابق</span>`;
        } else if (catVarianceGrams < 0) {
          varBadgeHtml = `<span class="cat-pill pill-danger">🔻 عجز: ${Math.abs(Math.round(catVarianceGrams))} جم`;
        } else {
          varBadgeHtml = `<span class="cat-pill pill-warn">🔺 زيادة: +${Math.round(catVarianceGrams)} جم</span>`;
        }
      } else {
        varBadgeHtml = `<span class="cat-pill pill-pending">⏳ بانتظار الجرد</span>`;
      }
    }

    html += `
      <div class="category-section category-section-rem${remainingCollapsed[cat] ? " collapsed" : ""}" data-cat="${cat}">
        <div class="category-header" onclick="toggleRemainingCategory('${String(cat).replace(/'/g, "\\'")}')">
          <div class="cat-header-main">
            <div class="cat-label">
              <span class="cat-title">${categoryIconSticker(cat)} ${cat}</span>
              ${isWeightMeal && Auth.canSeeSales() ? `<span class="badge ${getVarianceBadge((catActualChickenSum - Math.max(0, catReceivedSum - categoryConsumedGrams - catWaste)) / (catReceivedSum || 1) * 100).class}" style="font-size:11px;margin-right:6px;">${getVarianceBadge((catActualChickenSum - Math.max(0, catReceivedSum - categoryConsumedGrams - catWaste)) / (catReceivedSum || 1) * 100).label}</span>` : ''}
            </div>

            <!-- شريط مؤشرات التصنيف: المستلم، المباع، المتبقي، العجز -->
            <div class="cat-metrics-bar" id="cat-metrics-${catSafeId}" onclick="event.stopPropagation()">
              <span class="cat-pill pill-rec" title="إجمالي الكمية المستلمة صباحاً">
                📥 مستلم: <b>${recDisplay}</b>
              </span>
              ${Auth.canSeeSales() ? `
                <span class="cat-pill pill-sold" title="إجمالي المبيعات المسحوبة من تابسنس">
                  💳 مباع: <b>${soldDisplay}</b>
                </span>
              ` : ''}
              <span class="cat-pill pill-rem" id="cat-pill-rem-${catSafeId}" title="إجمالي المتبقي الفعلي المسجل">
                ${formatCategoryRemainingPill(hasRemainingRecorded, isWeightMeal ? (catActualChickenSum / MEAL_WEIGHT_G).toFixed(1).replace(/\.0$/, "") : null, catActualChickenSum, catActualSauceSum, cat)}
              </span>
              ${Auth.canSeeSales() ? `
                <span id="cat-pill-var-${catSafeId}">
                  ${varBadgeHtml}
                </span>
              ` : ''}
            </div>
          </div>

          <span class="cat-count-badge">
            <span class="cat-count" id="cat-count-${catSafeId}">${filledCount}/${catItems.length}</span>
            <span class="chevron">▾</span>
          </span>
        </div>
        <div class="category-body">
          <div>
            ${cardsHtml}
            <button type="button" class="rec-add-item-btn" onclick="${usesChefSlots(cat) ? "openRemainingChefPicker" : "openAddRemainingItemModal"}('${String(cat).replace(/'/g, "\\'")}')">
              ➕ ${usesChefSlots(cat) ? "إضافة صنف " + cat : "إضافة صنف في قسم (" + cat + ")"}
            </button>
          </div>
        </div>
      </div>
    `;
  });

  view.innerHTML = html;
  filterRemainingCardsUI();
  updateEntryProgress(view);
}

function updateCategoryHeaderMetrics(itemId) {
  const items = getAllRemainingActiveItems(cachedReceivingDataForRemaining);
  const targetItem = items.find(it => it.id === itemId);
  if (!targetItem) return;
  const cat = targetItem.category || "عام";
  const catSafeId = cssId(cat);

  const catItems = items.filter(it => (it.category || "عام") === cat);
  const isWeightMeal = isWeightMealCategory(cat);
  const isSandwich = isSandwichCategory(cat);
  const isSalad = isSaladCategory(cat);
  const isMealCat = isMealMatchingCategory(cat);

  const salesMap = {};
  if (cachedSalesDataForRemaining && Array.isArray(cachedSalesDataForRemaining)) {
    cachedSalesDataForRemaining.forEach(r => {
      salesMap[r.category] = (salesMap[r.category] || 0) + Number(r.qty || 0);
    });
  }
  const categorySoldMeals = isMealCat ? getMatchedCategorySales(salesMap, cat) : 0;

  const receivingMap = {};
  if (cachedReceivingDataForRemaining && cachedReceivingDataForRemaining.items) {
    cachedReceivingDataForRemaining.items.forEach(it => { receivingMap[it.itemId] = it; });
  }

  let catReceivedSum = 0;
  let catActualChickenSum = 0;
  let catActualSauceSum = 0;
  let filledCount = 0;

  catItems.forEach(it => {
    const recEntry = receivingMap[it.id] || {};
    catReceivedSum += Number(recEntry.received || 0);

    const remData = currentRemainingData[it.id] || {};
    const rawVal = remData.remaining || remData.remainingWeight || remData.remainingSauce;
    if (rawVal !== "" && rawVal !== null && rawVal !== undefined) {
      filledCount++;
    }
    const numVal = Number(rawVal || 0);
    if (remData.isSauce) {
      catActualSauceSum += numVal;
    } else {
      catActualChickenSum += numVal;
    }
  });

  const catWaste = catItems.reduce((sum, it) => sum + remainingWasteFor(it.id), 0);

  const countEl = document.getElementById("cat-count-" + catSafeId);
  if (countEl) countEl.textContent = `${filledCount}/${catItems.length}`;

  const remPill = document.getElementById("cat-pill-rem-" + catSafeId);
  const hasRemainingRecorded = filledCount > 0;
  const remMeals = isWeightMeal ? (catActualChickenSum / MEAL_WEIGHT_G).toFixed(1).replace(/\.0$/, "") : null;
  if (remPill) {
    remPill.innerHTML = formatCategoryRemainingPill(hasRemainingRecorded, remMeals, catActualChickenSum, catActualSauceSum, cat);
  }

  const varPillContainer = document.getElementById("cat-pill-var-" + catSafeId);
  if (varPillContainer) {
    if (!Auth.canSeeSales()) {
      varPillContainer.innerHTML = "";
    } else {
      if (isWeightMeal) {
        const categoryConsumedGrams = categorySoldMeals * MEAL_WEIGHT_G;
        const expectedRemainingGrams = Math.max(0, catReceivedSum - categoryConsumedGrams - catWaste);
        const catVarianceGrams = catActualChickenSum - expectedRemainingGrams;
        const varMeals = (catVarianceGrams / MEAL_WEIGHT_G).toFixed(1).replace(/\.0$/, "");

        if (hasRemainingRecorded) {
          if (Math.abs(catVarianceGrams) <= 50) {
            varPillContainer.innerHTML = `<span class="cat-pill pill-ok">✅ مطابق</span>`;
          } else if (catVarianceGrams < 0) {
            varPillContainer.innerHTML = `<span class="cat-pill pill-danger">🔻 عجز: ${Math.abs(varMeals)} وجبة</span>`;
          } else {
            varPillContainer.innerHTML = `<span class="cat-pill pill-warn">🔺 زيادة: +${varMeals} وجبة</span>`;
          }
        } else {
          varPillContainer.innerHTML = `<span class="cat-pill pill-pending">⏳ بانتظار الجرد</span>`;
        }
      } else if (isSandwich) {
        const recCount = Math.round(catReceivedSum);
        const soldCount = categorySoldMeals;
        const expectedRem = Math.max(0, recCount - soldCount - Math.round(catWaste));
        const catVariance = Math.round(catActualChickenSum) - expectedRem;

        if (hasRemainingRecorded) {
          if (catVariance === 0) {
            varPillContainer.innerHTML = `<span class="cat-pill pill-ok">✅ مطابق</span>`;
          } else if (catVariance < 0) {
            varPillContainer.innerHTML = `<span class="cat-pill pill-danger">🔻 عجز: ${Math.abs(catVariance)} ساندويتش</span>`;
          } else {
            varPillContainer.innerHTML = `<span class="cat-pill pill-warn">🔺 زيادة: +${catVariance} ساندويتش</span>`;
          }
        } else {
          varPillContainer.innerHTML = `<span class="cat-pill pill-pending">⏳ بانتظار الجرد</span>`;
        }
      } else if (isSalad) {
        const recCount = Math.round(catReceivedSum);
        const soldCount = categorySoldMeals;
        const expectedRem = Math.max(0, recCount - soldCount - Math.round(catWaste));
        const catVariance = Math.round(catActualChickenSum) - expectedRem;

        if (hasRemainingRecorded) {
          if (catVariance === 0) {
            varPillContainer.innerHTML = `<span class="cat-pill pill-ok">✅ مطابق</span>`;
          } else if (catVariance < 0) {
            varPillContainer.innerHTML = `<span class="cat-pill pill-danger">🔻 عجز: ${Math.abs(catVariance)} حبة</span>`;
          } else {
            varPillContainer.innerHTML = `<span class="cat-pill pill-warn">🔺 زيادة: +${catVariance} حبة</span>`;
          }
        } else {
          varPillContainer.innerHTML = `<span class="cat-pill pill-pending">⏳ بانتظار الجرد</span>`;
        }
      } else {
        const catVarianceGrams = catActualChickenSum - catReceivedSum;
        if (hasRemainingRecorded) {
          if (Math.abs(catVarianceGrams) <= 50) {
            varPillContainer.innerHTML = `<span class="cat-pill pill-ok">✅ مطابق</span>`;
          } else if (catVarianceGrams < 0) {
            varPillContainer.innerHTML = `<span class="cat-pill pill-danger">🔻 عجز: ${Math.abs(Math.round(catVarianceGrams))} جم</span>`;
          } else {
            varPillContainer.innerHTML = `<span class="cat-pill pill-warn">🔺 زيادة: +${Math.round(catVarianceGrams)} جم</span>`;
          }
        } else {
          varPillContainer.innerHTML = `<span class="cat-pill pill-pending">⏳ بانتظار الجرد</span>`;
        }
      }
    }
  }
}

function toggleRemainingCategory(cat) {
  remainingCollapsed[cat] = !remainingCollapsed[cat];
  document.querySelectorAll(".category-section-rem").forEach(sec => {
    if (sec.dataset.cat === cat) {
      sec.classList.toggle("collapsed", !!remainingCollapsed[cat]);
    }
  });
}

function onRemainingBranchChange(branch) {
  Branch.set(branch);
  currentRemainingBranch = branch;
  if (typeof currentReceivingBranch !== "undefined") currentReceivingBranch = branch;
  loadRemainingData(currentRemainingDate, currentRemainingBranch);
}

function onQuickRemWeightZero(itemId) {
  onRemainingWeightChange(itemId, "0");
  const input = document.getElementById("remweight-" + itemId);
  if (input) input.value = "0";
}

function onQuickRemWeightClear(itemId) {
  onRemainingWeightChange(itemId, "");
  const input = document.getElementById("remweight-" + itemId);
  if (input) input.value = "";
}

function onQuickRemWeightIncrement(itemId, delta) {
  const currentVal = Number((currentRemainingData[itemId] || {}).remaining || (currentRemainingData[itemId] || {}).remainingWeight || (currentRemainingData[itemId] || {}).remainingSauce || 0);
  const newVal = Math.max(0, currentVal + delta);
  onRemainingWeightChange(itemId, String(newVal));
  const input = document.getElementById("remweight-" + itemId);
  if (input) input.value = newVal;
}

function onRemainingWeightChange(itemId, val) {
  if (!currentRemainingData[itemId]) {
    currentRemainingData[itemId] = { remaining: "", remainingWeight: "", remainingSauce: "", isSauce: false, notes: "" };
  }
  const isSauce = !!currentRemainingData[itemId].isSauce;
  currentRemainingData[itemId].remaining = val;
  if (isSauce) {
    currentRemainingData[itemId].remainingSauce = val;
    currentRemainingData[itemId].remainingWeight = "";
  } else {
    currentRemainingData[itemId].remainingWeight = val;
    currentRemainingData[itemId].remainingSauce = "";
  }

  const card = document.querySelector(`.remaining-card-mobile[data-item-id="${itemId}"]`);
  if (card) {
    const isCounted = (val !== "" && val !== null);
    card.dataset.counted = String(isCounted);
    const input = card.querySelector(`#remweight-${itemId}`);
    if (input) input.classList.toggle("border-green", Number(val || 0) > 0);
  }

  updateItemRemainingDisplay(itemId);
  updateCategoryHeaderMetrics(itemId);

  saveRemainingLocalDebounced();
  updateSaveBarRemainingStatus();
}

function toggleRemainingIsSauce(itemId) {
  if (!currentRemainingData[itemId]) {
    currentRemainingData[itemId] = { remaining: "", remainingWeight: "", remainingSauce: "", isSauce: false, notes: "" };
  }
  const currentVal = currentRemainingData[itemId].remaining || currentRemainingData[itemId].remainingWeight || currentRemainingData[itemId].remainingSauce || "";
  const newIsSauce = !currentRemainingData[itemId].isSauce;
  currentRemainingData[itemId].isSauce = newIsSauce;

  if (newIsSauce) {
    currentRemainingData[itemId].remainingSauce = currentVal;
    currentRemainingData[itemId].remainingWeight = "";
  } else {
    currentRemainingData[itemId].remainingWeight = currentVal;
    currentRemainingData[itemId].remainingSauce = "";
  }
  currentRemainingData[itemId].remaining = currentVal;

  const btn = document.getElementById("remsauce-btn-" + itemId);
  if (btn) {
    btn.classList.toggle("active", newIsSauce);
    btn.innerHTML = newIsSauce ? `✅ 🥣 صوص` : `🥣 صوص`;
    btn.title = newIsSauce ? "الوزن المسجل محسوب كصوص (اضغط لإعادته كدجاج/لحم)" : "اضغط هنا لو كان متبقي الوزن صوص مو دجاج/لحم";
  }

  const card = document.querySelector(`.remaining-card-mobile[data-item-id="${itemId}"]`);
  if (card) {
    card.dataset.issauceweight = String(newIsSauce);
    card.dataset.hassauce = String(newIsSauce);
  }

  updateItemRemainingDisplay(itemId);
  updateCategoryHeaderMetrics(itemId);

  saveRemainingLocalDebounced();
  updateSaveBarRemainingStatus();
}

function onQuickRemSauceZero(itemId) {
  onRemainingSauceChange(itemId, "0");
  const input = document.getElementById("remsauce-" + itemId);
  if (input) input.value = "0";
}

function onQuickRemSauceClear(itemId) {
  onRemainingSauceChange(itemId, "");
  const input = document.getElementById("remsauce-" + itemId);
  if (input) input.value = "";
}

function onQuickRemSauceIncrement(itemId, delta) {
  const currentVal = Number((currentRemainingData[itemId] || {}).remainingSauce || 0);
  const newVal = Math.max(0, currentVal + delta);
  onRemainingSauceChange(itemId, String(newVal));
  const input = document.getElementById("remsauce-" + itemId);
  if (input) input.value = newVal;
}

function onRemainingSauceChange(itemId, val) {
  if (!currentRemainingData[itemId]) currentRemainingData[itemId] = { remaining: "", remainingWeight: "", remainingSauce: "", notes: "" };
  currentRemainingData[itemId].remainingSauce = val;

  const card = document.querySelector(`.remaining-card-mobile[data-item-id="${itemId}"]`);
  if (card) {
    const isCounted = ((currentRemainingData[itemId].remainingWeight || "") !== "") || (val !== "" && val !== null);
    card.dataset.counted = String(isCounted);
    const input = card.querySelector(`#remsauce-${itemId}`);
    if (input) input.classList.toggle("border-green", Number(val || 0) > 0);
  }

  updateItemRemainingDisplay(itemId);
  updateCategoryHeaderMetrics(itemId);

  saveRemainingLocalDebounced();
  updateSaveBarRemainingStatus();
}

function onRemainingNotesChange(itemId, val) {
  if (!currentRemainingData[itemId]) currentRemainingData[itemId] = { remaining: "", remainingWeight: "", remainingSauce: "", notes: "" };
  currentRemainingData[itemId].notes = val;
  saveRemainingLocalDebounced();
  updateSaveBarRemainingStatus();
}

let saveRemLocalTimer = null;
function saveRemainingLocalDebounced() {
  clearTimeout(saveRemLocalTimer);
  remainingAutosave.schedule();
  saveRemLocalTimer = setTimeout(() => {
    const allItems = getAllRemainingActiveItems(cachedReceivingDataForRemaining);
    const itemsPayload = [];
    allItems.forEach(it => {
      const data = currentRemainingData[it.id] || { remaining: "", remainingWeight: "", remainingSauce: "", isSauce: false, notes: "" };
      itemsPayload.push({
        itemId: it.id,
        itemName: it.name,
        unit: it.unit || "جرام",
        category: it.category || "عام",
        isCustom: !!it.isCustom,
        remaining: data.remainingWeight || data.remaining || "",
        remainingWeight: data.remainingWeight || "",
        remainingSauce: data.remainingSauce || "",
        isSauce: !!data.isSauce,
        notes: data.notes || ""
      });
    });

    Sync.cacheSet("remaining:" + currentRemainingDate + ":" + currentRemainingBranch, {
      date: currentRemainingDate,
      branch: currentRemainingBranch,
      meta: currentRemainingMeta,
      items: itemsPayload,
      removedItemIds: Array.from(currentRemainingRemovedIds)
    });
  }, 400);
}

function updateSaveBarRemainingStatus() {
  const statusEl = document.getElementById("remainingSaveStatus");
  if (statusEl) {
    statusEl.textContent = "لديك تعديلات بتقرير المتبقي جاهزة للحفظ السحابي";
    statusEl.classList.add("dirty");
  }
}

async function saveRemainingReportData() {
  if (isRemainingSaving) return;
  // منحفظ على اليوم والفرع المحمّلين فعلاً — إذا الشاشة لسا عم تحمّل يوم تاني ما منحفظ
  if (!remainingDataKey) { showToast("⏳ لحظة، الشاشة لسا عم تحمّل"); return; }
  isRemainingSaving = true;

  const saveBtn = document.getElementById("remainingSaveBtn");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "جاري حفظ التقرير…"; }

  const allItems = getAllRemainingActiveItems(cachedReceivingDataForRemaining);
  const itemsPayload = [];
  allItems.forEach(it => {
    const data = currentRemainingData[it.id] || { remaining: "", remainingWeight: "", remainingSauce: "", isSauce: false, notes: "" };
    itemsPayload.push({
      itemId: it.id,
      itemName: it.name,
      unit: it.unit || "جرام",
      category: it.category || "عام",
      isCustom: !!it.isCustom,
      remaining: data.remainingWeight || data.remaining || "",
      remainingWeight: data.remainingWeight || "",
      remainingSauce: data.remainingSauce || "",
      isSauce: !!data.isSauce,
      notes: data.notes || ""
    });
  });

  const emp = Auth.getEmployee();
  const payload = {
    date: remainingDataKey.date,
    branch: remainingDataKey.branch,
    employeeName: emp ? emp.name : "",
    meta: currentRemainingMeta,
    items: itemsPayload,
    removedItemIds: Array.from(currentRemainingRemovedIds),
    savedAt: new Date().toISOString()
  };

  if (!(await confirmNoDataLoss("remaining", payload.date, payload.branch, itemsPayload))) {
    isRemainingSaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "💾 حفظ تقرير المتبقي"; }
    showToast("تم إلغاء الحفظ — الأرقام المحفوظة ما انمسحت");
    return;
  }

  Sync.cacheSet("remaining:" + currentRemainingDate + ":" + currentRemainingBranch, payload);

  const statusEl = document.getElementById("remainingSaveStatus");

  try {
    // محاولة المزامنة الفورية السريعة مع Supabase
    await Sync.postOnce("saveRemainingReport", payload);
    itemsPayload.forEach(i => { remainingBaseline[i.itemId] = remainingSnapshot(currentRemainingData[i.itemId]); });
    showToast("✅ تم رفع تقرير المتبقي ومزامنته سحابياً بنجاح!");
    if (statusEl) {
      statusEl.textContent = "✅ متزامن سحابياً مع كل الأجهزة (" + new Date().toLocaleTimeString(phLocale()) + ")";
      statusEl.classList.remove("dirty");
    }
    sendSauceFormIfChanged(payload.date, payload.branch, itemsPayload);
  } catch (err) {
    console.warn("Direct saveRemainingReport sync failed, keeping in queue:", err);
    Sync.enqueue("saveRemainingReport:" + currentRemainingDate + ":" + currentRemainingBranch, "saveRemainingReport", payload);
    showToast("💾 تم الحفظ محلياً وهو في طابور المزامنة السحابية");
    if (statusEl) {
      statusEl.textContent = "⏳ محفوظ محلياً — قيد الرفع السحابي (" + (err.message || "بانتظار المزامنة") + ")";
      statusEl.classList.add("dirty");
    }
  }

  setTimeout(() => {
    isRemainingSaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "💾 حفظ تقرير المتبقي"; }
  }, 800);
}

// ==================== نموذج الصوص المتبقي (قوقل فورم) ====================
// بعد حفظ المتبقي: الموقع بيجمع الصوص حسب النوع وبيبعت النموذج لحاله.
// إذا الأرقام نفسها اللي انبعتت قبل ما منعيد؛ إذا تعدّلت منبعت نسخة جديدة (الشيت بيعتمد آخر رد).
const SAUCE_FORM_BRANCHES = ["الروضة", "الشاطئ", "عبداللطيف جميل"];
function sauceBucketOf(it) {
  const n = it.name || it.itemName || "", c = it.category || "";
  if (/سالمون/.test(n)) return "salmon";
  if (/جمبري|روبيان/.test(n)) return "shrimp";
  if (/^دجاج/.test(n) || c.includes("دجاج")) return "chicken";
  if (/^لحم/.test(n) || c.includes("لحم")) return "meat";
  if (c.includes("بحري") || /سمك|فيليه/.test(n)) return "fillet";
  return null;
}
function sauceTotals(items) {
  const t = { chicken: 0, meat: 0, fillet: 0, salmon: 0, shrimp: 0 };
  items.forEach(it => {
    if (!it.isSauce) return;
    const g = Number(it.remainingSauce || it.remaining || 0);
    const k = sauceBucketOf(it);
    if (k && g > 0) t[k] += Math.round(g);
  });
  return t;
}
async function sendSauceFormIfChanged(date, branch, items) {
  if (!SAUCE_FORM_BRANCHES.includes(branch) || typeof SupaEngine === "undefined" || !SupaEngine.sendGoogleForm) return;
  const totals = sauceTotals(items);
  const statusEl = document.getElementById("remainingSaveStatus");
  try {
    const last = await SupaEngine.getLastFormSubmission("sauce", date, branch).catch(() => null);
    const same = last && Object.keys(totals).every(k => String(totals[k]) === String((last.payload || {})[k]));
    if (same) return;
    const emp = Auth.getEmployee();
    await SupaEngine.sendGoogleForm({ form: "sauce", date, branch, name: emp ? emp.name : "", ...totals });
    showToast(last ? "📤 انرسل تعديل نموذج الصوص" : "📤 انرسل نموذج الصوص تلقائياً");
    if (statusEl) statusEl.textContent += " · 📤 نموذج الصوص انرسل";
  } catch (e) {
    if (await phConfirm("⚠ ما انرسل نموذج الصوص: " + (e.message || "تأكد من النت") + "\nنعيد المحاولة؟", { ok: "أعد الإرسال" })) {
      return sendSauceFormIfChanged(date, branch, items);
    }
  }
}

async function closeOperationalDay() {
  if (!(await phConfirm("هل أنت متأكد من إغلاق اليوم التشغيلي واعتماد كافة الكميات والجرد؟ بعد الإغلاق لن يمكن التعديل إلا بإذن المدير."))) {
    return;
  }

  const emp = Auth.getEmployee();
  currentRemainingMeta = {
    isClosed: true,
    closedBy: emp ? emp.name : "مدير الفرع",
    closedAt: new Date().toISOString()
  };

  await saveRemainingReportData();
  showToast("🔒 تم إغلاق اليوم التشغيلي بنجاح!");
  loadRemainingData(currentRemainingDate, currentRemainingBranch);
}


// ---- وظائف إزالة وإضافة الأصناف في جرد المتبقي ----

async function onRemoveRemainingItem(itemId, itemName) {
  const confirmed = await phConfirm(`هل أنت متأكد من استبعاد الصنف "${itemName || ''}" من جرد المتبقي اليوم؟`, { ok: "شيله", danger: true });
  if (!confirmed) return;

  const date = currentRemainingDate;
  const branch = currentRemainingBranch;
  const prevData = currentRemainingData[itemId];
  const prevExtra = currentRemainingExtraItems.find(it => it.id === itemId);

  currentRemainingRemovedIds.add(itemId);
  currentRemainingExtraItems = currentRemainingExtraItems.filter(it => it.id !== itemId);
  delete currentRemainingData[itemId];

  renderRemainingView(cachedReceivingDataForRemaining, cachedSalesDataForRemaining);
  saveRemainingLocalDebounced();
  updateSaveBarRemainingStatus();

  let savedRows = [];
  const removedList = Array.from(currentRemainingRemovedIds);
  const removal = (async () => {
    if (typeof SupaEngine === "undefined" || typeof SUPABASE_URL === "undefined" || !SUPABASE_URL) return;
    try { savedRows = await SupaEngine.getEntryRows(date, branch, itemId); } catch (e) { console.warn("Undo snapshot error:", e); }
    await SupaEngine.saveRemainingReport({ date, branch, removedItemIds: removedList }).catch(e => console.warn("Auto sync remaining removal error:", e));
  })();

  showUndoBar(`🗑️ انشال "${itemName || ''}" من جرد المتبقي`, async () => {
    await removal;
    if (currentRemainingDate === date && currentRemainingBranch === branch) {
      currentRemainingRemovedIds.delete(itemId);
      if (prevExtra) currentRemainingExtraItems.push(prevExtra);
      if (prevData) currentRemainingData[itemId] = prevData;
      renderRemainingView(cachedReceivingDataForRemaining, cachedSalesDataForRemaining);
      saveRemainingLocalDebounced();
    }
    await restoreRemovedItem(date, branch, itemId, savedRows);
  });
}

function openAddRemainingItemModal(category) {
  const existingModal = document.getElementById("customRemainingModal");
  if (existingModal) existingModal.remove();

  const modalHtml = `
    <div class="custom-rec-modal-backdrop" id="customRemainingModal" onclick="if(event.target===this) closeAddRemainingItemModal()">
      <div class="custom-rec-modal-box">
        <div class="custom-rec-modal-header">
          <h3>➕ إضافة صنف لجرد قسم (${category})</h3>
          <button type="button" class="custom-rec-modal-close" onclick="closeAddRemainingItemModal()">✕</button>
        </div>
        <div class="custom-rec-modal-body">
          <div class="custom-rec-field-group">
            <label>اسم الصنف المراد جرده *</label>
            <input type="text" id="customRemItemName" placeholder="مثال: دجاج متبل إضافي، صوص خاص..." autofocus>
          </div>
          <div class="custom-rec-field-group">
            <label>وحدة القياس</label>
            <select id="customRemItemUnit">
              <option value="جرام" selected>جرام (جم)</option>
              <option value="كجم">كيلو جرام (كجم)</option>
              <option value="حبة">حبة</option>
              <option value="علبة">علبة</option>
              <option value="لتر">لتر</option>
            </select>
          </div>
          <div class="custom-rec-field-group">
            <label>الوزن أو الكمية المتبقية الليلة</label>
            <input type="number" step="any" min="0" inputmode="decimal" id="customRemItemQty" placeholder="0">
          </div>
          <div class="custom-rec-modal-actions">
            <button type="button" class="btn-save" onclick="confirmAddRemainingItem('${String(category).replace(/'/g, "\\'")}')">✅ إضافة للجرد</button>
            <button type="button" class="btn-cancel" onclick="closeAddRemainingItemModal()">إلغاء</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  setTimeout(() => {
    const input = document.getElementById("customRemItemName");
    if (input) input.focus();
  }, 100);
}

function closeAddRemainingItemModal() {
  const modal = document.getElementById("customRemainingModal");
  if (modal) modal.remove();
}

function confirmAddRemainingItem(category) {
  const nameInput = document.getElementById("customRemItemName");
  const unitInput = document.getElementById("customRemItemUnit");
  const qtyInput = document.getElementById("customRemItemQty");

  const name = (nameInput?.value || "").trim();
  const unit = unitInput?.value || "جرام";
  const qty = (qtyInput?.value || "").trim();

  if (!name) {
    phAlert("يرجى كتابة اسم الصنف أولاً!");
    if (nameInput) nameInput.focus();
    return;
  }

  const newCustomId = "custom_rem_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  const newItem = {
    id: newCustomId,
    name: name,
    unit: unit,
    category: category,
    branches: currentRemainingBranch,
    isCustom: true
  };

  currentRemainingExtraItems.push(newItem);
  currentRemainingData[newCustomId] = {
    remaining: qty !== "" ? String(qty) : "",
    remainingWeight: qty !== "" ? String(qty) : "",
    remainingSauce: "",
    notes: "صنف إضافي بجرد المتبقي"
  };

  try {
    Items.save({
      id: newCustomId,
      name: name,
      unit: unit,
      category: category,
      branches: currentRemainingBranch,
      isCustom: true
    });
  } catch (err) {
    console.warn("تعذر حفظ الصنف المشترك:", err);
  }

  closeAddRemainingItemModal();
  showToast(`✅ تم إضافة صنف "${name}" إلى جرد قسم ${category}`);
  renderRemainingView(cachedReceivingDataForRemaining, cachedSalesDataForRemaining);
  saveRemainingLocalDebounced();
  updateSaveBarRemainingStatus();
}

let remainingNotesExpanded = {};
function toggleRemainingNote(itemId) {
  remainingNotesExpanded[itemId] = !remainingNotesExpanded[itemId];
  const drawer = document.getElementById("remnote-drawer-" + itemId);
  if (drawer) {
    drawer.classList.toggle("hidden", !remainingNotesExpanded[itemId]);
    drawer.classList.toggle("expanded", !!remainingNotesExpanded[itemId]);
    if (remainingNotesExpanded[itemId]) {
      const inp = document.getElementById("remnote-" + itemId);
      if (inp) inp.focus();
    }
  }
}


// خانات الشيف من شاشة المتبقي
function openRemainingChefPicker(category) {
  const shown = new Set(getAllRemainingActiveItems(cachedReceivingDataForRemaining).map(it => it.id));
  openChefPicker({
    category,
    branch: currentRemainingBranch,
    isUsed: (id) => shown.has(id),
    extraNames: Object.values(currentRemainingAddedSlots),
    onPick(slot, name) {
      currentRemainingAddedSlots[slot.id] = name;
      renderRemainingView(cachedReceivingDataForRemaining, cachedSalesDataForRemaining);
      focusEntryById("remweight-" + slot.id);
    }
  });
}


// ---- الهدر من شاشة المتبقي (نفس جدول سجل الهدر) ----
function remainingWasteFor(itemId) {
  return (currentRemainingWaste || []).filter(w => w.itemId === itemId).reduce((sum, w) => sum + Number(w.qty || 0), 0);
}

function saveRemainingWaste() {
  const payload = { date: currentRemainingDate, branch: currentRemainingBranch, items: currentRemainingWaste };
  Sync.cacheSet("waste:" + currentRemainingDate + ":" + currentRemainingBranch, payload);
  Sync.enqueue("saveWasteReport:" + currentRemainingDate + ":" + currentRemainingBranch, "saveWasteReport", payload);
}

function openRemainingWaste(itemId) {
  const it = getAllRemainingActiveItems(cachedReceivingDataForRemaining).find(x => x.id === itemId) || Items.byId(itemId);
  if (!it) return;
  const cat = String(it.category || "");
  const unit = isSandwichCategory(cat) ? "ساندويتش" : (isSaladCategory(cat) ? "حبة" : (it.unit || "جم"));
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const records = currentRemainingWaste.filter(w => w.itemId === itemId);
  let reason = WASTE_REASONS[0];
  const wrap = document.createElement("div");
  wrap.className = "ph-dialog";
  wrap.innerHTML = `
    <div class="ph-dialog-card waste-dialog" role="dialog" aria-modal="true">
      <img class="ph-dialog-logo" src="assets/logo.png" alt="">
      <div class="ph-dialog-title">🗑 هدر: ${esc(it.name)}</div>
      ${records.length ? `<div class="waste-list">${records.map(w => `
        <div class="waste-row"><span><b>${esc(w.qty)} ${esc(unit)}</b> · ${esc(w.reason)}${w.notes ? " · " + esc(w.notes) : ""}</span>
        <button type="button" class="waste-del" data-id="${esc(w.id)}" aria-label="حذف">✕</button></div>`).join("")}</div>` : ""}
      <input class="ph-dialog-input waste-qty" type="number" inputmode="decimal" min="0" step="any" placeholder="الكمية (${esc(unit)})">
      <div class="waste-reasons">${WASTE_REASONS.map((r, i) => `<button type="button" class="chef-opt waste-reason${i ? "" : " active"}" data-r="${esc(r)}">${esc(r)}</button>`).join("")}</div>
      <input class="ph-dialog-input waste-note" type="text" placeholder="ملاحظة (اختياري)">
      <div class="ph-dialog-actions">
        <button type="button" class="ph-dialog-ok waste-add">سجّل الهدر</button>
        <button type="button" class="ph-dialog-cancel">سكّر</button>
      </div>
    </div>`;
  const close = () => { wrap.classList.add("closing"); setTimeout(() => wrap.remove(), 160); };
  const rerender = () => renderRemainingView(cachedReceivingDataForRemaining, cachedSalesDataForRemaining);
  wrap.querySelectorAll(".waste-reason").forEach(b => b.addEventListener("click", () => {
    reason = b.dataset.r;
    wrap.querySelectorAll(".waste-reason").forEach(x => x.classList.toggle("active", x === b));
  }));
  wrap.querySelectorAll(".waste-del").forEach(b => b.addEventListener("click", () => {
    currentRemainingWaste = currentRemainingWaste.filter(w => String(w.id) !== b.dataset.id);
    saveRemainingWaste(); close(); rerender(); showToast("انحذف سجل الهدر");
  }));
  wrap.querySelector(".waste-add").addEventListener("click", () => {
    const qty = Number(wrap.querySelector(".waste-qty").value);
    if (!qty || qty <= 0) { showToast("⚠ اكتب كمية الهدر"); return; }
    const emp = Auth.getEmployee();
    currentRemainingWaste.push({
      id: (crypto.randomUUID ? crypto.randomUUID() : "wst_" + Date.now()),
      itemId, itemName: it.name, unit: it.unit || "جرام", qty, reason,
      notes: wrap.querySelector(".waste-note").value.trim(),
      employeeName: emp ? emp.name : "", timestamp: new Date().toISOString()
    });
    saveRemainingWaste(); close(); rerender(); showToast(`🗑 انسجل هدر ${qty} ${unit}`);
  });
  wrap.querySelector(".ph-dialog-cancel").addEventListener("click", close);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("open"));
  wrap.querySelector(".waste-qty").focus({ preventScroll: true });
}
