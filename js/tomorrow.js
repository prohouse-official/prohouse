// ==================== شاشة طلبية الغد الذكية للمالك والتشغيل (Smart Tomorrow Order & Kitchen Hub) ====================

let currentTomorrowDate = addDaysStr(todayStr(), 1);
let currentTomorrowOrder = {}; // itemId -> {qty, notes}
let currentTomorrowBranch = "";
let tomorrowCategoryCollapsed = {};
let currentTomorrowGroups = [];
let currentTomorrowRecommendations = {}; // itemId -> {qty, avg, reason}
let currentTomorrowTodayReceived = {}; // itemId -> receivedQty
let currentTomorrowTodayRemaining = {}; // itemId -> remainingQty
let currentTomorrowTodaySales = {}; // category -> soldQty
let tomorrowActiveFilter = "all"; // 'all', 'unfilled', 'protein', 'sauce'
let currentTomorrowExtraItems = [];
let currentTomorrowRemovedIds = new Set();
let currentTomorrowAddedIds = new Set(); // خانات الشيف/الطبخات اللي انضافت لطلبية هاليوم

function getAllTomorrowActiveItems() {
  const branch = currentTomorrowBranch || Branch.get();
  const itemsMap = new Map();

  // 1. الأصناف الأساسية من Items.current
  (Items.current || []).forEach(it => {
    const branches = itemBranches(it);
    if (branches.length && branch && !branches.includes(branch)) return;
    if (isOptionalItem(it) && !currentTomorrowAddedIds.has(it.id) && !currentTomorrowOrder[it.id]) return;
    const ord = currentTomorrowOrder[it.id];
    itemsMap.set(it.id, isChefItem(it) && ord && ord.cookName ? { ...it, name: chefSlotName(it, ord.cookName) } : { ...it });
  });

  // 2. الأصناف المستلمة اليوم من الاستلام (تشمل أي صنف إضافي أضافه الشيف أو الفرع)
  Object.keys(currentTomorrowTodayReceived).forEach(id => {
    if (isOptionalItem(Items.byId(id))) return;
    if (!itemsMap.has(id)) {
      const itemDef = Items.byId(id);
      itemsMap.set(id, {
        id: id,
        name: itemDef ? itemDef.name : id,
        unit: itemDef ? itemDef.unit : "جرام",
        category: itemDef ? itemDef.category : "عام",
        isCustom: true,
        branches: branch
      });
    }
  });

  // 3. الأصناف المتبقية الليلة
  Object.keys(currentTomorrowTodayRemaining).forEach(id => {
    if (isOptionalItem(Items.byId(id))) return;
    if (!itemsMap.has(id)) {
      const itemDef = Items.byId(id);
      itemsMap.set(id, {
        id: id,
        name: itemDef ? itemDef.name : id,
        unit: itemDef ? itemDef.unit : "جرام",
        category: itemDef ? itemDef.category : "عام",
        isCustom: true,
        branches: branch
      });
    }
  });

  // 4. الأصناف الإضافية الخاصة بطلبية الغد
  currentTomorrowExtraItems.forEach(it => {
    if (!itemsMap.has(it.id)) itemsMap.set(it.id, { ...it });
  });

  // 5. استبعاد الأصناف المحذوفة
  const result = [];
  itemsMap.forEach((item, id) => {
    if (currentTomorrowRemovedIds.has(id)) return;
    result.push(item);
  });

  return result;
}

function isTomorrowItemFilled(id) {
  const e = currentTomorrowOrder[id];
  return !!(e && e.qty !== "" && e.qty !== null && e.qty !== undefined && Number(e.qty) >= 0);
}

function setTomorrowFilter(filterName) {
  tomorrowActiveFilter = filterName;
  document.querySelectorAll(".tom-filter-chip").forEach(el => {
    el.classList.toggle("active", el.dataset.filter === filterName);
  });
  filterTomorrowCardsUI();
}

function filterTomorrowCardsUI() {
  document.querySelectorAll(".tomorrow-item-card").forEach(card => {
    const isFilled = card.dataset.filled === "true";
    const isProtein = card.dataset.isprotein === "true";
    const isSauce = card.dataset.issauce === "true";

    let visible = true;
    if (tomorrowActiveFilter === "unfilled") {
      visible = !isFilled;
    } else if (tomorrowActiveFilter === "protein") {
      visible = isProtein;
    } else if (tomorrowActiveFilter === "sauce") {
      visible = isSauce;
    }
    card.style.display = visible ? "" : "none";
  });

  document.querySelectorAll(".category-section-tom").forEach(sec => {
    const visibleCards = sec.querySelectorAll('.tomorrow-item-card:not([style*="display: none"])');
    sec.style.display = visibleCards.length > 0 ? "" : "none";
  });
}

