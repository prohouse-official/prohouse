// ==================== المشتريات (مرحلة ١: تجربة ببيانات وهمية) ====================
// الفواتير بتجي من قوقل فورم تبع يزيد (بعدين من الموقع نفسه)، ومصروفات الفروع من إغلاق العهدة.
// المحاسب يراجع كل فاتورة مع صورتها: يصحح التصنيف أو الوحدة أو الكمية، وبعدين يعتمدها أو يرجّعها.
// الروضة = المطبخ المركزي: فواتير يزيد تنحسب عليه، والفروع الثانية مشترياتها الإضافية من العهدة.
// الشاشة شغّالة بوضع التجربة بس لحتى تنبني الجداول بقاعدة البيانات (PURCHASES_LIVE).

const PURCHASES_LIVE = false;
const PUR_CENTRAL_BRANCH = "الروضة";
const PUR_CATEGORIES = ["لحوم", "خضراوات", "بهارات", "بقالة", "مشروبات", "بلاستيك وتغليف", "منظفات", "أدوات طبخ", "أخرى"];
const PUR_UNITS = ["كيلو", "جرام", "حبة", "كرتون", "علبة", "لتر", "كيس", "ربطة", "طبق"];
const PUR_VAT_RATE = 0.15;
const PUR_SOURCES = { google_form: "قوقل فورم", custody: "العهدة", site: "الموقع" };
const PUR_STATUS = { pending: "بانتظار المراجعة", approved: "معتمدة", rejected: "مرجّعة ليزيد" };

let purMonth = "";
let purBranch = "";
let purStatusFilter = "pending";
let purInvoices = [];
let purOpenId = "";
let purDraft = null;   // نسخة الفاتورة المفتوحة وهي عم تتعدل
let purBusy = false;
let purLoadSeq = 0;

function purchasesEnabled() {
  return PURCHASES_LIVE || !!window.PH_DEMO;
}

