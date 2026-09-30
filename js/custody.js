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
      return { closed: !!(row && row.closed_at), opened: !!(row && row.opening_float != null) };
    } catch (e) {
      return null;
    }
  }
};

// نموذج مصروفات الكاش (قوقل فورم) — فيه رفع صورة فاتورة فلازم الموظف يفتحه ويرفقها بنفسه
const CASH_EXPENSE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdgBfXmWQWjuqvwuV-GQWV2Ry7vrxfnF_EPV-XSfYiSyLS6Fg/viewform";

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

// ---- الصفحة على ٣ خطوات: ① العهدة أول ما يوصل ② المصروفات مع صورة الفاتورة ③ الإغلاق آخر اليوم ----
// كل خطوة تنحفظ لحالها فوراً (ما في شي يضيع لو سكّر الجوال بالنص)
let custodyDraftExpense = { amount: "", note: "", photo: "", noReceipt: false };
let custodyBusy = false;
let custodyScanRequested = false; // جاي من زر «سكان فاتورة» بالرئيسية

function custodyTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" }) : "";
}
function custodyCanEdit() {
  // بعد الإغلاق: المالك بس يعدّل
  if (Auth.isReadOnly && Auth.isReadOnly()) return false;
  return !currentCustody.closed_at || Auth.isOwner();
}

