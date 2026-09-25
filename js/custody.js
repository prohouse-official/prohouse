// ==================== إغلاق العهدة (مرة باليوم لكل فرع) ====================
// الموظف بيسجّل: العهدة أول اليوم، الكاش الموجود، مجموع مكينة الشبكة، والمصاريف من الكاش.
// المالك بس بيشوف المطابقة مع مبيعات تابسنس (المتوقع بالدرج والفرق) — الموظف ما بيشوف أي رقم مبيعات.

const CASH_CHANNEL = /^cash$|نقد|كاش/i;
const CARD_CHANNEL = /mada|visa|master|american|amex|mobicash|مدى|فيزا|ماستر/i;

let currentCustodyDate = todayStr();
let currentCustodyBranch = "";
let currentCustody = null;

const Custody = {
  async get(date, branch) {
    if (typeof SupaEngine === "undefined") return null;
    return await SupaEngine.getCustody(date, branch);
  },
  async statusFor(date, branch) {
    try {
      const row = await this.get(date, branch);
      return { closed: !!(row && row.closed_at) };
    } catch (e) {
      return null;
    }
  }
};

const numOrBlank = (v) => (v === null || v === undefined ? "" : String(v));
const toNum = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const sar = (n) => `${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

function custodyExpensesTotal(expenses) {
  return (expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

// المطابقة للمالك: المتوقع بالدرج = العهدة + مبيعات الكاش − المصاريف
function custodyReconciliation(c, payments) {
  const cashSales = payments.filter(p => CASH_CHANNEL.test(p.channel)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const cardSales = payments.filter(p => CARD_CHANNEL.test(p.channel)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const expenses = custodyExpensesTotal(c.expenses);
  const expectedCash = (toNum(c.opening_float) || 0) + cashSales - expenses;
  return {
    cashSales, cardSales, expenses, expectedCash,
    cashDiff: toNum(c.cash_counted) === null ? null : toNum(c.cash_counted) - expectedCash,
    cardDiff: toNum(c.card_total) === null ? null : toNum(c.card_total) - cardSales
  };
}

function diffPillHtml(diff) {
  if (diff === null) return `<span class="cust-diff neutral">باقي ما تعبّى</span>`;
  if (Math.abs(diff) < 1) return `<span class="cust-diff ok">✓ مطابق</span>`;
  return diff < 0
    ? `<span class="cust-diff short">عجز ${sar(Math.abs(diff))}</span>`
    : `<span class="cust-diff over">زيادة ${sar(diff)}</span>`;
}

async function loadCustody(date, branch) {
  currentCustodyDate = date || currentCustodyDate;
  currentCustodyBranch = branch || Branch.get() || allowedBranchList()[0] || "";
  const view = document.getElementById("custodyView");
  view.innerHTML = '<div class="loader">جاري التحميل…</div>';
  let row = null;
  let payments = [];
  try {
    [row, payments] = await Promise.all([
      Custody.get(currentCustodyDate, currentCustodyBranch),
      Auth.canSeeSales() ? SupaEngine.getPayments(currentCustodyDate, currentCustodyBranch) : Promise.resolve([])
    ]);
  } catch (e) {
    view.innerHTML = `<div class="empty-state">⚠ تعذّر جلب العهدة — ${e.message || e}</div>`;
    return;
  }
  currentCustody = row || { date: currentCustodyDate, branch: currentCustodyBranch, opening_float: null, cash_counted: null, card_total: null, expenses: [], notes: "" };
  if (!Array.isArray(currentCustody.expenses)) currentCustody.expenses = [];
  renderCustodyView(payments || []);
}

function renderCustodyView(payments) {
  const c = currentCustody;
  const view = document.getElementById("custodyView");
  const closed = !!c.closed_at;
  const closedAt = closed ? new Date(c.closed_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "";
  const branches = allowedBranchList();

  view.innerHTML = `
    <div class="cust-card">
      <div class="cust-head">
        <div>
          <h2 class="cust-title">💰 إغلاق العهدة</h2>
          <div class="cust-sub">${currentCustodyDate}${branches.length > 1 ? "" : " · " + currentCustodyBranch}</div>
        </div>
        ${closed ? `<span class="cust-state done">✅ تقفّلت ${closedAt}${c.closed_by ? " · " + c.closed_by : ""}</span>` : `<span class="cust-state">باقي ما تقفّلت</span>`}
      </div>
      ${branches.length > 1 ? `<select class="cust-branch" id="custodyBranchSelect">${branchOptionsHtml(currentCustodyBranch)}</select>` : ""}

      <label class="cust-field">
        <span class="cust-label"><b>1</b> العهدة أول اليوم (الفكة بالدرج)</span>
        <input type="number" inputmode="decimal" step="any" min="0" placeholder="—" data-field="opening_float" value="${numOrBlank(c.opening_float)}">
      </label>
      <label class="cust-field">
        <span class="cust-label"><b>2</b> الكاش الموجود بالدرج الحين</span>
        <input type="number" inputmode="decimal" step="any" min="0" placeholder="—" data-field="cash_counted" value="${numOrBlank(c.cash_counted)}">
      </label>
      <label class="cust-field">
        <span class="cust-label"><b>3</b> مجموع مكينة الشبكة (مدى)</span>
        <input type="number" inputmode="decimal" step="any" min="0" placeholder="—" data-field="card_total" value="${numOrBlank(c.card_total)}">
      </label>

      <div class="cust-field">
        <span class="cust-label"><b>4</b> مصاريف انصرفت من الكاش</span>
        <div id="custodyExpenses">
          ${c.expenses.map((e, i) => `
            <div class="cust-expense">
              <input type="number" inputmode="decimal" step="any" min="0" placeholder="المبلغ" data-exp="${i}" data-key="amount" value="${numOrBlank(e.amount)}">
              <input type="text" placeholder="على إيش؟ (مثلاً: ثلج)" data-exp="${i}" data-key="note" value="${String(e.note || "").replace(/"/g, "&quot;")}">
              <button type="button" class="cust-exp-del" data-del="${i}" aria-label="حذف">✕</button>
            </div>`).join("")}
        </div>
        <button type="button" class="cust-add" id="custodyAddExpense">➕ أضف مصروف</button>
        ${c.expenses.length ? `<div class="cust-total">مجموع المصاريف: <b>${sar(custodyExpensesTotal(c.expenses))}</b></div>` : ""}
      </div>

      <label class="cust-field">
        <span class="cust-label">ملاحظات (اختياري)</span>
        <input type="text" data-field="notes" placeholder="أي شي لازم تعرفه الإدارة" value="${String(c.notes || "").replace(/"/g, "&quot;")}">
      </label>

      <button type="button" class="cust-close-btn" id="custodyCloseBtn">${closed ? "💾 حفظ التعديل" : "🔒 إغلاق العهدة"}</button>
    </div>
    ${Auth.canSeeSales() ? custodyOwnerCardHtml(c, payments) : ""}
    ${Auth.isOwner() ? '<div id="custodyMonthCard" class="cust-owner"><div class="cust-owner-title">📅 ملخص الشهر</div><div class="cust-missing">جاري التحميل…</div></div>' : ""}
  `;
  if (Auth.isOwner()) renderCustodyMonth();

  view.querySelectorAll("[data-field]").forEach(inp => inp.addEventListener("input", () => {
    currentCustody[inp.dataset.field] = inp.dataset.field === "notes" ? inp.value : toNum(inp.value);
  }));
  view.querySelectorAll("[data-exp]").forEach(inp => inp.addEventListener("input", () => {
    const e = currentCustody.expenses[Number(inp.dataset.exp)];
    e[inp.dataset.key] = inp.dataset.key === "amount" ? toNum(inp.value) : inp.value;
  }));
  view.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", () => {
    currentCustody.expenses.splice(Number(btn.dataset.del), 1);
    renderCustodyView(payments);
  }));
  document.getElementById("custodyAddExpense").addEventListener("click", () => {
    currentCustody.expenses.push({ amount: null, note: "" });
    renderCustodyView(payments);
    const inputs = view.querySelectorAll('[data-key="amount"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  const branchSelect = document.getElementById("custodyBranchSelect");
  if (branchSelect) branchSelect.addEventListener("change", () => {
    Branch.set(branchSelect.value);
    loadCustody(currentCustodyDate, branchSelect.value);
  });
  document.getElementById("custodyCloseBtn").addEventListener("click", () => saveCustody(payments));
}

function custodyOwnerCardHtml(c, payments) {
  if (!payments.length) {
    return `<div class="cust-owner"><div class="cust-owner-title">🔎 المطابقة مع تابسنس (لك بس)</div>
      <div class="cust-missing">مبيعات تابسنس لهاليوم باقي ما انسحبت — المطابقة بتطلع لحالها بعد السحب.</div></div>`;
  }
  const r = custodyReconciliation(c, payments);
  return `
    <div class="cust-owner">
      <div class="cust-owner-title">🔎 المطابقة مع تابسنس (لك بس)</div>
      <div class="cust-row"><span>مبيعات الكاش</span><b>${sar(r.cashSales)}</b></div>
      <div class="cust-row"><span>المتوقع بالدرج (العهدة + الكاش − المصاريف)</span><b>${sar(r.expectedCash)}</b></div>
      <div class="cust-row"><span>الكاش الموجود</span><b>${toNum(c.cash_counted) === null ? "—" : sar(c.cash_counted)}</b></div>
      <div class="cust-row main"><span>فرق الكاش</span>${diffPillHtml(r.cashDiff)}</div>
      <div class="cust-sep"></div>
      <div class="cust-row"><span>مبيعات الشبكة (مدى وغيرها)</span><b>${sar(r.cardSales)}</b></div>
      <div class="cust-row"><span>مكينة الشبكة</span><b>${toNum(c.card_total) === null ? "—" : sar(c.card_total)}</b></div>
      <div class="cust-row main"><span>فرق الشبكة</span>${diffPillHtml(r.cardDiff)}</div>
    </div>`;
}

async function saveCustody(payments) {
  const c = currentCustody;
  const missing = [];
  if (toNum(c.opening_float) === null) missing.push("العهدة أول اليوم");
  if (toNum(c.cash_counted) === null) missing.push("الكاش الموجود");
  if (toNum(c.card_total) === null) missing.push("مجموع الشبكة");
  if (missing.length) {
    showToast("⚠ عبّ: " + missing.join("، ") + " (إذا صفر اكتب 0)");
    return;
  }
  const expenses = c.expenses.filter(e => toNum(e.amount) !== null || String(e.note || "").trim());
  if (expenses.some(e => toNum(e.amount) === null)) {
    showToast("⚠ فيه مصروف بدون مبلغ");
    return;
  }
  const btn = document.getElementById("custodyCloseBtn");
  btn.disabled = true;
  const emp = Auth.getEmployee();
  const row = {
    date: currentCustodyDate,
    branch: currentCustodyBranch,
    opening_float: toNum(c.opening_float),
    cash_counted: toNum(c.cash_counted),
    card_total: toNum(c.card_total),
    expenses: expenses.map(e => ({ amount: toNum(e.amount), note: String(e.note || "").trim() })),
    notes: String(c.notes || "").trim(),
    closed_by: emp ? emp.name : "",
    closed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  try {
    await SupaEngine.saveCustody(row);
    currentCustody = row;
    showToast("✅ تقفّلت العهدة وانحفظت");
    renderCustodyView(payments);
  } catch (e) {
    btn.disabled = false;
    showToast("⚠ ما انحفظت — " + (e.message || e));
  }
}

function initCustodyTab() {
  currentCustodyBranch = Branch.get() || allowedBranchList()[0] || "";
  const dateEl = document.getElementById("custodyDateInput");
  if (dateEl) {
    dateEl.value = currentCustodyDate;
    dateEl.addEventListener("change", () => {
      currentCustodyDate = dateEl.value;
      loadCustody(currentCustodyDate, currentCustodyBranch);
    });
  }
}


// ---- ملخص الشهر (للمالك): كل يوم فيه مبيعات أو إغلاق — انسكر؟ وفرق الكاش والشبكة ----
async function renderCustodyMonth() {
  const el = document.getElementById("custodyMonthCard");
  if (!el) return;
  const month = currentCustodyDate.slice(0, 7);
  const start = month + "-01";
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // آخر يوم بالشهر
  let data;
  try { data = await SupaEngine.getCustodyRange(start, end, currentCustodyBranch); }
  catch (e) { el.querySelector(".cust-missing").textContent = "⚠ تعذّر جلب الملخص"; return; }
  const byDay = {};
  data.payments.forEach(p => { (byDay[p.date] = byDay[p.date] || { pays: [], closing: null }).pays.push(p); });
  data.closings.forEach(c => { (byDay[c.date] = byDay[c.date] || { pays: [], closing: null }).closing = c; });
  const days = Object.keys(byDay).sort().reverse();
  if (!days.length) { el.querySelector(".cust-missing").textContent = "ما فيه مبيعات ولا إغلاقات بهالشهر للحين."; return; }
  const cell = (diff) => diff === null ? '<span class="cust-diff neutral">—</span>' : diffPillHtml(diff);
  let closedCount = 0, cashTotal = 0, cardTotal = 0;
  const rows = days.map(d => {
    const { pays, closing } = byDay[d];
    const label = new Date(d + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "short", day: "numeric", month: "numeric" });
    if (!closing || !closing.closed_at) {
      return `<tr data-date="${d}"><td>${label}</td><td colspan="2"><span class="cust-diff short">ما انقفلت</span></td></tr>`;
    }
    closedCount++;
    const r = custodyReconciliation({ ...closing, expenses: closing.expenses || [] }, pays);
    if (pays.length) { cashTotal += r.cashDiff || 0; cardTotal += r.cardDiff || 0; }
    return `<tr data-date="${d}"><td>${label}</td><td>${pays.length ? cell(r.cashDiff) : '<span class="cust-diff neutral">بلا مبيعات</span>'}</td><td>${pays.length ? cell(r.cardDiff) : "—"}</td></tr>`;
  }).join("");
  el.innerHTML = `
    <div class="cust-owner-title">📅 ملخص الشهر · ${closedCount}/${days.length} يوم انقفلت</div>
    <div class="cust-month-sum">
      <span>مجموع فرق الكاش: ${cell(cashTotal)}</span>
      <span>مجموع فرق الشبكة: ${cell(cardTotal)}</span>
    </div>
    <table class="cust-month">
      <thead><tr><th>اليوم</th><th>الكاش</th><th>الشبكة</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="cust-missing">اضغط على أي يوم لتفتحه.</div>`;
  el.querySelectorAll("tr[data-date]").forEach(tr => tr.addEventListener("click", () => {
    const dateEl = document.getElementById("custodyDateInput");
    if (dateEl) dateEl.value = tr.dataset.date;
    loadCustody(tr.dataset.date, currentCustodyBranch);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
}