const purNum = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const purRound = (n) => Math.round((Number(n) || 0) * 100) / 100;
const purSar = (n) => `${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
// المرتجع ينقص من المجاميع
const purSign = (inv) => (inv.kind === "return" ? -1 : 1);

function purLinesTotal(inv) {
  return purRound((inv.lines || []).reduce((s, l) => s + (Number(l.total) || 0), 0));
}

// مبلغ الفاتورة بعد الضريبة (لو الإجمالي ناقص: قبل الضريبة + الضريبة، أو مجموع الأصناف)
function purInvoiceTotal(inv) {
  const t = purNum(inv.total);
  if (t !== null) return t;
  const sub = purNum(inv.subtotal);
  if (sub !== null) return purRound(sub + (purNum(inv.vat) || 0));
  return purLinesTotal(inv);
}

// فحوصات المحاسب: كل اللي لازم ينتبه له قبل ما يعتمد
function purchaseChecks(inv, all) {
  const out = [];
  const sub = purNum(inv.subtotal), vat = purNum(inv.vat), total = purNum(inv.total);
  if (!inv.invoice_date) out.push("التاريخ ناقص");
  if (!String(inv.supplier || "").trim()) out.push("اسم المورد ناقص");
  if (inv.source !== "custody" && !String(inv.invoice_no || "").trim()) out.push("رقم الفاتورة ناقص");
  if (total === null || total <= 0) out.push("الإجمالي ناقص");
  if (sub !== null && vat !== null && total !== null && Math.abs(sub + vat - total) > 1) {
    out.push(`قبل الضريبة + الضريبة = ${purSar(sub + vat)} مو ${purSar(total)}`);
  }
  if (sub !== null && vat !== null && vat > 0 && Math.abs(vat - sub * PUR_VAT_RATE) > 1) {
    out.push(`الضريبة مو ١٥٪ (المتوقع ${purSar(sub * PUR_VAT_RATE)})`);
  }
  const lines = inv.lines || [];
  if (!lines.length) out.push("ما فيه أصناف — لازم صنف واحد على الأقل عشان التصنيف");
  if (lines.length) {
    const linesSum = purLinesTotal(inv);
    const target = sub !== null ? sub : total;
    const alt = total; // بعض الفواتير أسعار الأصناف فيها شامل الضريبة
    if (target !== null && Math.abs(linesSum - target) > 1 && !(alt !== null && Math.abs(linesSum - alt) <= 1)) {
      out.push(`مجموع الأصناف ${purSar(linesSum)} مو مطابق للفاتورة (${purSar(target)})`);
    }
  }
  lines.forEach((l, i) => {
    const n = `سطر ${i + 1}${l.name ? " (" + l.name + ")" : ""}`;
    if (!String(l.name || "").trim()) out.push(`${n}: اسم الصنف ناقص`);
    if (purNum(l.qty) === null || purNum(l.qty) <= 0) out.push(`${n}: الكمية ناقصة`);
    if (!l.unit) out.push(`${n}: الوحدة ناقصة`);
    if (!l.category) out.push(`${n}: التصنيف ناقص`);
    const q = purNum(l.qty), p = purNum(l.unit_price), t = purNum(l.total);
    if (q !== null && p !== null && t !== null && Math.abs(q * p - t) > 0.5) out.push(`${n}: الكمية × السعر = ${purSar(q * p)} مو ${purSar(t)}`);
  });
  const no = String(inv.invoice_no || "").trim();
  if (no && all) {
    const dup = all.find(o => o.id !== inv.id && o.kind === inv.kind && o.status !== "rejected" &&
      String(o.invoice_no || "").trim() === no && String(o.supplier || "").trim() === String(inv.supplier || "").trim());
    if (dup) out.push(`مكررة؟ نفس الرقم ونفس المورد مسجلة بتاريخ ${dup.invoice_date}`);
  }
  if (inv.kind === "return" && !inv.return_of) out.push("المرتجع مو مربوط بفاتورة");
  return out;
}

// ملخص الشهر: المرجّعة ما تنحسب، والمرتجعات تنقص. التصنيف من مجموع أسطر كل فاتورة
function purchaseSummary(invoices) {
  const s = { total: 0, vat: 0, count: 0, pendingCount: 0, pendingTotal: 0, byCategory: {}, bySupplier: {} };
  (invoices || []).forEach(inv => {
    if (inv.status === "rejected") return;
    const sign = purSign(inv), total = purInvoiceTotal(inv) * sign;
    s.total += total;
    s.vat += (purNum(inv.vat) || 0) * sign;
    s.count++;
    if (inv.status === "pending") { s.pendingCount++; s.pendingTotal += total; }
    const sup = String(inv.supplier || "").trim() || "بدون اسم";
    s.bySupplier[sup] = (s.bySupplier[sup] || 0) + total;
    const lines = inv.lines || [];
    if (!lines.length) { s.byCategory["غير مصنّف"] = (s.byCategory["غير مصنّف"] || 0) + total; return; }
    lines.forEach(l => {
      const c = l.category || "غير مصنّف";
      s.byCategory[c] = (s.byCategory[c] || 0) + (Number(l.total) || 0) * sign;
    });
  });
  s.total = purRound(s.total); s.vat = purRound(s.vat); s.pendingTotal = purRound(s.pendingTotal);
  Object.keys(s.byCategory).forEach(k => { s.byCategory[k] = purRound(s.byCategory[k]); });
  Object.keys(s.bySupplier).forEach(k => { s.bySupplier[k] = purRound(s.bySupplier[k]); });
  return s;
}

// مصروف العهدة → فاتورة بانتظار التصنيف (لين المحاسب يحفظها تصير فاتورة حقيقية)
function custodyExpenseToInvoice(closing, exp) {
  const ref = `${closing.date}|${closing.branch}|${exp.id || exp.at || exp.amount}`;
  return {
    id: "cust_" + ref, source: "custody", source_ref: ref, kind: "invoice",
    invoice_date: closing.date, invoice_no: "", supplier: String(exp.note || "").trim(), branch: closing.branch,
    subtotal: null, vat: null, total: Number(exp.amount) || 0, lines: [], receipt: exp.receipt || "",
    status: "pending", created_by: exp.by || "", created_at: exp.at || "", _virtual: true
  };
}

function purMonthRange(month) {
  const [y, m] = month.split("-").map(Number);
  return { start: month + "-01", end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

async function loadPurchases() {
  const view = document.getElementById("purchasesView");
  if (!view) return;
  if (!purMonth) purMonth = todayStr().slice(0, 7);
  const seq = ++purLoadSeq;
  view.innerHTML = '<div class="loader">جاري التحميل…</div>';
  const { start, end } = purMonthRange(purMonth);
  let rows, closings;
  try {
    [rows, closings] = await Promise.all([SupaEngine.getPurchases(start, end), SupaEngine.getCustodyExpensesRange(start, end)]);
  } catch (e) {
    if (seq !== purLoadSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر جلب المشتريات — ${escHtml(e.message || String(e))}</div>`;
    return;
  }
  if (seq !== purLoadSeq) return;
  const refs = new Set(rows.filter(r => r.source_ref).map(r => r.source_ref));
  const virtual = [];
  closings.forEach(c => (c.expenses || []).forEach(exp => {
    if (!(Number(exp.amount) > 0)) return;
    const inv = custodyExpenseToInvoice(c, exp);
    if (!refs.has(inv.source_ref)) virtual.push(inv);
  }));
  purInvoices = [...rows, ...virtual].sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
  if (purOpenId && !purInvoices.some(i => i.id === purOpenId)) { purOpenId = ""; purDraft = null; }
  renderPurchasesView();
}