function renderCustodyView(payments) {
  const c = currentCustody;
  const view = document.getElementById("custodyView");
  const closed = !!c.closed_at;
  const opened = toNum(c.opening_float) !== null;
  const branches = allowedBranchList();
  const canEdit = custodyCanEdit();
  const d = custodyDraftExpense;
  const expTotal = custodyExpensesTotal(c.expenses);

  view.innerHTML = `
    <div class="cust-card">
      <div class="cust-head">
        <div>
          <h2 class="cust-title">💰 العهدة والمصروفات</h2>
          <div class="cust-sub">${currentCustodyDate}${branches.length > 1 ? "" : " · " + escHtml(currentCustodyBranch)}</div>
        </div>
        ${closed ? `<span class="cust-state done">✅ تقفّلت ${custodyTime(c.closed_at)}${c.closed_by ? " · " + escHtml(c.closed_by) : ""}</span>`
          : opened ? `<span class="cust-state">🟡 مفتوحة — باقي الإغلاق</span>` : `<span class="cust-state">⏳ باقي تسجيل العهدة</span>`}
      </div>
      ${branches.length > 1 ? `<select class="cust-branch" id="custodyBranchSelect">${branchOptionsHtml(currentCustodyBranch)}</select>` : ""}
      ${canEdit ? `<button type="button" class="cust-scan-top" id="custScanTop">📷 سكان فاتورة مصروف / مشتريات</button>` : ""}
    </div>

    <div class="cust-step ${opened ? "done" : "active"}">
      <div class="cust-step-head"><b>1</b> العهدة أول ما توصل (الكاش اللي بالدرج)</div>
      ${opened && !c._editOpening ? `
        <div class="cust-step-done">
          <span class="cust-amount">${sar(c.opening_float)}</span>
          <span class="cust-meta">${c.opened_by ? "سجّلها " + escHtml(c.opened_by) : ""}${c.opened_at ? " · " + custodyTime(c.opened_at) : ""}</span>
          ${canEdit ? `<button type="button" class="cust-link" id="custEditOpening">تعديل</button>` : ""}
        </div>` : `
        <div class="cust-inline">
          <input type="number" inputmode="decimal" step="any" min="0" placeholder="المبلغ بالريال" id="custOpeningInput" value="${numOrBlank(c.opening_float)}">
          <button type="button" class="cust-btn primary" id="custOpeningSave">✅ سجّل العهدة</button>
        </div>
        <div class="cust-hint">عدّ الكاش أول ما توصل واكتبه. إذا صفر اكتب 0.</div>`}
    </div>

    <div class="cust-step active" id="custExpStep">
      <div class="cust-step-head"><b>2</b> المصروفات والمشتريات من الكاش ${c.expenses.length ? `<span class="cust-count">${c.expenses.length} · ${sar(expTotal)}</span>` : ""}</div>
      ${c.expenses.length ? `<div class="cust-exp-list">
        ${c.expenses.map((e, i) => `
          <div class="cust-exp-row">
            <div class="cust-exp-main"><b>${sar(e.amount)}</b><span>${escHtml(e.note || "")}</span>
              <small>${escHtml(e.by || "")}${e.at ? " · " + custodyTime(e.at) : ""}</small></div>
            ${e.receipt ? `<button type="button" class="cust-receipt-btn" data-receipt="${escHtml(e.receipt)}">📄 الفاتورة</button>` : `<span class="cust-noreceipt">بدون فاتورة</span>`}
            ${canEdit ? `<button type="button" class="cust-exp-del" data-del="${i}" aria-label="حذف">✕</button>` : ""}
          </div>`).join("")}
      </div>` : `<div class="cust-hint">ما فيه مصروفات للحين.</div>`}
      ${canEdit ? `
      <div class="cust-exp-form" id="custExpForm">
        <div class="cust-inline">
          <input type="number" inputmode="decimal" step="any" min="0" placeholder="المبلغ" id="custExpAmount" value="${escHtml(d.amount)}">
          <input type="text" placeholder="على إيش؟ (اختياري)" id="custExpNote" value="${escHtml(d.note)}">
        </div>
        <label class="cust-photo-btn ${d.photo ? "has" : ""}" id="custPhotoLabel">
          <input type="file" accept="image/*" capture="environment" id="custExpPhoto" hidden>
          ${d.photo ? `<img src="${d.photo}" alt="الفاتورة"> <span>✓ الفاتورة جاهزة — اضغط لإعادة التصوير</span>` : `<span>📷 صوّر الفاتورة (سكان)</span>`}
        </label>
        <label class="cust-check"><input type="checkbox" id="custNoReceipt" ${d.noReceipt ? "checked" : ""}> ما في فاتورة</label>
        <button type="button" class="cust-btn gold" id="custExpAdd">➕ أضف المصروف</button>
      </div>` : ""}
    </div>

    <div class="cust-step ${closed ? "done" : opened ? "active" : "locked"}">
      <div class="cust-step-head"><b>3</b> إغلاق آخر اليوم</div>
      <label class="cust-field">
        <span class="cust-label">الكاش الموجود بالدرج عند الإغلاق</span>
        <input type="number" inputmode="decimal" step="any" min="0" placeholder="—" data-field="cash_counted" value="${numOrBlank(c.cash_counted)}" ${opened && canEdit ? "" : "disabled"}>
      </label>
      <label class="cust-field">
        <span class="cust-label">مجموع مكينة الشبكة (مدى)</span>
        <input type="number" inputmode="decimal" step="any" min="0" placeholder="—" data-field="card_total" value="${numOrBlank(c.card_total)}" ${opened && canEdit ? "" : "disabled"}>
      </label>
      <label class="cust-field">
        <span class="cust-label">ملاحظات (اختياري)</span>
        <input type="text" data-field="notes" placeholder="أي شي لازم تعرفه الإدارة" value="${escHtml(c.notes || "")}" ${canEdit ? "" : "disabled"}>
      </label>
      ${canEdit ? `<button type="button" class="cust-close-btn" id="custodyCloseBtn" ${opened ? "" : "disabled"}>${closed ? "💾 حفظ التعديل" : "🔒 إغلاق العهدة"}</button>` : ""}
      ${opened ? "" : `<div class="cust-hint">سجّل العهدة (خطوة 1) أول.</div>`}
    </div>
    ${Auth.canSeeSales() ? custodyOwnerCardHtml(c, payments) : ""}
    ${Auth.isOwner() || Auth.isReadOnly() ? '<div id="custodyMonthCard" class="cust-owner"><div class="cust-owner-title">📅 ملخص الشهر</div><div class="cust-missing">جاري التحميل…</div></div>' : ""}
  `;
  if (Auth.isOwner() || Auth.isReadOnly()) renderCustodyMonth();

  const $ = (id) => document.getElementById(id);
  view.querySelectorAll("[data-field]").forEach(inp => inp.addEventListener("input", () => {
    currentCustody[inp.dataset.field] = inp.dataset.field === "notes" ? inp.value : toNum(inp.value);
  }));
  if ($("custEditOpening")) $("custEditOpening").addEventListener("click", () => { currentCustody._editOpening = true; renderCustodyView(payments); });
  if ($("custOpeningSave")) $("custOpeningSave").addEventListener("click", () => saveCustodyOpening(payments));
  if ($("custExpAmount")) $("custExpAmount").addEventListener("input", (e) => { d.amount = e.target.value; });
  if ($("custExpNote")) $("custExpNote").addEventListener("input", (e) => { d.note = e.target.value; });
  if ($("custNoReceipt")) $("custNoReceipt").addEventListener("change", (e) => { d.noReceipt = e.target.checked; });
  if ($("custExpPhoto")) $("custExpPhoto").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { d.photo = await receiptImageDataUrl(f); d.noReceipt = false; renderCustodyView(payments); }
    catch (err) { showToast("⚠ ما قدرنا نقرأ الصورة — جرّب مرة ثانية"); }
  });
  if ($("custExpAdd")) $("custExpAdd").addEventListener("click", () => addCustodyExpense(payments));
  // زر السكان فوق: ينزل لنموذج المصروف ويفتح الكاميرا مباشرة
  if ($("custScanTop")) $("custScanTop").addEventListener("click", () => {
    const form = $("custExpForm");
    if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
    if ($("custExpPhoto")) $("custExpPhoto").click();
  });
  if (custodyScanRequested && $("custExpForm")) {
    custodyScanRequested = false;
    setTimeout(() => { $("custExpForm").scrollIntoView({ behavior: "smooth", block: "center" }); $("custExpForm").classList.add("flash"); }, 150);
  }
  view.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", () => deleteCustodyExpense(Number(btn.dataset.del), payments)));
  view.querySelectorAll("[data-receipt]").forEach(btn => btn.addEventListener("click", () => openCustodyReceipt(btn.dataset.receipt)));
  const branchSelect = $("custodyBranchSelect");
  if (branchSelect) branchSelect.addEventListener("change", () => {
    Branch.set(branchSelect.value);
    loadCustody(currentCustodyDate, branchSelect.value);
  });
  if ($("custodyCloseBtn")) $("custodyCloseBtn").addEventListener("click", () => saveCustody(payments));
}