function renderTomorrowView() {
  const view = document.getElementById("tomorrowView");
  if (!view) return;
  view.innerHTML = "";

  const myBranches = allowedBranchList();
  const branchLocked = myBranches.length <= 1;
  const ro = Auth.isViewOnlyTomorrow() ? "disabled" : "";
  // فرع يطلب بعدد السفنديشات (الشاطئ): العدد + حجم السفنديش، بدون مقترح/مجاميع بالجرام
  const panMode = isPanOrderBranch(currentTomorrowBranch);

  // تجميع الإحصائيات
  const allActiveItems = getAllTomorrowActiveItems();
  const totalItems = allActiveItems.length;
  const filledItems = allActiveItems.filter(it => isTomorrowItemFilled(it.id)).length;
  let totalRequestedWeight = 0;
  let totalEstimatedMeals = 0;

  allActiveItems.forEach(it => {
    const ord = currentTomorrowOrder[it.id];
    if (ord && ord.qty) {
      const q = Number(ord.qty);
      if (!isNaN(q) && q > 0) {
        if (isMealCategory(it.category) || (it.unit && (it.unit.includes("جرام") || it.unit.includes("جم")))) {
          totalRequestedWeight += q;
          totalEstimatedMeals += q / MEAL_WEIGHT_G;
        }
      }
    }
  });

  const headerCard = document.createElement("div");
  headerCard.className = "tomorrow-mobile-header";
  headerCard.innerHTML = `
    <div class="tom-top-row">
      <div>
        <h2 class="tom-main-title">📋 إعداد طلبية المطبخ المركزي</h2>
        <span class="tom-date-subtitle">📅 ليوم: ${currentTomorrowDate} | بناءً على مبيعات وجرد متبقي الليلة</span>
      </div>
      <div class="branch-selector-wrap">
        ${branchLocked
          ? `<div class="readonly-field">${myBranches[0] || "لا يوجد فرع"}</div>`
          : `<select id="tomorrowBranchSelect" onchange="onTomorrowBranchChanged(this.value)">${branchOptionsHtml(currentTomorrowBranch)}</select>`}
      </div>
    </div>

    <!-- كروت إحصائيات الطلبية السريعة -->
    <div class="rem-stats-row">
      <div class="rem-stat-pill">
        <span class="rem-stat-num">${filledItems}/${totalItems}</span>
        <span class="rem-stat-lbl">أصناف محددة</span>
      </div>
      ${panMode ? "" : `<div class="rem-stat-pill ok">
        <span class="rem-stat-num">${(totalRequestedWeight / 1000).toFixed(1).replace(/\.0$/, "")} كجم</span>
        <span class="rem-stat-lbl">إجمالي وزن البروتين</span>
      </div>
      <div class="rem-stat-pill">
        <span class="rem-stat-num">${Math.round(totalEstimatedMeals)}</span>
        <span class="rem-stat-lbl">إجمالي الوجبات التقديرية</span>
      </div>`}
    </div>

    ${typeof tabAllowed === "function" && tabAllowed("report") ? `<button type="button" class="btn primary tom-chef-btn" onclick="goToChefReport()">👨‍🍳 طلبية الشيف (PDF للواتساب)</button>` : ""}

    <!-- المقترح للمعلومة بس — ما فيه زر يعبّي الكميات تلقائياً (كان يمسح الأوزان المكتوبة) -->

    <!-- فلاتر سريعة للتركيز -->
    <div class="rec-filters-scroll">
      <button type="button" class="rec-filter-chip tom-filter-chip ${tomorrowActiveFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="setTomorrowFilter('all')">
        الكل (${totalItems})
      </button>
      <button type="button" class="rec-filter-chip tom-filter-chip ${tomorrowActiveFilter === 'unfilled' ? 'active' : ''}" data-filter="unfilled" onclick="setTomorrowFilter('unfilled')">
        ⏳ لم يُطلب بعد (${totalItems - filledItems})
      </button>
      <button type="button" class="rec-filter-chip tom-filter-chip ${tomorrowActiveFilter === 'protein' ? 'active' : ''}" data-filter="protein" onclick="setTomorrowFilter('protein')">
        🍗 دجاج ولحوم
      </button>
      <button type="button" class="rec-filter-chip tom-filter-chip ${tomorrowActiveFilter === 'sauce' ? 'active' : ''}" data-filter="sauce" onclick="setTomorrowFilter('sauce')">
        🥣 صوصات
      </button>
    </div>
  `;
  view.appendChild(headerCard);
  // متوسط المبيعات لكل قسم يطلع بكل الفروع (حتى اللي تطلب بالسفنديشات) عشان يساعد بالطلبية
  const avgCard = document.createElement("div");
  avgCard.className = "wd-avg";
  view.appendChild(avgCard);
  renderWeekdayAverage(avgCard, currentTomorrowDate, currentTomorrowBranch);

  if (!allActiveItems.length) {
    view.insertAdjacentHTML("beforeend", '<div class="empty-state">لا توجد أصناف مسجلة.</div>');
    return;
  }

  const sortedItems = allActiveItems.slice().sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const groups = [];
  sortedItems.forEach(item => {
    const last = groups[groups.length - 1];
    if (last && last.category === item.category) last.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  });

  groups.forEach(group => {
    const section = document.createElement("div");
    section.className = "category-section category-section-tom";
    section.dataset.cat = group.category;
    if (tomorrowCategoryCollapsed[group.category]) section.classList.add("collapsed");

    const filledInCat = group.items.filter(it => isTomorrowItemFilled(it.id)).length;

    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `
      <span class="cat-label-wrap"><span class="cat-label">${categoryIconSticker(group.category)} ${group.category}</span>${panMode ? "" : tomCatTotalHtml(group.category)}</span>
      <span class="cat-count-badge">
        <span class="cat-count">${filledInCat}/${group.items.length}</span>
        <span class="chevron">▾</span>
      </span>
    `;
    header.addEventListener("click", () => {
      tomorrowCategoryCollapsed[group.category] = !tomorrowCategoryCollapsed[group.category];
      section.classList.toggle("collapsed", !!tomorrowCategoryCollapsed[group.category]);
    });
    section.appendChild(header);

    const body = document.createElement("div");
    body.className = "category-body";
    const inner = document.createElement("div");
    body.appendChild(inner);
    section.appendChild(body);

    group.items.forEach(item => {
      const entry = currentTomorrowOrder[item.id] || { qty: "", notes: "" };
      const rec = currentTomorrowRecommendations[item.id];
      const todayRec = currentTomorrowTodayReceived[item.id];
      const todayRem = currentTomorrowTodayRemaining[item.id];
      const isProtein = isMealCategory(item.category) || (item.unit && (item.unit.includes("جرام") || item.unit.includes("جم") || item.unit.includes("كجم")));
      const isSauce = (item.name && item.name.includes("صوص")) || (item.category && item.category.includes("صوص"));
      const isFilled = isTomorrowItemFilled(item.id);

      // حساب الاقتراح الذكي إن لم يتوفر من التوقع
      let smartSuggestedQty = rec ? rec.qty : "";
      let suggestReason = rec ? rec.reason : "";
      if (!smartSuggestedQty && isProtein && todayRem !== undefined) {
        // اقتراح تلقائي: تعويض استهلاك اليوم مع حد أمان 15%
        const todayUsedGrams = (todayRec ? Number(todayRec) : 0) - (todayRem ? Number(todayRem) : 0);
        if (todayUsedGrams > 0) {
          smartSuggestedQty = Math.round(todayUsedGrams * 1.15);
          suggestReason = "تعويض استهلاك اليوم + 15% أمان";
        }
      }

      // خانة الشيف: الباقي من متوسط التصنيف بعد الأصناف الثابتة، مقسوم على خانات الشيف المطلوبة
      if (isChefSlot(Items.byId(item.id) || item)) {
        const slotSug = chefSlotSuggestion(item.category, group.items);
        if (slotSug) { smartSuggestedQty = slotSug.qty; suggestReason = slotSug.reason; }
      }

      // يُعمل حسب الطلب (ستيك/سالمون/فيليه/بلانكو بالروضة والشاطئ): بدون مقترح
      const madeToOrder = madeToOrderApplies(currentTomorrowBranch) && isMadeToOrderName(item.name);
      if (madeToOrder) { smartSuggestedQty = ""; suggestReason = "يُعمل حسب الطلب — بدون مقترح"; }

      const card = document.createElement("div");
      card.className = "item-card tomorrow-item-card";
      card.id = "tomcard-" + item.id;
      card.dataset.itemId = item.id;
      card.dataset.filled = String(isFilled);
      card.dataset.isprotein = String(isProtein);
      card.dataset.issauce = String(isSauce);
      if (isChefSlot(Items.byId(item.id) || item)) card.dataset.slot = "1";

      card.innerHTML = `
        <!-- رأس الصنف -->
        <div class="rec-card-header">
          <div class="rec-item-title-wrap">
            <span class="rec-item-name">${escHtml(item.name)}</span>
            <span class="rec-item-unit">(${item.unit || "جرام"})</span>
            ${item.isCustom ? '<span class="badge ok rec-custom-badge">إضافي</span>' : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${isFilled ? '<span class="badge ok" style="font-size:11px;">✅ تم التحديد</span>' : '<span class="badge neutral" style="font-size:11px;">لم يحدد</span>'}
            <button type="button" class="rec-btn-remove" ${ro} onclick="onRemoveTomorrowItem('${item.id}', this.dataset.name)" data-name="${escHtml(item.name)}" title="استبعاد الصنف من طلبية الغد">✕</button>
          </div>
        </div>

        ${(() => {
          const def = Items.byId(item.id);
          if (!isChefItem(def)) return "";
          const v = String(entry.cookName || "").replace(new RegExp("^" + def.category + "\\s+"), "");
          return `<label class="cook-name-row">
            <span>🍳 اسم الطبخة</span>
            <input type="text" list="chefdl-${CHEF_SLOT_CATS.indexOf(def.category)}" value="${v.replace(/"/g, "&quot;")}" placeholder="اكتب أو اختار" ${ro}
                   onchange="onTomorrowCookNameChange('${item.id}', this.value)">
          </label>`;
        })()}
        <!-- مصفوفة الوضع التشغيلي اليومي -->
        <div class="tom-matrix-row">
          <div class="tom-matrix-cell">
            <span class="tom-matrix-val">${todayRec !== undefined && todayRec !== null ? Math.round(Number(todayRec)) : '—'}</span>
            <span class="tom-matrix-lbl">المستلم اليوم</span>
          </div>
          <div class="tom-matrix-cell">
            <span class="tom-matrix-val">${todayRem !== undefined && todayRem !== null ? Math.round(Number(todayRem)) : '—'}</span>
            <span class="tom-matrix-lbl">المتبقي الليلة</span>
          </div>
          ${panMode ? "" : `<div class="tom-matrix-cell" style="grid-column: span 2; background:#FFFDE7; border-radius:6px; padding:2px 4px;">
            <span class="tom-matrix-val text-orange">🤖 المقترح: ${smartSuggestedQty || '—'}</span>
            <span class="tom-matrix-lbl">${suggestReason || 'بناءً على الاستهلاك والمتبقي'}</span>
          </div>`}
        </div>

        <!-- سطر إدخال الكمية المطلوبة للجوال -->
        <div class="rec-input-action-row">
          <div class="rec-input-wrapper">
            <input type="number" inputmode="decimal" min="0" step="any"
                   id="tominput-${item.id}"
                   data-id="${item.id}" data-field="qty"
                   value="${entry.qty}" 
                   placeholder="—"
                   ${ro}
                   class="rec-main-input ${isFilled ? 'border-green' : ''}">
            ${panMode ? `<select class="tom-pan-select" ${ro} onchange="onTomorrowPanChange('${item.id}', this.value)" title="حجم السفنديش">
                ${(() => { const cur = entry.unit || itemPanSize(item) || "1/3"; return [...new Set([cur, ...PAN_SIZES])].map(u => `<option ${u === cur ? "selected" : ""}>${u}</option>`).join(""); })()}
              </select>` : `<span class="rec-input-unit-label">${item.unit || "جم"}</span>`}
          </div>

          <div class="rec-inline-btns">
            <button type="button" class="rec-btn-quick zero" ${ro} onclick="onQuickSetTomorrowZero('${item.id}')">
              0 (لا يلزم)
            </button>
            <button type="button" class="rem-mini-note-btn ${entry.notes ? 'has-notes' : ''}" onclick="toggleTomorrowNote('${item.id}')" title="ملاحظة للمطبخ">📝</button>
          </div>
        </div>

        <!-- درج الملاحظات القابل للطي -->
        <div class="rem-note-drawer ${entry.notes ? 'expanded' : 'hidden'}" id="tomnote-drawer-${item.id}">
          <input type="text" placeholder="ملاحظة للمطبخ المركزي (تقطيع خاص، توصيل مبكر...)" 
                 data-id="${item.id}" data-field="notes" 
                 value="${escHtml(entry.notes || "")}" ${ro}
                 class="rec-note-input">
        </div>
      `;

      inner.appendChild(card);
    });

    if (!Auth.isViewOnlyTomorrow()) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "rec-add-item-btn";
      const usesSlots = CHEF_SLOT_CATS.includes(String(group.category).trim());
      addBtn.textContent = usesSlots ? `➕ إضافة صنف ${group.category}` : `➕ إضافة صنف في قسم (${group.category})`;
      addBtn.onclick = () => (usesSlots ? openChefSlotPicker(group.category) : openAddTomorrowItemModal(group.category));
      inner.appendChild(addBtn);
    }

    view.appendChild(section);
  });

  if (!Auth.isViewOnlyTomorrow()) {
    view.querySelectorAll("input[data-field]").forEach(inp => {
      inp.addEventListener("input", onTomorrowFieldChange);
    });
  }

  view.insertAdjacentHTML("beforeend", CHEF_SLOT_CATS.map(chefNameDatalistHtml).join(""));
  currentTomorrowGroups = groups;
  filterTomorrowCardsUI();
}