function purCanReview() { return Auth.isOwner() || Auth.isReadOnly(); }

function purVisible() {
  return purInvoices.filter(i => (!purBranch || i.branch === purBranch) && (purStatusFilter === "all" || i.status === purStatusFilter));
}

function renderPurchasesView() {
  const view = document.getElementById("purchasesView");
  if (!view) return;
  const scoped = purInvoices.filter(i => !purBranch || i.branch === purBranch);
  const s = purchaseSummary(scoped);
  const counts = { pending: 0, approved: 0, rejected: 0 };
  scoped.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });
  const cats = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map(c => Math.abs(c[1])));
  const sups = Object.entries(s.bySupplier).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const list = purVisible();
  const branches = branchList();

  view.innerHTML = `
    <div class="cust-card">
      <div class="cust-head">
        <div>
          <h2 class="cust-title">🧾 المشتريات</h2>
          <div class="cust-sub">فواتير يزيد (قوقل فورم) + مصروفات الفروع من العهدة</div>
        </div>
        ${Auth.isOwner() ? `<button type="button" class="cust-btn primary pur-new" id="purNew">➕ فاتورة</button>` : ""}
      </div>
      ${PURCHASES_LIVE ? "" : `<div class="pur-trial">🧪 مرحلة تجربة — الفواتير هنا وهمية</div>`}
      <div class="pur-filters">
        <input type="month" id="purMonthInput" value="${purMonth}">
        <select id="purBranchSelect">
          <option value="">كل الفروع</option>
          ${branches.map(b => `<option value="${escHtml(b)}" ${b === purBranch ? "selected" : ""}>${escHtml(b)}${b === PUR_CENTRAL_BRANCH ? " (المطبخ المركزي)" : ""}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="cust-owner pur-summary">
      <div class="cust-owner-title">📊 ملخص الشهر</div>
      <div class="pur-kpis">
        <div><span>الإجمالي</span><b>${purSar(s.total)}</b></div>
        <div><span>الضريبة</span><b>${purSar(s.vat)}</b></div>
        <div><span>عدد الفواتير</span><b>${s.count}</b></div>
      </div>
      ${s.pendingCount ? `<div class="pur-pending-note">⏳ ${s.pendingCount} بانتظار المراجعة (${purSar(s.pendingTotal)}) — محسوبة بالإجمالي</div>` : ""}
      ${cats.length ? `<div class="pur-sec-title">حسب التصنيف</div>
        ${cats.map(([c, v]) => `<div class="pur-bar"><span class="pur-bar-name">${escHtml(c)}</span>
          <span class="pur-bar-track"><i style="width:${Math.round(Math.abs(v) / maxCat * 100)}%"></i></span><b>${purSar(v)}</b></div>`).join("")}` : ""}
      ${sups.length ? `<div class="pur-sec-title">أكثر الموردين</div>
        ${sups.map(([n, v]) => `<div class="cust-row"><span>${escHtml(n)}</span><b>${purSar(v)}</b></div>`).join("")}` : ""}
    </div>

    <div class="pur-chips" role="tablist">
      ${[["pending", `⏳ ${PUR_STATUS.pending}`], ["approved", `✅ ${PUR_STATUS.approved}`], ["rejected", `↩ ${PUR_STATUS.rejected}`], ["all", "الكل"]].map(([k, label]) =>
        `<button type="button" class="pur-chip ${purStatusFilter === k ? "active" : ""}" data-status="${k}">${label}${k === "all" ? "" : ` <small>${counts[k] || 0}</small>`}</button>`).join("")}
    </div>

    <div class="pur-list">
      ${list.length ? list.map(purRowHtml).join("") : `<div class="cust-hint pur-empty">ما فيه فواتير هنا.</div>`}
    </div>
  `;
  bindPurchasesView();
}

function purRowHtml(inv) {
  const open = inv.id === purOpenId;
  const warnings = purchaseChecks(inv, purInvoices);
  const date = inv.invoice_date ? new Date(inv.invoice_date + "T12:00:00Z").toLocaleDateString(phLocale(), { day: "numeric", month: "numeric" }) : "—";
  return `
    <div class="pur-item ${open ? "open" : ""} st-${inv.status}" data-id="${escHtml(inv.id)}">
      <button type="button" class="pur-row" data-open="${escHtml(inv.id)}">
        <span class="pur-date">${date}</span>
        <span class="pur-main">
          <b>${escHtml(inv.supplier || "بدون اسم")}${inv.kind === "return" ? ' <em class="pur-ret">مرتجع</em>' : ""}</b>
          <small>${escHtml(inv.branch || "")}${inv.invoice_no ? " · #" + escHtml(inv.invoice_no) : ""} · ${PUR_SOURCES[inv.source] || ""}${warnings.length && inv.status === "pending" ? ` · <span class="pur-warn-count">⚠ ${warnings.length}</span>` : ""}</small>
        </span>
        <span class="pur-amt">${inv.kind === "return" ? "−" : ""}${purSar(purInvoiceTotal(inv))}</span>
      </button>
      ${open ? purDetailHtml() : ""}
    </div>`;
}

function purDetailHtml() {
  const d = purDraft;
  if (!d) return "";
  const canEdit = purCanReview() && !purBusy;
  const warnings = purchaseChecks(d, purInvoices);
  const dis = canEdit ? "" : "disabled";
  const field = (key, label, type = "text") => `
    <label class="pur-field"><span>${label}</span>
      <input type="${type}" ${type === "number" ? 'inputmode="decimal" step="any"' : ""} data-f="${key}" value="${escHtml(d[key] == null ? "" : String(d[key]))}" ${dis}></label>`;
  const opt = (arr, v) => `<option value="">—</option>` + arr.map(x => `<option ${x === v ? "selected" : ""}>${escHtml(x)}</option>`).join("");
  const original = d.return_of ? purInvoices.find(i => i.id === d.return_of) : null;
  return `
    <div class="pur-detail">
      <div class="pur-detail-top">
        <span class="pur-status st-${d.status}">${PUR_STATUS[d.status] || ""}</span>
        ${d.receipt ? `<button type="button" class="cust-receipt-btn" data-receipt="${escHtml(d.receipt)}">📄 صورة الفاتورة</button>` : `<span class="cust-noreceipt">بدون صورة</span>`}
        ${canEdit && Auth.isOwner() ? `<label class="pur-mini pur-photo"><input type="file" accept="image/*" capture="environment" id="purPhoto" hidden>📷 ${d.receipt ? "غيّر الصورة" : "أرفق صورة"}</label>` : ""}
      </div>
      ${d.kind === "return" ? `<div class="pur-hint">↩ مرتجع ${original ? `من فاتورة ${escHtml(original.supplier || "")} #${escHtml(original.invoice_no || "")}` : ""} — ينقص من المشتريات</div>` : ""}
      ${d.review_note && d.status === "rejected" ? `<div class="pur-note-shown">ملاحظة المحاسب: ${escHtml(d.review_note)}</div>` : ""}
      <div class="pur-grid">
        ${field("invoice_date", "التاريخ", "date")}
        ${field("invoice_no", "رقم الفاتورة")}
        ${field("supplier", "المورد")}
        <label class="pur-field"><span>الفرع</span>
          <select data-f="branch" ${dis}>${branchList().map(b => `<option ${b === d.branch ? "selected" : ""}>${escHtml(b)}</option>`).join("")}</select></label>
        ${field("subtotal", "قبل الضريبة", "number")}
        ${field("vat", "الضريبة", "number")}
        ${field("total", "الإجمالي بعد الضريبة", "number")}
      </div>
      ${canEdit ? `<button type="button" class="pur-mini" id="purCalcVat">حساب الضريبة ١٥٪ من «قبل الضريبة»</button>` : ""}

      <div class="pur-sec-title">الأصناف (ركّز على الوحدة والكمية)</div>
      <div class="pur-lines">
        ${(d.lines || []).map((l, i) => `
          <div class="pur-line" data-line="${i}">
            <input type="text" data-l="name" placeholder="الصنف" value="${escHtml(l.name || "")}" ${dis}>
            <div class="pur-line-nums">
              <label><small>الكمية</small><input type="number" inputmode="decimal" step="any" data-l="qty" value="${l.qty ?? ""}" ${dis}></label>
              <label><small>الوحدة</small><select data-l="unit" ${dis}>${opt(PUR_UNITS.includes(l.unit) || !l.unit ? PUR_UNITS : [...PUR_UNITS, l.unit], l.unit)}</select></label>
              <label><small>سعر الوحدة</small><input type="number" inputmode="decimal" step="any" data-l="unit_price" value="${l.unit_price ?? ""}" ${dis}></label>
              <label><small>المجموع</small><input type="number" inputmode="decimal" step="any" data-l="total" value="${l.total ?? ""}" ${dis}></label>
            </div>
            <div class="pur-line-cat">
              <select data-l="category" ${dis}>${opt(PUR_CATEGORIES, l.category).replace('<option value="">—</option>', '<option value="">— التصنيف —</option>')}</select>
              ${canEdit ? `<button type="button" class="cust-exp-del" data-del-line="${i}" aria-label="حذف السطر">✕</button>` : ""}
            </div>
          </div>`).join("") || `<div class="cust-hint">ما فيه أصناف.</div>`}
      </div>
      ${canEdit ? `<button type="button" class="cust-add" id="purAddLine">➕ أضف صنف</button>` : ""}
      <div class="pur-lines-sum">مجموع الأصناف: <b>${purSar(purLinesTotal(d))}</b></div>

      ${warnings.length ? `<div class="pur-warnings"><b>⚠ انتبه قبل الاعتماد:</b><ul>${warnings.map(w => `<li>${escHtml(w)}</li>`).join("")}</ul></div>`
        : `<div class="pur-ok">✓ الأرقام متطابقة</div>`}

      ${canEdit ? `
        <label class="pur-field wide"><span>ملاحظة (مطلوبة لو بترجعها ليزيد)</span>
          <input type="text" data-f="review_note" value="${escHtml(d.review_note || "")}" placeholder="مثلاً: الوحدة بالكرتون مو بالكيلو"></label>
        <div class="pur-actions">
          <button type="button" class="cust-btn primary" data-act="approved">✅ ${d.status === "approved" ? "حفظ التعديل" : d._virtual && d.source === "site" ? "حفظ واعتماد" : "اعتماد"}</button>
          ${d._virtual && d.source === "site" ? `<button type="button" class="cust-btn pur-reject" data-act="pending">💾 حفظ للمراجعة</button>`
            : d.status !== "rejected" ? `<button type="button" class="cust-btn pur-reject" data-act="rejected">↩ رجّعها ليزيد</button>` : `<button type="button" class="cust-btn pur-reject" data-act="pending">⏳ رجّعها للمراجعة</button>`}
        </div>
        ${d.kind !== "return" && d.status === "approved" && !d._virtual ? `<button type="button" class="cust-add" id="purReturn">↩ سجّل مرتجع من هالفاتورة</button>` : ""}
      ` : ""}
      ${d.reviewed_by ? `<div class="cust-meta pur-meta">آخر مراجعة: ${escHtml(d.reviewed_by)}${d.reviewed_at ? " · " + new Date(d.reviewed_at).toLocaleString(phLocale(), { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</div>` : ""}
      ${d.created_by ? `<div class="cust-meta pur-meta">سجّلها ${escHtml(d.created_by)}</div>` : ""}
    </div>`;
}

function bindPurchasesView() {
  const view = document.getElementById("purchasesView");
  const $ = (id) => document.getElementById(id);
  if ($("purMonthInput")) $("purMonthInput").addEventListener("change", (e) => {
    if (!/^\d{4}-\d{2}$/.test(e.target.value)) return;
    purMonth = e.target.value; purOpenId = ""; purDraft = null; loadPurchases();
  });
  if ($("purBranchSelect")) $("purBranchSelect").addEventListener("change", (e) => { purBranch = e.target.value; renderPurchasesView(); });
  view.querySelectorAll("[data-status]").forEach(b => b.addEventListener("click", () => { purStatusFilter = b.dataset.status; renderPurchasesView(); }));
  view.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.open;
    if (purOpenId === id) { purOpenId = ""; purDraft = null; }
    else {
      const inv = purInvoices.find(i => i.id === id);
      purOpenId = id;
      purDraft = JSON.parse(JSON.stringify(inv));
      if (!Array.isArray(purDraft.lines)) purDraft.lines = [];
      // مصروف عهدة بدون أصناف: نجهّز سطر واحد بنفس المبلغ عشان المحاسب يحط التصنيف بس
      if (purDraft._virtual && !purDraft.lines.length) purDraft.lines.push({ name: purDraft.supplier || "", qty: 1, unit: "حبة", unit_price: purDraft.total, total: purDraft.total, category: "" });
    }
    renderPurchasesView();
    const el = view.querySelector(`.pur-item[data-id="${CSS.escape(id)}"]`);
    if (el && purOpenId) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  if ($("purNew")) $("purNew").addEventListener("click", newPurchaseInvoice);
  if (!purDraft) return;

  const refreshChecks = () => {
    // نحدّث الفحوصات ومجموع الأصناف بدون ما نعيد رسم الحقول (عشان الكيبورد ما يسكّر)
    const box = view.querySelector(".pur-detail");
    if (!box) return;
    const w = purchaseChecks(purDraft, purInvoices);
    const old = box.querySelector(".pur-warnings, .pur-ok");
    if (old) old.outerHTML = w.length ? `<div class="pur-warnings"><b>⚠ انتبه قبل الاعتماد:</b><ul>${w.map(x => `<li>${escHtml(x)}</li>`).join("")}</ul></div>` : `<div class="pur-ok">✓ الأرقام متطابقة</div>`;
    const sum = box.querySelector(".pur-lines-sum b");
    if (sum) sum.textContent = purSar(purLinesTotal(purDraft));
  };
  view.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => {
    const k = inp.dataset.f;
    purDraft[k] = inp.type === "number" ? purNum(inp.value) : inp.value;
    refreshChecks();
  }));
  view.querySelectorAll("[data-line]").forEach(row => {
    const i = Number(row.dataset.line);
    row.querySelectorAll("[data-l]").forEach(inp => inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => {
      const k = inp.dataset.l, line = purDraft.lines[i];
      line[k] = inp.type === "number" ? purNum(inp.value) : inp.value;
      // الكمية × السعر يعبّي المجموع لحاله إذا المجموع فاضي
      if ((k === "qty" || k === "unit_price") && purNum(line.qty) !== null && purNum(line.unit_price) !== null) {
        const tot = row.querySelector('[data-l="total"]');
        if (tot && (tot.value === "" || tot.dataset.auto === "1")) { line.total = purRound(line.qty * line.unit_price); tot.value = line.total; tot.dataset.auto = "1"; }
      }
      if (k === "total") inp.dataset.auto = "";
      refreshChecks();
    }));
  });
  view.querySelectorAll("[data-del-line]").forEach(b => b.addEventListener("click", () => { purDraft.lines.splice(Number(b.dataset.delLine), 1); renderPurchasesView(); }));
  if ($("purAddLine")) $("purAddLine").addEventListener("click", () => {
    const last = purDraft.lines[purDraft.lines.length - 1];
    purDraft.lines.push({ name: "", qty: null, unit: "", unit_price: null, total: null, category: last ? last.category : "" });
    renderPurchasesView();
  });
  if ($("purCalcVat")) $("purCalcVat").addEventListener("click", () => {
    const sub = purNum(purDraft.subtotal);
    if (sub === null) { showToast("⚠ اكتب المبلغ قبل الضريبة أول"); return; }
    purDraft.vat = purRound(sub * PUR_VAT_RATE);
    purDraft.total = purRound(sub + purDraft.vat);
    renderPurchasesView();
  });
  view.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => savePurchaseReview(b.dataset.act)));
  if ($("purReturn")) $("purReturn").addEventListener("click", newPurchaseReturn);
  if ($("purPhoto")) $("purPhoto").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f || !purDraft) return;
    const draft = purDraft;
    try {
      showToast("⏳ جاري رفع الصورة…");
      const dataUrl = await receiptImageDataUrl(f);
      draft.receipt = await SupaEngine.uploadReceipt(draft.invoice_date || todayStr(), draft.branch || PUR_CENTRAL_BRANCH, dataUrl);
      if (purDraft === draft) renderPurchasesView();
      showToast("✅ انرفعت الصورة — لا تنسى تحفظ");
    } catch (err) {
      showToast("⚠ ما انرفعت الصورة — " + (err.message || err));
    }
  });
  view.querySelectorAll(".pur-detail [data-receipt]").forEach(btn => btn.addEventListener("click", () => openCustodyReceipt(btn.dataset.receipt)));
}

async function savePurchaseReview(status) {
  if (purBusy || !purDraft) return;
  const d = purDraft;
  if (status === "rejected" && !String(d.review_note || "").trim()) { showToast("⚠ اكتب ليزيد وش الغلط بالملاحظة"); return; }
  if (status === "approved") {
    const w = purchaseChecks(d, purInvoices);
    if (w.length && !(await phConfirm(`فيه ${w.length} ملاحظة على الفاتورة:\n• ${w.slice(0, 4).join("\n• ")}\n\nتعتمدها كذا؟`, { ok: "اعتمدها", cancel: "أرجع أصلح" }))) return;
  }
  const emp = Auth.getEmployee();
  const { _virtual, ...row } = d;
  if (_virtual) row.id = purNewId();
  row.status = status;
  row.review_note = String(d.review_note || "").trim();
  row.reviewed_by = emp ? emp.name : "";
  row.reviewed_at = new Date().toISOString();
  row.lines = (row.lines || []).filter(l => String(l.name || "").trim() || purNum(l.total) !== null);
  purBusy = true;
  try {
    await SupaEngine.savePurchase(row);
    showToast(status === "approved" ? "✅ انعتمدت" : status === "rejected" ? "↩ رجعت ليزيد" : "⏳ رجعت للمراجعة");
    purOpenId = ""; purDraft = null;
  } catch (e) {
    showToast("⚠ ما انحفظ — " + (e.message || e));
  } finally {
    purBusy = false;
  }
  await loadPurchases();
}

function purNewId() {
  return "pur_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function newPurchaseInvoice() {
  const emp = Auth.getEmployee();
  const inv = {
    id: purNewId(), source: "site", kind: "invoice", invoice_date: todayStr(), invoice_no: "", supplier: "",
    branch: PUR_CENTRAL_BRANCH, subtotal: null, vat: null, total: null,
    lines: [{ name: "", qty: null, unit: "", unit_price: null, total: null, category: "" }],
    receipt: "", status: "pending", created_by: emp ? emp.name : "", created_at: new Date().toISOString(), _virtual: true
  };
  purInvoices.unshift(inv);
  purStatusFilter = "pending";
  purOpenId = inv.id;
  purDraft = JSON.parse(JSON.stringify(inv));
  renderPurchasesView();
}

function newPurchaseReturn() {
  const orig = purDraft;
  const emp = Auth.getEmployee();
  const inv = {
    id: purNewId(), source: "site", kind: "return", return_of: orig.id, invoice_date: todayStr(), invoice_no: "",
    supplier: orig.supplier, branch: orig.branch, subtotal: null, vat: null, total: null,
    lines: (orig.lines || []).map(l => ({ ...l, qty: null, total: null })), receipt: "",
    status: "pending", created_by: emp ? emp.name : "", created_at: new Date().toISOString(), _virtual: true
  };
  purInvoices.unshift(inv);
  purStatusFilter = "pending";
  purOpenId = inv.id;
  purDraft = JSON.parse(JSON.stringify(inv));
  renderPurchasesView();
  showToast("↩ عبّ كميات المرتجع بس، واحذف الأصناف اللي ما رجعت");
}