// صورة الفاتورة: نصغّرها (أطول ضلع ١٦٠٠) ونضغطها JPEG — واضحة للقراءة وخفيفة على النت
function receiptImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

// الحفظ دايماً على آخر نسخة بالسيرفر (جهازين ممكن يسجّلوا بنفس اليوم) — ونكتب بس الأعمدة اللي تغيّرت
async function custodyPatch(mutate, payments, okMsg) {
  if (custodyBusy) return false;
  custodyBusy = true;
  try {
    const fresh = (await Custody.get(currentCustodyDate, currentCustodyBranch)) || { date: currentCustodyDate, branch: currentCustodyBranch, expenses: [] };
    if (!Array.isArray(fresh.expenses)) fresh.expenses = [];
    const patch = mutate(fresh);
    if (!patch) return false;
    const row = { date: currentCustodyDate, branch: currentCustodyBranch, ...patch, updated_at: new Date().toISOString() };
    await SupaEngine.saveCustody(row);
    currentCustody = { ...fresh, ...patch };
    if (okMsg) showToast(okMsg);
    renderCustodyView(payments);
    return true;
  } catch (e) {
    showToast("⚠ ما انحفظ — تأكد من النت وجرب مرة ثانية (" + (e.message || e) + ")");
    return false;
  } finally {
    custodyBusy = false;
  }
}

async function saveCustodyOpening(payments) {
  const inp = document.getElementById("custOpeningInput");
  const v = toNum(inp && inp.value);
  if (v === null) { showToast("⚠ اكتب مبلغ العهدة (إذا صفر اكتب 0)"); return; }
  const emp = Auth.getEmployee();
  await custodyPatch((fresh) => ({
    opening_float: v,
    opened_by: fresh.opened_by || (emp ? emp.name : ""),
    opened_at: fresh.opened_at || new Date().toISOString()
  }), payments, "✅ انسجّلت العهدة");
}

async function addCustodyExpense(payments) {
  const d = custodyDraftExpense;
  const amount = toNum(d.amount);
  if (amount === null || amount <= 0) { showToast("⚠ اكتب مبلغ المصروف"); return; }
  if (!d.photo && !d.noReceipt) { showToast("⚠ صوّر الفاتورة، أو اختر «ما في فاتورة»"); return; }
  const btn = document.getElementById("custExpAdd");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ جاري الحفظ…"; }
  let receipt = "";
  if (d.photo) {
    try { receipt = await SupaEngine.uploadReceipt(currentCustodyDate, currentCustodyBranch, d.photo); }
    catch (e) {
      showToast("⚠ ما انرفعت صورة الفاتورة — تأكد من النت وجرب مرة ثانية");
      if (btn) { btn.disabled = false; btn.textContent = "➕ أضف المصروف"; }
      return;
    }
  }
  const emp = Auth.getEmployee();
  const exp = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), amount, note: String(d.note).trim(), receipt, by: emp ? emp.name : "", at: new Date().toISOString() };
  const ok = await custodyPatch((fresh) => ({ expenses: [...fresh.expenses, exp] }), payments, "✅ انضاف المصروف");
  if (ok) { custodyDraftExpense = { amount: "", note: "", photo: "", noReceipt: false }; renderCustodyView(payments); }
  else if (btn) { btn.disabled = false; btn.textContent = "➕ أضف المصروف"; }
}