function onTomorrowBranchChanged(val) {
  currentTomorrowBranch = val;
  Branch.set(val);
  loadTomorrowOrder(currentTomorrowDate);
}

// ---- تفاعلات سريعة للطلبية ----

function onQuickSetTomorrowSuggested(itemId, val) {
  const inp = document.getElementById("tominput-" + itemId);
  if (inp) {
    inp.value = val;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function onQuickSetTomorrowZero(itemId) {
  const inp = document.getElementById("tominput-" + itemId);
  if (inp) {
    inp.value = "0";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function onQuickTomorrowClear(itemId) {
  const inp = document.getElementById("tominput-" + itemId);
  if (inp) {
    inp.value = "";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function onQuickTomorrowIncrement(itemId, delta) {
  const inp = document.getElementById("tominput-" + itemId);
  if (inp) {
    const cur = Number(inp.value || 0);
    const n = Math.max(0, cur + delta);
    inp.value = n;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function applyAllAiRecommendations() {
  if (Auth.isViewOnlyTomorrow()) return;
  let appliedCount = 0;
  const allActiveItems = getAllTomorrowActiveItems();
  allActiveItems.forEach(item => {
    let targetVal = null;
    const rec = currentTomorrowRecommendations[item.id];
    if (rec && rec.qty) {
      targetVal = rec.qty;
    } else {
      const todayRec = currentTomorrowTodayReceived[item.id];
      const todayRem = currentTomorrowTodayRemaining[item.id];
      const isProtein = isMealCategory(item.category) || (item.unit && (item.unit.includes("جرام") || item.unit.includes("جم")));
      if (isProtein && todayRem !== undefined) {
        const todayUsedGrams = (todayRec ? Number(todayRec) : 0) - (todayRem ? Number(todayRem) : 0);
        if (todayUsedGrams > 0) targetVal = Math.round(todayUsedGrams * 1.15);
      }
    }

    if (targetVal !== null) {
      if (!currentTomorrowOrder[item.id]) currentTomorrowOrder[item.id] = { qty: "", notes: "" };
      currentTomorrowOrder[item.id].qty = String(targetVal);
      const inp = document.getElementById("tominput-" + item.id);
      if (inp) inp.value = String(targetVal);
      appliedCount++;
    }
  });

  saveTomorrowNow(false);
  renderTomorrowView();
  showToast(`✨ تم تطبيق المقترحات على ${appliedCount} صنف بنجاح!`);
}

// ---- تصدير مباشر للمطبخ المركزي عبر واتساب ----
function exportTomorrowOrderWhatsApp() {
  const branchName = currentTomorrowBranch || Branch.get() || "الفرع الرئيسي";
  const empName = (Auth.getEmployee() || {}).name || "المدير";

  const allActiveItems = getAllTomorrowActiveItems();
  const orderedItems = allActiveItems
    .filter(it => currentTomorrowOrder[it.id] && currentTomorrowOrder[it.id].qty !== "" && Number(currentTomorrowOrder[it.id].qty) > 0)
    .map(it => ({
      name: it.name,
      category: it.category || "عام",
      unit: it.unit || "جرام",
      qty: currentTomorrowOrder[it.id].qty,
      notes: currentTomorrowOrder[it.id].notes || ""
    }));

  if (!orderedItems.length) {
    showToast("⚠️ لم تقم بتحديد أي كميات بعد في الطلبية!");
    return;
  }

  // تجميع حسب التصنيف
  const byCat = {};
  let totalProteinGrams = 0;
  orderedItems.forEach(it => {
    if (!byCat[it.category]) byCat[it.category] = [];
    byCat[it.category].push(it);
    if (isMealCategory(it.category) || it.unit.includes("جرام") || it.unit.includes("جم")) {
      totalProteinGrams += Number(it.qty || 0);
    }
  });

  let msg = `*📋 طلبية المطبخ المركزي - ${branchName}*\n`;
  msg += `📅 *تاريخ الاستلام:* ${currentTomorrowDate}\n`;
  msg += `👤 *المسؤول:* ${empName}\n`;
  if (totalProteinGrams > 0) {
    msg += `⚖️ *إجمالي البروتين:* ${Math.round(totalProteinGrams / 1000)} كجم (≈ ${mealsCount(totalProteinGrams)} وجبة)\n`;
  }
  msg += `--------------------------------\n`;

  Object.keys(byCat).forEach(cat => {
    msg += `*[${cat}]*\n`;
    byCat[cat].forEach(it => {
      msg += `• ${it.name}: *${it.qty}* ${it.unit}`;
      if (it.notes) msg += ` _(${it.notes})_`;
      msg += `\n`;
    });
    msg += `\n`;
  });

  msg += `--------------------------------\n`;
  msg += `✅ معتمدة آلياً عبر نظام Pro House التشغيلي`;

  // encodeURIComponent: الـ & و # بالملاحظات كانت تقص رسالة الواتساب
  const encoded = encodeURIComponent(msg);
  const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
  window.open(waUrl, "_blank");
}

function onTomorrowPanChange(id, unit) {
  if (!currentTomorrowOrder[id]) currentTomorrowOrder[id] = { qty: "", notes: "" };
  currentTomorrowOrder[id].unit = unit;
  scheduleTomorrowAutoSave();
}

function onTomorrowFieldChange(e) {
  const id = e.target.dataset.id;
  const field = e.target.dataset.field;
  if (!currentTomorrowOrder[id]) currentTomorrowOrder[id] = { qty: "", notes: "" };

  if (field === "qty" && e.target.value !== "" && Number(e.target.value) < 0) {
    e.target.value = "";
    showToast("الكمية ما تكون بالسالب");
  }

  currentTomorrowOrder[id][field] = e.target.value;
  if (field === "qty") updateTomorrowCatTotals();

  const card = document.getElementById("tomcard-" + id);
  if (card) {
    card.dataset.filled = String(isTomorrowItemFilled(id));
    const badge = card.querySelector(".rec-card-header .badge");
    if (badge) {
      const f = isTomorrowItemFilled(id);
      badge.className = "badge " + (f ? "ok" : "neutral");
      badge.textContent = f ? "✅ تم التحديد" : "لم يحدد";
    }
  }

  scheduleTomorrowAutoSave();
}

let tomorrowLoadSeq = 0;
// الحفظ بيستبدل طلبية اليوم كاملة (بيمسح اللي مو بالشاشة)، فإذا التحميل فشل (نت ضعيف)
// والشاشة فاضية، أول تعديل كان يمسح الطلبية المحفوظة كلها. هلأ منوقف الحفظ لحد ما تنجح القراءة.
let tomorrowLoadFailed = false;
async function loadTomorrowOrder(dateStr) {
  const seq = ++tomorrowLoadSeq; // تنقّل سريع بين الأيام/الفروع: نتيجة الطلب القديم ما تكتب فوق الجديد
  currentTomorrowBranch = Branch.get();
  const myBranches = allowedBranchList();
  if (myBranches.length === 1 && currentTomorrowBranch !== myBranches[0]) currentTomorrowBranch = myBranches[0];
  if (currentTomorrowBranch && !Auth.canSeeAllBranches() && !myBranches.includes(currentTomorrowBranch)) currentTomorrowBranch = myBranches[0] || "";
  Branch.set(currentTomorrowBranch);
  await Items.load();
  if (seq !== tomorrowLoadSeq) return;

  if (!currentTomorrowBranch) {
    currentTomorrowOrder = {};
    renderTomorrowView();
    const st = document.getElementById("tomorrowStatus");
    if (st) st.textContent = "اختر الفرع أولاً";
    return;
  }

  const view = document.getElementById("tomorrowView");
  if (view) view.innerHTML = '<div class="loader"><div class="spinner"></div> جاري تحميل بيانات اليوم واقتراحات المطبخ…</div>';
  loadChefNameMemory();
  currentTomorrowOrder = {};
  currentTomorrowAddedIds = new Set();
  // الأصناف المضافة/المشالة تخص طلبية يوم وفرع بعينه — كانت تنتقل لطلبية يوم أو فرع تاني
  currentTomorrowExtraItems = [];
  currentTomorrowRemovedIds = new Set();

  // جلب طلبية الغد المحفوظة
  const cacheKey = "tomorrow:" + dateStr + ":" + currentTomorrowBranch;
  const data = await Sync.get("getTomorrowOrder", { date: dateStr, branch: currentTomorrowBranch }, cacheKey);
  if (seq !== tomorrowLoadSeq) return;
  tomorrowLoadFailed = data === null || data === undefined;
  applyTomorrowData(data);

  // استلام ومتبقي اليوم اللي قبل الطلبية (مو دايماً "اليوم" — لو فتحت طلبية بعد بكرة أو يوم قديم)
  const today = addDaysStr(dateStr, -1);
  try {
    const [todayRec, todayRem, aiRec] = await Promise.all([
      Sync.get("getDay", { date: today, branch: currentTomorrowBranch }, "day:" + today + ":" + currentTomorrowBranch).catch(() => null),
      Sync.get("getRemainingReport", { date: today, branch: currentTomorrowBranch }, "remaining:" + today + ":" + currentTomorrowBranch).catch(() => null),
      ForecastEngine.getRecommendations(dateStr, currentTomorrowBranch).catch(() => ({}))
    ]);

    if (seq !== tomorrowLoadSeq) return;
    currentTomorrowTodayReceived = {};
    if (todayRec && todayRec.items) {
      todayRec.items.forEach(it => { currentTomorrowTodayReceived[it.itemId] = it.received; });
    }

    currentTomorrowTodayRemaining = {};
    if (todayRem && todayRem.items) {
      todayRem.items.forEach(it => { currentTomorrowTodayRemaining[it.itemId] = it.remainingWeight || it.remaining; });
    }

    if (seq !== tomorrowLoadSeq) return;
    currentTomorrowRecommendations = aiRec || {};
  } catch (e) {
    console.warn("تعذر جلب بيانات اليوم المقارنة:", e);
  }
  if (seq !== tomorrowLoadSeq) return;

  renderTomorrowView();
  const hasData = Object.keys(currentTomorrowOrder).length > 0;
  const st = document.getElementById("tomorrowStatus");
  if (st) {
    st.textContent = tomorrowLoadFailed ? "⚠ تعذّر تحميل الطلبية — تأكد من النت واسحب الشاشة لتحت للتحديث (الحفظ موقّف لحتى ما تنمسح الطلبية)"
      : hasData ? "تم تحميل طلبية محفوظة لهذا اليوم لهذا الفرع" : "ما فيه طلبية محفوظة لهذا اليوم لهذا الفرع للحين";
  }
}

function applyTomorrowData(list) {
  if (!list || !list.length) return;
  const map = {};
  list.forEach(it => { 
    map[it.itemId] = { qty: it.qty, notes: it.notes, cookName: it.cookName || "", unit: it.unit || "" };
    if (!Items.byId(it.itemId) && !currentTomorrowExtraItems.some(x => x.id === it.itemId)) {
      currentTomorrowExtraItems.push({
        id: it.itemId,
        name: it.itemName || it.name || it.itemId,
        unit: it.unit || "جرام",
        category: it.category || "عام",
        isCustom: true
      });
    }
  });
  currentTomorrowOrder = map;
}

function saveTomorrowNow(showStatus) {
  if (Auth.isViewOnlyTomorrow()) return;
  if (tomorrowLoadFailed) {
    const st = document.getElementById("tomorrowStatus");
    if (st) st.textContent = "⚠ ما انحفظ: الطلبية ما تحمّلت من السيرفر — تأكد من النت واسحب الشاشة لتحت للتحديث";
    showToast("⚠ ما انحفظ — الطلبية ما تحمّلت. حدّث الشاشة أول");
    return;
  }

  const employeeName = (Auth.getEmployee() || {}).name || "";
  const branch = currentTomorrowBranch || "";

  const allActiveItems = getAllTomorrowActiveItems();
  const items = allActiveItems
    .filter(it => {
      const o = currentTomorrowOrder[it.id];
      return o && (o.qty !== "" || (currentTomorrowAddedIds.has(it.id) || o.cookName));
    })
    .map(it => ({ 
      itemId: it.id, 
      itemName: it.name, 
      unit: isPanOrderBranch(branch) ? (currentTomorrowOrder[it.id].unit || itemPanSize(it) || it.unit || "") : (it.unit || "جرام"),
      category: it.category || "عام",
      isCustom: !!it.isCustom,
      qty: currentTomorrowOrder[it.id].qty, 
      notes: currentTomorrowOrder[it.id].notes || "",
      cookName: currentTomorrowOrder[it.id].cookName || ""
    }));

  const payload = { 
    date: currentTomorrowDate, 
    branch, 
    employeeName, 
    items, 
    removedItemIds: Array.from(currentTomorrowRemovedIds),
    notify: !!showStatus 
  };
  Sync.enqueue("saveTomorrowOrder:" + currentTomorrowDate + ":" + branch, "saveTomorrowOrder", payload);
  Sync.cacheSet("tomorrow:" + currentTomorrowDate + ":" + branch, items);

  const missing = [];
  if (!branch) missing.push("الفرع");
  const savedAtText = new Date().toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" });
  const st = document.getElementById("tomorrowStatus");
  if (st) {
    st.textContent = missing.length
      ? `✅ محفوظ (بدون ${missing.join(" و")} — كمّلهم أول ما تقدر) — ${savedAtText}`
      : "✅ محفوظ — جاري المزامنة " + savedAtText;
  }
  if (showStatus) showToast("تم حفظ طلبية الغد بنجاح!");
}

// يحفظ الطلبية ويستنى توصل للسيرفر، وبعدين يفتح تقرير الشيف (PDF) لنفس اليوم والفرع
async function goToChefReport() {
  if (!Auth.isViewOnlyTomorrow() && !tomorrowLoadFailed) {
    clearTimeout(tomorrowAutoSaveTimer);
    saveTomorrowNow(false);
    const key = "saveTomorrowOrder:" + currentTomorrowDate + ":" + (currentTomorrowBranch || "");
    for (let i = 0; i < 20 && Sync.getQueue().some(q => q.key === key); i++) {
      await Sync.flushQueue();
      await new Promise(r => setTimeout(r, 250));
    }
    if (Sync.getQueue().some(q => q.key === key)) showToast("⚠ الطلبية لسا ما وصلت للسيرفر — تأكد من النت قبل ما ترسل الـ PDF");
  }
  openChefReportFor(currentTomorrowDate, currentTomorrowBranch);
}

let tomorrowAutoSaveTimer = null;
function scheduleTomorrowAutoSave() {
  const st = document.getElementById("tomorrowStatus");
  if (st) st.textContent = "جاري الحفظ...";
  clearTimeout(tomorrowAutoSaveTimer);
  tomorrowAutoSaveTimer = setTimeout(() => saveTomorrowNow(false), 800);
}

function initTomorrowTab() {
  const dateInput = document.getElementById("tomorrowDateInput");
  if (dateInput) {
    dateInput.value = currentTomorrowDate;
    dateInput.addEventListener("change", (e) => {
      currentTomorrowDate = e.target.value;
      loadTomorrowOrder(currentTomorrowDate);
    });
  }

  const saveBtn = document.getElementById("tomorrowSaveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => saveTomorrowNow(true));
  }

  loadTomorrowOrder(currentTomorrowDate);
}


// ---- وظائف إزالة وإضافة الأصناف في طلبية الغد ----

async function onRemoveTomorrowItem(itemId, itemName) {
  if (Auth.isViewOnlyTomorrow()) return;
  const confirmed = await phConfirm(`هل أنت متأكد من استبعاد الصنف "${itemName || ''}" من طلبية الغد؟`, { ok: "شيله", danger: true });
  if (!confirmed) return;

  if (isOptionalItem(Items.byId(itemId))) currentTomorrowAddedIds.delete(itemId);
  else currentTomorrowRemovedIds.add(itemId);
  currentTomorrowExtraItems = currentTomorrowExtraItems.filter(it => it.id !== itemId);
  delete currentTomorrowOrder[itemId];

  showToast(`🗑️ تم استبعاد الصنف من طلبية الغد`);
  renderTomorrowView();
  saveTomorrowNow(false);
}

function openAddTomorrowItemModal(category) {
  if (Auth.isViewOnlyTomorrow()) return;
  const existingModal = document.getElementById("customTomorrowModal");
  if (existingModal) existingModal.remove();

  const modalHtml = `
    <div class="custom-rec-modal-backdrop" id="customTomorrowModal" onclick="if(event.target===this) closeAddTomorrowItemModal()">
      <div class="custom-rec-modal-box">
        <div class="custom-rec-modal-header">
          <h3>➕ إضافة صنف لطلبية قسم (${category})</h3>
          <button type="button" class="custom-rec-modal-close" onclick="closeAddTomorrowItemModal()">✕</button>
        </div>
        <div class="custom-rec-modal-body">
          <div class="custom-rec-field-group">
            <label>اسم الصنف المطلوب من المطبخ *</label>
            <input type="text" id="customTomItemName" placeholder="مثال: صوص باربكيو مدخن، خبز بريوش إضافي..." autofocus>
          </div>
          <div class="custom-rec-field-group">
            <label>وحدة القياس</label>
            <select id="customTomItemUnit">
              <option value="جرام" selected>جرام (جم)</option>
              <option value="كجم">كيلو جرام (كجم)</option>
              <option value="حبة">حبة</option>
              <option value="علبة">علبة</option>
              <option value="لتر">لتر</option>
            </select>
          </div>
          <div class="custom-rec-field-group">
            <label>الكمية المطلوبة للغد *</label>
            <input type="number" step="any" min="0" inputmode="decimal" id="customTomItemQty" placeholder="0">
          </div>
          <div class="custom-rec-field-group">
            <label>ملاحظة للمطبخ المركزي (اختياري)</label>
            <input type="text" id="customTomItemNotes" placeholder="مثال: توصيل مع الدفعة الأولى...">
          </div>
          <div class="custom-rec-modal-actions">
            <button type="button" class="btn-save" onclick="confirmAddTomorrowItem('${String(category).replace(/'/g, "\\'")}')">✅ إضافة للطلبية</button>
            <button type="button" class="btn-cancel" onclick="closeAddTomorrowItemModal()">إلغاء</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  setTimeout(() => {
    const input = document.getElementById("customTomItemName");
    if (input) input.focus();
  }, 100);
}

function closeAddTomorrowItemModal() {
  const modal = document.getElementById("customTomorrowModal");
  if (modal) modal.remove();
}

function confirmAddTomorrowItem(category) {
  const nameInput = document.getElementById("customTomItemName");
  const unitInput = document.getElementById("customTomItemUnit");
  const qtyInput = document.getElementById("customTomItemQty");
  const notesInput = document.getElementById("customTomItemNotes");

  const name = (nameInput?.value || "").trim();
  const unit = unitInput?.value || "جرام";
  const qty = (qtyInput?.value || "").trim();
  const notes = (notesInput?.value || "").trim();

  if (!name) {
    phAlert("يرجى كتابة اسم الصنف أولاً!");
    if (nameInput) nameInput.focus();
    return;
  }

  // نفس الاسم موجود (حتى لو بمسافات أو همزة مختلفة): نستخدمه بدل ما نعمل صنف مكرر
  const norm = (v) => String(v || "").replace(/[إأآ]/g, "ا").replace(/ة$/, "ه").replace(/\s+/g, "").trim();
  const branchNow = currentTomorrowBranch || Branch.get();
  const existing = (Items.current || []).find(it => norm(it.name) === norm(name) &&
    (!itemBranches(it).length || itemBranches(it).includes(branchNow)));
  if (existing) {
    currentTomorrowRemovedIds.delete(existing.id);
    currentTomorrowAddedIds.add(existing.id);
    currentTomorrowOrder[existing.id] = { ...(currentTomorrowOrder[existing.id] || {}), qty: qty !== "" ? String(qty) : "", notes: notes || (currentTomorrowOrder[existing.id] || {}).notes || "" };
    closeAddTomorrowItemModal();
    showToast(`✅ "${existing.name}" موجود — انضاف للطلبية`);
    renderTomorrowView();
    saveTomorrowNow(false);
    focusEntryById("tominput-" + existing.id);
    return;
  }

  const newCustomId = "custom_tom_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  const newItem = {
    id: newCustomId,
    name: name,
    unit: unit,
    category: category,
    branches: currentTomorrowBranch || Branch.get(),
    isCustom: true
  };

  currentTomorrowExtraItems.push(newItem);
  currentTomorrowOrder[newCustomId] = {
    qty: qty !== "" ? String(qty) : "",
    notes: notes || "صنف إضافي لطلبية الغد"
  };

  try {
    Items.save({
      id: newCustomId,
      name: name,
      unit: unit,
      category: category,
      branches: currentTomorrowBranch || Branch.get(),
      // اختياري: يطلع بس باليوم اللي انطلب فيه — ما يصير صنف ثابت كل يوم
      optional: true,
      isCustom: true
    });
  } catch (err) {
    console.warn("تعذر حفظ الصنف المشترك:", err);
  }

  closeAddTomorrowItemModal();
  showToast(`✅ تم إضافة صنف "${name}" إلى طلبية قسم ${category}`);
  renderTomorrowView();
  saveTomorrowNow(false);
}

let tomorrowNotesExpanded = {};
function toggleTomorrowNote(itemId) {
  tomorrowNotesExpanded[itemId] = !tomorrowNotesExpanded[itemId];
  const drawer = document.getElementById("tomnote-drawer-" + itemId);
  if (drawer) {
    drawer.classList.toggle("hidden", !tomorrowNotesExpanded[itemId]);
    drawer.classList.toggle("expanded", !!tomorrowNotesExpanded[itemId]);
    if (tomorrowNotesExpanded[itemId]) {
      const inp = drawer.querySelector("input");
      if (inp) inp.focus();
    }
  }
}


// ---- متوسط استهلاك نفس اليوم من الأسبوع (دجاج / لحم / بحري بالجرام) ----
// من مبيعات تابسنس (عدد الأطباق × وزن الوجبة)، ومعه الاستهلاك الفعلي (المستلم − المتبقي) للأيام اللي انجرد فيها
const WD_CATS = [["دجاج", "🍗"], ["لحم", "🥩"], ["بحري", "🐟"]];
const WD_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const wdCache = {};
const wdAvgByKey = {};
const wdActualByKey = {}; // متوسط الفعلي (المستلم − المتبقي) لكل تصنيف، وإذا ما فيه جرد: متوسط المبيعات

// ---- إجمالي المطلوب مقابل المتوسط الفعلي على شريط كل تصنيف (دجاج / لحم / بحري) ----
function tomOrderedGrams(category) {
  return getAllTomorrowActiveItems().filter(it => it.category === category).reduce((sum, it) => {
    const q = Number((currentTomorrowOrder[it.id] || {}).qty || 0);
    const u = String(it.unit || "جرام");
    if (!q) return sum;
    if (/كجم|كيلو/.test(u)) return sum + q * 1000;
    return /جرام|جم/.test(u) ? sum + q : sum;
  }, 0);
}
function tomCatTotalInner(category) {
  const avg = (wdActualByKey[currentTomorrowDate + "|" + currentTomorrowBranch] || {})[category];
  const ordered = tomOrderedGrams(category);
  const fmt = (g) => Math.round(g).toLocaleString("en-US");
  if (avg == null) return { cls: "", html: `المطلوب: <b>${fmt(ordered)}</b> جم` };
  const diff = avg.grams ? (ordered - avg.grams) / avg.grams : 0;
  const cls = !ordered ? "" : Math.abs(diff) <= 0.1 ? "ok" : diff > 0 ? "over" : "under";
  const sign = !ordered || Math.abs(diff) < 0.005 ? "" : ` · ${diff > 0 ? "أكثر" : "أقل"} ${Math.round(Math.abs(diff) * 100)}%`;
  return { cls, html: `المطلوب: <b>${fmt(ordered)}</b> · ${avg.actual ? "الفعلي" : "المتوسط"}: <b>${fmt(avg.grams)}</b> جم${sign}` };
}
function tomCatTotalHtml(category) {
  if (!WD_CATS.some(([c]) => c === category)) return "";
  const t = tomCatTotalInner(category);
  return `<span class="tom-cat-total ${t.cls}" data-cat="${category}">${t.html}</span>`;
}
function updateTomorrowCatTotals() {
  document.querySelectorAll("#tomorrowView .tom-cat-total").forEach(el => {
    const t = tomCatTotalInner(el.dataset.cat);
    el.className = "tom-cat-total " + t.cls;
    el.innerHTML = t.html;
  });
}
function weekdayAvgGrams(date, branch) { return wdAvgByKey[date + "|" + branch] || null; }

function weekdayAverageDates(date) {
  // أيام نفس اليوم من الأسبوع بهالشهر قبل تاريخ الطلبية، وإذا أقل من يومين منكمّل من الأسابيع اللي قبل (لحد 4)
  const out = [];
  let d = addDaysStr(date, -7);
  const month = date.slice(0, 7);
  while (d.slice(0, 7) === month) { out.push(d); d = addDaysStr(d, -7); }
  while (out.length < 2 && out.length < 4) { out.push(d); d = addDaysStr(d, -7); }
  return out;
}

async function renderWeekdayAverage(el, date, branch) {
  if (!date || !branch || typeof SupaEngine === "undefined") return;
  const wd = new Date(date + "T12:00:00Z").getUTCDay();
  const dates = weekdayAverageDates(date);
  el.innerHTML = `<div class="wd-avg-title">📊 متوسط استهلاك أيام ${WD_NAMES[wd]}</div><div class="wd-avg-sub">جاري الحساب…</div>`;
  const key = date + "|" + branch;
  try {
    // الكاش ١٠ دقايق بس: بعد ما تنسحب مبيعات جديدة (فوديكس/تاب سنس) المتوسط يتحدّث بدون إعادة فتح التطبيق
    if (wdCache[key] && Date.now() - wdCache[key]._at > 10 * 60000) delete wdCache[key];
    const data = wdCache[key] || (wdCache[key] = await (async () => {
      const sorted = [...dates].sort();
      const mto = madeToOrderApplies(branch) && SupaEngine.getProductSales;
      const [sales, days, products] = await Promise.all([
        SupaEngine.getSalesByCategory(sorted[0], sorted[sorted.length - 1], branch),
        Promise.all(dates.map(dt => SupaEngine.getDay(dt, branch).catch(() => null))),
        mto ? SupaEngine.getProductSales(sorted[0], sorted[sorted.length - 1], branch).catch(() => []) : Promise.resolve([])
      ]);
      return { sales, days, products, _at: Date.now() };
    })());
    const catOf = {};
    (Items.current || []).forEach(it => { catOf[it.id] = it.category; });

    const soldDays = dates.filter(dt => data.sales.some(r => r.date === dt && Number(r.qty) > 0));
    const actualDays = [];
    const rows = WD_CATS.map(([cat, icon]) => {
      const sold = soldDays.reduce((sum, dt) => sum + data.sales.filter(r => r.date === dt && r.category === cat).reduce((a, r) => a + Number(r.qty || 0), 0), 0);
      // نشيل مبيعات الأصناف اللي تنعمل حسب الطلب من قسمها
      const mtoSold = soldDays.reduce((sum, dt) => sum + (data.products || []).filter(p => p.date === dt && isMadeToOrderName(p.product) && madeToOrderSection(p.product) === cat).reduce((a, p) => a + p.qty, 0), 0);
      const dishes = Math.max(0, sold - mtoSold);
      const avgDishes = soldDays.length ? dishes / soldDays.length : 0;
      // الفعلي: بس الأيام اللي انسجل فيها متبقي لهالتصنيف
      let used = 0, n = 0;
      data.days.forEach((day, i) => {
        const items = ((day && day.items) || []).filter(x => catOf[x.itemId] === cat);
        const counted = items.some(x => x.remainingWeight != null || x.remaining != null);
        if (!counted) return;
        const rec = items.reduce((a, x) => a + Number(x.received || 0), 0);
        const rem = items.reduce((a, x) => a + Number(x.remainingWeight ?? x.remaining ?? 0), 0);
        used += Math.max(0, rec - rem); n++;
        if (!actualDays.includes(dates[i])) actualDays.push(dates[i]);
      });
      return { cat, icon, grams: Math.round(avgDishes * MEAL_WEIGHT_G), dishes: avgDishes, actual: n ? Math.round(used / n) : null };
    });
    const firstTime = !wdAvgByKey[key];
    wdAvgByKey[key] = Object.fromEntries(rows.map(r => [r.cat, r.grams]));
    wdActualByKey[key] = Object.fromEntries(rows.filter(r => r.actual != null || r.grams).map(r => [r.cat, r.actual != null ? { grams: r.actual, actual: true } : { grams: r.grams, actual: false }]));
    updateTomorrowCatTotals();
    if (firstTime && document.querySelector('.tomorrow-item-card[data-slot="1"]')) { renderTomorrowView(); return; }
    const fmt = (g) => g.toLocaleString("en-US");
    const dayList = (list) => list.slice().sort().map(dt => Number(dt.slice(8))).join("، ");
    if (!soldDays.length) {
      el.innerHTML = `<div class="wd-avg-title">📊 متوسط استهلاك أيام ${WD_NAMES[wd]}</div><div class="wd-avg-sub">ما فيه مبيعات مسحوبة من ${salesSourceName(branch)} لأيام ${WD_NAMES[wd]} اللي قبل.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="wd-avg-title">📊 متوسط استهلاك أيام ${WD_NAMES[wd]}</div>
      <div class="wd-avg-sub">من مبيعات ${salesSourceName(branch)} لأيام: ${dayList(soldDays)} · الطبق = ${MEAL_WEIGHT_G} جم (والإضافة 50 جم = ثلث طبق)${madeToOrderApplies(branch) ? " · بدون أصناف «حسب الطلب» (ستيك، سالمون، فيليه، بلانكو)" : ""}</div>
      <div class="wd-avg-grid">
        ${rows.map(r => `
          <div class="wd-avg-cell">
            <span class="wd-avg-cat">${r.icon} ${r.cat}</span>
            <b class="wd-avg-num">${fmt(r.grams)} <small>جم</small></b>
            <span class="wd-avg-dishes">${r.dishes.toFixed(1).replace(/\.0$/, "")} طبق</span>
            ${r.actual != null ? `<span class="wd-avg-actual">فعلي: ${fmt(r.actual)} جم</span>` : ""}
          </div>`).join("")}
      </div>
      ${actualDays.length ? `<div class="wd-avg-note">«فعلي» = المستلم − المتبقي بأيام: ${dayList(actualDays)}</div>` : ""}`;
  } catch (e) {
    el.innerHTML = `<div class="wd-avg-title">📊 متوسط الاستهلاك</div><div class="wd-avg-sub">⚠ تعذّر الحساب — ${e.message || e}</div>`;
  }
}


function chefSlotSuggestion(category, groupItems) {
  const avg = (typeof weekdayAvgGrams === "function") ? weekdayAvgGrams(currentTomorrowDate, currentTomorrowBranch) : null;
  if (!avg || !avg[category]) return null;
  let fixedPlanned = 0;
  let slotCount = 0;
  groupItems.forEach(it => {
    const def = Items.byId(it.id) || it;
    if (isChefSlot(def)) { slotCount++; return; }
    if (madeToOrderApplies(currentTomorrowBranch) && isMadeToOrderName(def.name)) return;
    const o = currentTomorrowOrder[it.id];
    if (o && o.qty !== "" && o.qty != null) fixedPlanned += Number(o.qty) || 0;
    else {
      const r = currentTomorrowRecommendations[it.id];
      if (r && r.qty) fixedPlanned += Number(r.qty) || 0;
    }
  });
  if (!slotCount) return null;
  const left = Math.max(0, avg[category] - fixedPlanned);
  const qty = Math.round(left / slotCount / 50) * 50;
  return { qty, reason: `باقي متوسط ${category} (${avg[category].toLocaleString("en-US")} جم) بعد الثابت ÷ ${slotCount}` };
}

function openChefSlotPicker(category) {
  if (Auth.isViewOnlyTomorrow()) return;
  openChefPicker({
    category,
    branch: currentTomorrowBranch || Branch.get(),
    isUsed: (id) => currentTomorrowAddedIds.has(id) || !!currentTomorrowOrder[id] || currentTomorrowRemovedIds.has(id),
    extraNames: Object.values(currentTomorrowOrder).map(o => o && o.cookName),
    onPick(slot, name) {
      currentTomorrowAddedIds.add(slot.id);
      currentTomorrowOrder[slot.id] = { qty: "", notes: "", cookName: name };
      tomorrowCategoryCollapsed[category] = false;
      renderTomorrowView();
      saveTomorrowNow(false);
      focusEntryById("tominput-" + slot.id);
    }
  });
}


function onTomorrowCookNameChange(itemId, value) {
  const def = Items.byId(itemId);
  if (!def || Auth.isViewOnlyTomorrow()) return;
  const full = normalizeCookName(def.category, value);
  if (!currentTomorrowOrder[itemId]) currentTomorrowOrder[itemId] = { qty: "", notes: "", cookName: "" };
  currentTomorrowOrder[itemId].cookName = full;
  rememberCookName(def.category, full);
  const title = document.querySelector(`#tomcard-${itemId} .rec-item-name`);
  if (title) title.textContent = chefSlotName(def, full);
  scheduleTomorrowAutoSave();
}
