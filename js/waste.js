// ==================== وحدة تتبع الهدر والاقطاع والفاقد (Waste & Loss Tracking Module) ====================

const WASTE_REASONS = [
  "تالف / منتهي",
  "وجبة موظف",
  "غلط بالطلب",
  "غيره"
];

let currentWasteBranch = "";
let currentWasteDate = todayStr();
let isWasteSaving = false;

function initWasteModule() {
  currentWasteBranch = Branch.get() || allowedBranchList()[0] || "";
  currentWasteDate = todayStr();
}

async function loadWasteData(date, branch) {
  currentWasteDate = date || currentWasteDate;
  currentWasteBranch = branch || Branch.get() || allowedBranchList()[0] || "";

  const view = document.getElementById("wasteView");
  if (view) view.innerHTML = '<div class="loader">جاري تحميل تقارير وتوثيق الهدر والفاقد…</div>';

  const data = await Sync.get("getWasteReport", { date: currentWasteDate, branch: currentWasteBranch }, "waste:" + currentWasteDate + ":" + currentWasteBranch);
  const wasteRecords = (data && data.items) || [];

  renderWasteView(wasteRecords);
}

function renderWasteView(wasteRecords) {
  const view = document.getElementById("wasteView");
  if (!view) return;

  const branchList = allowedBranchList();
  const items = Items.current;

  // حساب الإحصائيات الإجمالية للهدر
  let totalWasteSum = 0;
  const reasonCountMap = {};

  wasteRecords.forEach(r => {
    const qty = Number(r.qty || 0);
    totalWasteSum += qty;
    reasonCountMap[r.reason] = (reasonCountMap[r.reason] || 0) + qty;
  });

  let topReason = "—";
  let maxQty = 0;
  Object.keys(reasonCountMap).forEach(k => {
    if (reasonCountMap[k] > maxQty) { maxQty = reasonCountMap[k]; topReason = k; }
  });

  let html = `
    <div class="waste-header-panel">
      <div class="waste-title-row">
        <div>
          <h2>⚠️ تقرير وتوثيق الهدر والاقطاع اليومي</h2>
          <div class="sub-text">تسجيل وتصنيف الفاقد لمنع الهدر التشغيلي وضبط التكاليف</div>
        </div>
        <div class="branch-selector-wrap">
          <select id="wasteBranchSelect" onchange="onWasteBranchChange(this.value)">
            ${branchOptionsHtml(currentWasteBranch)}
          </select>
        </div>
      </div>

      <div class="waste-kpi-grid">
        <div class="kpi-card danger">
          <div class="kpi-v">${wasteRecords.length}</div>
          <div class="kpi-l">عدد عمليات الهدر المسجلة</div>
        </div>
        <div class="kpi-card warn">
          <div class="kpi-v">${Math.round(totalWasteSum)} جم</div>
          <div class="kpi-l">إجمالي الهدر والفاقد</div>
        </div>
        <div class="kpi-card neutral">
          <div class="kpi-v">${topReason}</div>
          <div class="kpi-l">أعلى سبب للهدر هذا اليوم</div>
        </div>
      </div>
    </div>

    <!-- نموذج إدخال عملية هدر جديدة -->
    <div class="waste-form-card">
      <h3>➕ تسجيل عملية هدر جديدة</h3>
      <div class="inputs-row" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">
        <div class="field">
          <label>الصنف *</label>
          <select id="wasteItemSelect">
            <option value="">اختر الصنف</option>
            ${items.map(it => `<option value="${it.id}">${it.name} (${it.unit || 'جرام'})</option>`).join("")}
          </select>
        </div>

        <div class="field">
          <label>الكمية المهدورة *</label>
          <input type="number" step="any" min="0.1" id="wasteQtyInput" placeholder="0">
        </div>

        <div class="field">
          <label>سبب الهدر *</label>
          <select id="wasteReasonSelect">
            ${WASTE_REASONS.map(r => `<option value="${r}">${r}</option>`).join("")}
          </select>
        </div>

        <div class="field" style="grid-column: span 2;">
          <label>ملاحظات إضافية</label>
          <input type="text" id="wasteNotesInput" placeholder="تفاصيل أو ملاحظة إضافية...">
        </div>

        <div class="field" style="display:flex;align-items:flex-end;">
          <button class="btn gold" onclick="addWasteRecordSubmit()" style="width:100%;">➕ إضافة الهدر</button>
        </div>
      </div>
    </div>

    <!-- جدول العمليات المسجلة -->
    <div class="waste-records-card">
      <h3>📋 سجل عمليات الهدر المسجلة لليوم</h3>
      ${wasteRecords.length === 0 ? `
        <div class="empty-state">لا توجد عمليات هدر مسجلة لليوم لهذا الفرع.</div>
      ` : `
        <div class="order-table-wrap">
          <table class="order-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الكمية المهدورة</th>
                <th>سبب الهدر</th>
                <th>الملاحظات</th>
                <th>الوقت والموظف</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${wasteRecords.map((r, idx) => `
                <tr>
                  <td><strong>${r.itemName}</strong></td>
                  <td><span class="text-red"><strong>${r.qty} ${r.unit || 'جرام'}</strong></span></td>
                  <td><span class="badge warn">${r.reason}</span></td>
                  <td>${r.notes || '—'}</td>
                  <td>${new Date(r.timestamp || Date.now()).toLocaleTimeString(phLocale(), { hour: '2-digit', minute: '2-digit' })} (${r.employeeName || 'الموظف'})</td>
                  <td>
                    <button class="btn danger" style="padding:4px 8px;font-size:11px;" onclick="deleteWasteRecord(${idx})">حذف</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  view.innerHTML = html;
}

function onWasteBranchChange(branch) {
  Branch.set(branch);
  currentWasteBranch = branch;
  loadWasteData(currentWasteDate, currentWasteBranch);
}

async function addWasteRecordSubmit() {
  const itemId = document.getElementById("wasteItemSelect").value;
  const qty = document.getElementById("wasteQtyInput").value;
  const reason = document.getElementById("wasteReasonSelect").value;
  const notes = document.getElementById("wasteNotesInput").value;

  if (!itemId || !qty || Number(qty) <= 0) {
    showToast("⚠️ يرجى اختيار الصنف وإدخال كمية مهدورة صحيحة");
    return;
  }

  const it = Items.byId(itemId);
  const emp = Auth.getEmployee();

  const recordObj = {
    id: "WST-" + Date.now(),
    itemId: itemId,
    itemName: it ? it.name : "صنف",
    unit: it ? it.unit : "جرام",
    qty: Number(qty),
    reason: reason,
    notes: notes,
    branch: currentWasteBranch,
    date: currentWasteDate,
    employeeName: emp ? emp.name : "موظف الفرع",
    timestamp: new Date().toISOString()
  };

  const data = await Sync.get("getWasteReport", { date: currentWasteDate, branch: currentWasteBranch }, "waste:" + currentWasteDate + ":" + currentWasteBranch);
  const wasteRecords = (data && data.items) || [];
  wasteRecords.push(recordObj);

  const payload = {
    date: currentWasteDate,
    branch: currentWasteBranch,
    items: wasteRecords
  };

  Sync.cacheSet("waste:" + currentWasteDate + ":" + currentWasteBranch, payload);
  Sync.enqueue("saveWasteReport:" + currentWasteDate + ":" + currentWasteBranch, "saveWasteReport", payload);

  showToast("✓ تم إضافة عملية الهدر بنجاح!");
  renderWasteView(wasteRecords);
}

async function deleteWasteRecord(index) {
  const data = await Sync.get("getWasteReport", { date: currentWasteDate, branch: currentWasteBranch }, "waste:" + currentWasteDate + ":" + currentWasteBranch);
  const wasteRecords = (data && data.items) || [];
  wasteRecords.splice(index, 1);

  const payload = {
    date: currentWasteDate,
    branch: currentWasteBranch,
    items: wasteRecords
  };

  Sync.cacheSet("waste:" + currentWasteDate + ":" + currentWasteBranch, payload);
  Sync.enqueue("saveWasteReport:" + currentWasteDate + ":" + currentWasteBranch, "saveWasteReport", payload);

  showToast("تم حذف سجل الهدر!");
  renderWasteView(wasteRecords);
}