async function deleteCustodyExpense(i, payments) {
  const target = currentCustody.expenses[i];
  if (!target) return;
  const ok = await phConfirm(`تحذف مصروف ${sar(target.amount)} (${target.note || ""})؟`, { ok: "احذف", danger: true });
  if (!ok) return;
  await custodyPatch((fresh) => {
    const same = (e) => (target.id && e.id === target.id) || (!target.id && e.amount === target.amount && e.note === target.note);
    const idx = fresh.expenses.findIndex(same);
    if (idx < 0) return null;
    return { expenses: fresh.expenses.filter((_, k) => k !== idx) };
  }, payments, "🗑️ انحذف المصروف");
}

async function openCustodyReceipt(path) {
  const win = window.open("", "_blank");
  try {
    const url = await SupaEngine.receiptUrl(path);
    if (win) win.location = url; else window.location.href = url;
  } catch (e) {
    if (win) win.close();
    showToast("⚠ ما قدرنا نفتح الفاتورة — " + (e.message || e));
  }
}

function custodyOwnerCardHtml(c, payments) {
  if (!payments.length) {
    return `<div class="cust-owner"><div class="cust-owner-title">🔎 المطابقة مع مبيعات ${salesSourceName(currentCustodyBranch)} (لك بس)</div>
      <div class="cust-missing">طرق الدفع لهذا اليوم لسا ما انسحبت من ${salesSourceName(currentCustodyBranch)} — المطابقة تطلع تلقائياً بعد السحب.</div></div>`;
  }
  const r = custodyReconciliation(c, payments);
  return `
    <div class="cust-owner">
      <div class="cust-owner-title">🔎 المطابقة مع مبيعات ${salesSourceName(currentCustodyBranch)} (لك بس)</div>
      <div class="cust-row"><span>العهدة أول اليوم</span><b>${toNum(c.opening_float) === null ? "—" : sar(c.opening_float)}</b></div>
      <div class="cust-row"><span>المصروفات (${(c.expenses || []).length})</span><b>${sar(r.expenses)}</b></div>
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
  if (toNum(c.cash_counted) === null) missing.push("الكاش الموجود");
  if (toNum(c.card_total) === null) missing.push("مجموع الشبكة");
  if (missing.length) { showToast("⚠ عبّ: " + missing.join("، ") + " (إذا صفر اكتب 0)"); return; }
  const emp = Auth.getEmployee();
  const wasClosed = !!c.closed_at;
  await custodyPatch((fresh) => ({
    cash_counted: toNum(c.cash_counted),
    card_total: toNum(c.card_total),
    notes: String(c.notes || "").trim(),
    closed_by: wasClosed && fresh.closed_by ? fresh.closed_by : (emp ? emp.name : ""),
    closed_at: fresh.closed_at || new Date().toISOString()
  }), payments, wasClosed ? "✅ انحفظ التعديل" : "✅ تقفّلت العهدة");
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


const CUSTODY_START = "2026-09-26";

// ---- ملخص الشهر (للمالك): كل يوم فيه مبيعات أو إغلاق — انسكر؟ وفرق الكاش والشبكة ----
async function renderCustodyMonth() {
  const el = document.getElementById("custodyMonthCard");
  if (!el) return;
  const month = currentCustodyDate.slice(0, 7);
  // إغلاق العهدة بدأ ٢٦ سبتمبر ٢٠٢٦ — الأيام قبلها ما تنعرض
  const start = [month + "-01", CUSTODY_START].sort().pop();
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
    const label = new Date(d + "T12:00:00Z").toLocaleDateString(phLocale(), { weekday: "short", day: "numeric", month: "numeric" });
    if (!closing || !closing.closed_at) {
      return `<tr data-date="${d}"><td>${label}</td><td colspan="2"><span class="cust-diff short">لم تُغلق</span></td></tr>`;
    }
    closedCount++;
    const r = custodyReconciliation({ ...closing, expenses: closing.expenses || [] }, pays);
    if (pays.length) { cashTotal += r.cashDiff || 0; cardTotal += r.cardDiff || 0; }
    return `<tr data-date="${d}"><td>${label}</td><td>${pays.length ? cell(r.cashDiff) : '<span class="cust-diff neutral">بدون مبيعات</span>'}</td><td>${pays.length ? cell(r.cardDiff) : "—"}</td></tr>`;
  }).join("");
  el.innerHTML = `
    <div class="cust-owner-title">📅 ملخص الشهر · ${closedCount}/${days.length} يوم مغلق</div>
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
