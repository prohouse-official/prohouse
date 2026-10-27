// ==================== المشتريات (تجربة: بيانات حقيقية من شيت يزيد، للمالك والمحاسب بس) ====================
// الفواتير بتجي من قوقل فورم تبع يزيد (بعدين من الموقع نفسه)، ومصروفات الفروع من إغلاق العهدة.
// المحاسب يراجع كل فاتورة مع صورتها: يصحح التصنيف أو الوحدة أو الكمية، وبعدين يعتمدها أو يرجّعها.
// الروضة = المطبخ المركزي: فواتير يزيد تنحسب عليه، والفروع الثانية مشترياتها الإضافية من العهدة.
// فواتير شيت يزيد تنسحب كل ساعة (tools/purchases-sync.gs → دالة purchases-sync)، والفورم لسا هو الأساس لحين ما نعتمد الموقع.
// التصنيفات حسب ورقة المحاسب، وتصنيف يزيد الأصلي محفوظ بالسطر (form_category).

const PURCHASES_LIVE = true;
const PUR_CENTRAL_BRANCH = "الروضة";
// فواتير اشتراها المالك مباشرة (مو من عهدة فرع) — بتنحفظ بدون فرع
const PUR_DIRECT = "مشتريات مباشرة";
const PUR_CATEGORIES = ["لحوم", "خضراوات", "بهارات", "بقالة", "مشروبات", "بلاستيك وتغليف", "منظفات", "أدوات طبخ", "اشتراكات التطبيقات", "أخرى"];
// شرح قصير يطلع تحت التصنيف بالملخص
const PUR_CAT_NOTES = { "اشتراكات التطبيقات": "فوديكس وتاب سنس (أنظمة الكاشير) · تكرار (منصة الاشتراكات) · كيتا (عمولة التوصيل)" };
const PUR_UNITS = ["كجم", "جرام", "حبة", "كرتون", "علبة", "عبوة", "لتر", "كيس", "ربطة", "طبق", "صندوق", "شبكة", "جالون"];
const PUR_VAT_RATE = 0.15;
const PUR_SOURCES = { google_form: "قوقل فورم", custody: "العهدة", site: "الموقع", keeta: "كيتا (تلقائي)" };
const PUR_STATUS = { pending: "بانتظار المراجعة", approved: "معتمدة", rejected: "مرجّعة ليزيد" };

let purStart = "";  // الفترة: من تاريخ لين تاريخ
let purEnd = "";
let purPreset = "month";
let purBranch = "";
let purStatusFilter = "pending";
let purInvoices = [];
let purOpenId = "";
let purDraft = null;   // نسخة الفاتورة المفتوحة وهي عم تتعدل
let purBusy = false;
let purLoadSeq = 0;
let purSuppliers = []; // [{name, aliases, default_category, ...}]
let purShowSuppliers = false;
let purProdQuery = ""; // بحث تكلفة المنتجات
let purProdOpen = "";
let purSales = []; // [{date, branch, amount}] مبيعات الفترة

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
// صافي السطر بعد نصيبه من خصم الفاتورة
const purLineNet = (l) => purRound((Number(l.total) || 0) - (Number(l.discount) || 0));

// خصم الفاتورة (قبل الضريبة): إذا محدد على صنف ينحط عليه كامل، وإذا لا يتوزع على الأصناف حسب مبلغ كل صنف
function purApplyDiscount(inv) {
  const lines = inv.lines || [];
  const disc = purNum(inv.discount) || 0;
  lines.forEach(l => { delete l.discount; });
  if (!(disc > 0) || !lines.length) return inv;
  const idx = Number.isInteger(inv.discount_line) ? inv.discount_line : null;
  if (idx !== null && lines[idx]) { lines[idx].discount = purRound(disc); return inv; }
  const base = lines.reduce((s, l) => s + Math.max(0, Number(l.total) || 0), 0);
  if (!(base > 0)) { lines[0].discount = purRound(disc); return inv; }
  let given = 0, biggest = 0;
  lines.forEach((l, i) => {
    l.discount = purRound(disc * Math.max(0, Number(l.total) || 0) / base);
    given += l.discount;
    if ((Number(l.total) || 0) > (Number(lines[biggest].total) || 0)) biggest = i;
  });
  lines[biggest].discount = purRound(lines[biggest].discount + disc - given); // فرق التقريب على أكبر صنف
  return inv;
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
  else {
    // قراءة التاريخ من الصورة أحياناً بتغلط بالسنة (2021، 2019): فرق أكتر من 45 يوم عن اليوم = غالباً غلط
    const diff = Math.abs(new Date(inv.invoice_date + "T12:00:00Z") - new Date(todayStr() + "T12:00:00Z")) / 86400000;
    if (diff > 45) out.push(`تاريخ الفاتورة ${inv.invoice_date} بعيد عن اليوم — تأكد منه`);
  }
  if (!String(inv.supplier || "").trim()) out.push("اسم المورد ناقص");
  const noInvoice = inv.extra && inv.extra.doc_type === "بدون فاتورة";
  if (inv.source !== "custody" && !noInvoice && !String(inv.invoice_no || "").trim()) out.push("رقم الفاتورة ناقص");
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
    const linesSum = purRound(purLinesTotal(inv) - (purNum(inv.discount) || 0));
    const target = sub !== null ? sub : total;
    const alt = total; // بعض الفواتير أسعار الأصناف فيها شامل الضريبة
    if (target !== null && Math.abs(linesSum - target) > 1 && !(alt !== null && Math.abs(linesSum - alt) <= 1)) {
      out.push(`مجموع الأصناف${purNum(inv.discount) ? " بعد الخصم" : ""} ${purSar(linesSum)} مو مطابق للفاتورة (${purSar(target)})`);
    }
  }
  lines.forEach((l, i) => {
    const n = `سطر ${i + 1}${l.name ? " (" + l.name + ")" : ""}`;
    if (l.cat_check) out.push(`${n}: التصنيف «${l.category || "—"}» يحتاج تأكيد من المحاسب`);
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
      s.byCategory[c] = (s.byCategory[c] || 0) + purLineNet(l) * sign;
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
    invoice_date: exp.invoice_date || closing.date, invoice_no: exp.invoice_no || "", supplier: String(exp.supplier || exp.note || "").trim(), branch: closing.branch,
    subtotal: exp.vat !== undefined && exp.vat !== null ? purRound((Number(exp.amount) || 0) - Number(exp.vat)) : null,
    vat: exp.vat !== undefined && exp.vat !== null ? Number(exp.vat) : null, total: Number(exp.amount) || 0,
    // أصناف من القراءة الآلية (فيها category_sure) → نفس قواعد التصنيف والعلامة للمحاسب
    lines: Array.isArray(exp.lines) ? exp.lines.filter(l => l && typeof l === "object").map(l => ("category_sure" in l) ? purAiLine(l, null)
      : { name: l.name || "", qty: l.qty ?? null, unit: l.unit || "", unit_price: l.unit_price ?? null, total: l.total ?? null, category: l.category || "", ...(l.cat_check ? { cat_check: true } : {}) }) : [],
    receipt: exp.receipt || "",
    extra: { ...(exp.supplier_vat ? { supplier_vat: exp.supplier_vat } : {}), ...(exp.note && exp.supplier ? { note: exp.note } : {}) },
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
  if (!purStart || !purEnd) purSetPreset(purPreset);
  const seq = ++purLoadSeq;
  view.innerHTML = '<div class="loader">جاري التحميل…</div>';
  const start = purStart, end = purEnd;
  let rows, closings;
  try {
    let sups, sales;
    [rows, closings, sups, sales] = await Promise.all([SupaEngine.getPurchases(start, end), SupaEngine.getCustodyExpensesRange(start, end),
      SupaEngine.getPurchaseSuppliers().catch(() => purSuppliers), SupaEngine.getSalesRange(start, end).catch(() => [])]);
    purSuppliers = sups || [];
    purSales = sales || [];
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
  const sales = purSalesSummary();
  const counts = { pending: 0, approved: 0, rejected: 0 };
  scoped.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });
  const cats = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map(c => Math.abs(c[1])));
  const sups = Object.entries(s.bySupplier).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const list = purVisible();
  const branches = branchList().concat(PUR_DIRECT);

  view.innerHTML = `
    <div class="cust-card">
      <div class="cust-head">
        <div>
          <h2 class="cust-title">🧾 المشتريات</h2>
          <div class="cust-sub">فواتير يزيد (قوقل فورم) + مصروفات الفروع من العهدة</div>
        </div>
        ${Auth.isOwner() ? `<div class="pur-new-btns"><button type="button" class="cust-btn primary pur-new" id="purScanNew">📷 صوّر فاتورة</button>
          <button type="button" class="cust-btn pur-new" id="purNew">➕ فاتورة</button></div>` : ""}
      </div>
      ${window.PH_DEMO ? `<div class="pur-trial">🧪 نسخة معاينة — الفواتير هنا وهمية</div>`
        : `<div class="pur-trial">🧪 تجربة — الفواتير منسوخة من شيت يزيد وتتحدث تلقائياً. الفورم لسا هو الأساس.</div>`}
      <div class="pur-filters">
        <div class="pur-presets">
          ${[["today", "اليوم"], ["yesterday", "أمس"], ["week", "آخر ٧ أيام"], ["month", "هالشهر"], ["lastmonth", "الشهر الماضي"]].map(([k, label]) =>
            `<button type="button" class="pur-chip ${purPreset === k ? "active" : ""}" data-preset="${k}">${label}</button>`).join("")}
        </div>
        <div class="pur-range">
          <label><small>من</small><input type="date" id="purStartInput" value="${purStart}" max="${purEnd}"></label>
          <label><small>إلى</small><input type="date" id="purEndInput" value="${purEnd}" min="${purStart}"></label>
        </div>
        <select id="purBranchSelect">
          <option value="">كل الفروع</option>
          ${branches.map(b => `<option value="${escHtml(b)}" ${b === purBranch ? "selected" : ""}>${escHtml(b)}${b === PUR_CENTRAL_BRANCH ? " (المطبخ المركزي)" : b === PUR_DIRECT ? " (مو من العهدة)" : ""}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="cust-owner pur-summary">
      <div class="pur-sum-head"><div class="cust-owner-title">📊 ملخص الفترة</div>
        <button type="button" class="cust-btn pur-pdf-btn" id="purSummaryPdf">📄 PDF</button></div>
      <div class="pur-kpis">
        <div class="pur-kpi-sales"><span>إجمالي المبيعات</span><b>${sales.total > 0 ? purSar(sales.total) : "—"}</b></div>
        <div><span>إجمالي المشتريات</span><b>${purSar(s.total)}</b></div>
        <div><span>الضريبة</span><b>${purSar(s.vat)}</b></div>
        <div><span>فواتير المشتريات</span><b>${s.count}</b></div>
        <div><span>فواتير المبيعات</span><b>${sales.count > 0 ? sales.count.toLocaleString("en-US") : "—"}</b></div>
        <div><span>نسبة المشتريات من المبيعات</span><b>${sales.total > 0 ? purPct(s.total, sales.total) : "—"}</b></div>
      </div>
      ${!purBranch && sales.sources.length ? `<div class="pur-sec-title">المبيعات حسب المصدر</div>
        ${sales.sources.map(x => `<div class="pur-bar pur-src"><span class="pur-bar-name">${escHtml(x.name)}</span>
          <span class="pur-bar-track"><i style="width:${Math.round(x.amount / sales.sources[0].amount * 100)}%"></i></span><b>${purSar(x.amount)}</b>
          <small class="pur-bar-pct">${purPct(x.amount, sales.total)} من المبيعات</small></div>`).join("")}` : ""}
      ${sales.total > 0 ? `<div class="pur-sales-note">المبيعات بالفترة ${purSar(sales.total)}${purBranch ? ` (${escHtml(purBranch)})` : " (كل الفروع)"}${sales.missing.length ? ` — ⚠ ناقصة: ${sales.missing.map(escHtml).join("، ")}` : ""}</div>`
        : `<div class="pur-sales-note">⚠ ما فيه مبيعات مسجلة بهالفترة عشان نحسب النسبة</div>`}
      ${s.pendingCount ? `<div class="pur-pending-note">⏳ ${s.pendingCount} بانتظار المراجعة (${purSar(s.pendingTotal)}) — محسوبة بالإجمالي</div>` : ""}
      ${cats.length ? `<div class="pur-sec-title">حسب التصنيف</div>
        ${cats.map(([c, v]) => `<div class="pur-bar"><span class="pur-bar-name">${escHtml(c)}</span>
          <span class="pur-bar-track"><i style="width:${Math.round(Math.abs(v) / maxCat * 100)}%"></i></span><b>${purSar(v)}</b>
          <small class="pur-bar-pct">${purPct(v, s.total)} من المشتريات${sales.total > 0 ? ` · ${purPct(v, sales.total)} من المبيعات` : ""}</small>
          ${PUR_CAT_NOTES[c] ? `<small class="pur-bar-pct pur-cat-note">${escHtml(PUR_CAT_NOTES[c])}</small>` : ""}</div>`).join("")}` : ""}
      ${sups.length ? `<div class="pur-sec-title">أكثر الموردين</div>
        ${sups.map(([n, v]) => `<div class="cust-row"><span>${escHtml(n)}</span><b>${purSar(v)}</b></div>`).join("")}` : ""}
    </div>

    <div class="cust-owner pur-prod">
      <div class="cust-owner-title">🔍 تكلفة المنتجات</div>
      <input type="search" id="purProdSearch" class="pur-prod-input" value="${escHtml(purProdQuery)}" placeholder="اكتب اسم المنتج (مثلاً: دجاج، رز، طماطم)" autocomplete="off">
      <div id="purProdResults">${purProductsHtml(scoped)}</div>
    </div>

    ${purSuppliersHtml(scoped)}

    <div class="pur-chips" role="tablist">
      ${[["pending", `⏳ ${PUR_STATUS.pending}`], ["approved", `✅ ${PUR_STATUS.approved}`], ["rejected", `↩ ${PUR_STATUS.rejected}`], ["all", "الكل"]].map(([k, label]) =>
        `<button type="button" class="pur-chip ${purStatusFilter === k ? "active" : ""}" data-status="${k}">${label}${k === "all" ? "" : ` <small>${counts[k] || 0}</small>`}</button>`).join("")}
    </div>

    <div class="pur-list">
      ${list.length ? purDayGroups(list).map(g => `
        <div class="pur-day-head"><b>${escHtml(g.label)}</b><span>${g.items.length} فاتورة · ${purSar(g.total)}</span></div>
        ${g.items.map(purRowHtml).join("")}`).join("") : `<div class="cust-hint pur-empty">ما فيه فواتير هنا.</div>`}
    </div>
    <datalist id="purSupplierList">${purSuppliers.filter(x => x.active !== false).map(x => `<option value="${escHtml(x.name)}">`).join("")}</datalist>
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
        ${canEdit && Auth.isOwner() ? `<button type="button" class="pur-mini pur-photo" id="purPhoto">📷 ${d.receipt ? "سكان جديد" : "سكان الفاتورة"}</button>` : ""}
      </div>
      ${purExtraHtml(d)}
      ${d.kind === "return" ? `<div class="pur-hint">↩ مرتجع ${original ? `من فاتورة ${escHtml(original.supplier || "")} #${escHtml(original.invoice_no || "")}` : ""} — ينقص من المشتريات</div>` : ""}
      ${d.review_note && d.status === "rejected" ? `<div class="pur-note-shown">ملاحظة المحاسب: ${escHtml(d.review_note)}</div>` : ""}
      <div class="pur-grid">
        ${field("invoice_date", "التاريخ", "date")}
        ${field("invoice_no", "رقم الفاتورة")}
        <label class="pur-field"><span>المورد</span>
          <input type="text" list="purSupplierList" data-f="supplier" value="${escHtml(d.supplier || "")}" ${dis}></label>
        <label class="pur-field"><span>الفرع</span>
          <select data-f="branch" ${dis}>${branchList().concat(PUR_DIRECT).map(b => `<option ${b === d.branch ? "selected" : ""}>${escHtml(b)}</option>`).join("")}</select></label>
        ${field("discount", "الخصم (قبل الضريبة)", "number")}
        <label class="pur-field"><span>الخصم على</span>
          <select data-f="discount_line" ${dis}>
            <option value="">يتوزع على كل الأصناف</option>
            ${(d.lines || []).map((l, i) => `<option value="${i}" ${d.discount_line === i ? "selected" : ""}>${escHtml(l.name || "سطر " + (i + 1))}</option>`).join("")}
          </select></label>
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
            ${l.discount ? `<small class="pur-line-disc">خصم ${purSar(l.discount)} ← الصافي ${purSar(purLineNet(l))}</small>` : ""}
            <div class="pur-line-cat">
              <select data-l="category" ${dis}>${opt(PUR_CATEGORIES, l.category).replace('<option value="">—</option>', '<option value="">— التصنيف —</option>')}</select>
              ${l.cat_check ? `<span class="pur-cat-check" title="القراءة الآلية مو متأكدة — المحاسب يتأكد">⚠ تأكد من التصنيف</span>` : ""}
              ${canEdit ? `<button type="button" class="cust-exp-del" data-del-line="${i}" aria-label="حذف السطر">✕</button>` : ""}
            </div>
          </div>`).join("") || `<div class="cust-hint">ما فيه أصناف.</div>`}
      </div>
      ${canEdit ? `<button type="button" class="cust-add" id="purAddLine">➕ أضف صنف</button>` : ""}
      <div class="pur-lines-sum">مجموع الأصناف: <b>${purSar(purLinesTotal(d))}</b>${purNum(d.discount) ? ` − خصم ${purSar(d.discount)} = <b>${purSar(purLinesTotal(d) - purNum(d.discount))}</b>` : ""}</div>

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
  const reload = () => { purOpenId = ""; purDraft = null; loadPurchases(); };
  if ($("purSummaryPdf")) $("purSummaryPdf").addEventListener("click", (e) => sharePurSummaryPdf(e.currentTarget));
  view.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => { purSetPreset(b.dataset.preset); reload(); }));
  ["purStartInput", "purEndInput"].forEach(id => { if ($(id)) $(id).addEventListener("change", () => {
    const a = $("purStartInput").value, z = $("purEndInput").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(z)) return;
    purStart = a <= z ? a : z; purEnd = a <= z ? z : a; purPreset = ""; reload();
  }); });
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
  if ($("purNew")) $("purNew").addEventListener("click", () => newPurchaseInvoice());
  // فاتورة مباشرة: بتفتح فاتورة جديدة بدون فرع وعلى طول الكاميرا (القراءة الآلية بتعبّي البيانات)
  if ($("purScanNew")) $("purScanNew").addEventListener("click", () => {
    newPurchaseInvoice(PUR_DIRECT);
    const btn = $("purPhoto");
    if (btn) btn.click();
  });
  view.querySelectorAll("[data-supvat]").forEach(inp => inp.addEventListener("change", async () => {
    const name = inp.dataset.supvat, vat_no = inp.value.replace(/\s+/g, "");
    try {
      await SupaEngine.savePurchaseSupplier({ name, vat_no });
      const sup = purSuppliers.find(x => x.name === name); if (sup) sup.vat_no = vat_no;
      showToast("✅ انحفظ الرقم الضريبي");
    } catch (e) { showToast("⚠ ما انحفظ — " + (e.message || e)); }
  }));
  purRenderProducts();
  if ($("purProdSearch")) $("purProdSearch").addEventListener("input", (e) => { purProdQuery = e.target.value; purProdOpen = ""; purRenderProducts(); });
  if ($("purSupToggle")) $("purSupToggle").addEventListener("click", () => { purShowSuppliers = !purShowSuppliers; renderPurchasesView(); });
  if ($("purSupAdd")) $("purSupAdd").addEventListener("click", async () => {
    const name = $("purSupName").value.trim();
    if (!name) { showToast("⚠ اكتب اسم المورد"); return; }
    if (purFindSupplier(name)) { showToast("المورد موجود"); return; }
    try {
      await SupaEngine.savePurchaseSupplier({ name, default_category: $("purSupCat").value });
      purSuppliers.push({ name, default_category: $("purSupCat").value, aliases: [], active: true });
      showToast("✅ انضاف المورد");
      renderPurchasesView();
    } catch (e) { showToast("⚠ ما انضاف — " + (e.message || e)); }
  });
  if (!purDraft) return;

  const refreshChecks = () => {
    // نحدّث الفحوصات ومجموع الأصناف بدون ما نعيد رسم الحقول (عشان الكيبورد ما يسكّر)
    const box = view.querySelector(".pur-detail");
    if (!box) return;
    const w = purchaseChecks(purDraft, purInvoices);
    const old = box.querySelector(".pur-warnings, .pur-ok");
    if (old) old.outerHTML = w.length ? `<div class="pur-warnings"><b>⚠ انتبه قبل الاعتماد:</b><ul>${w.map(x => `<li>${escHtml(x)}</li>`).join("")}</ul></div>` : `<div class="pur-ok">✓ الأرقام متطابقة</div>`;
    const sum = box.querySelector(".pur-lines-sum");
    if (sum) sum.innerHTML = `مجموع الأصناف: <b>${purSar(purLinesTotal(purDraft))}</b>${purNum(purDraft.discount) ? ` − خصم ${purSar(purDraft.discount)} = <b>${purSar(purLinesTotal(purDraft) - purNum(purDraft.discount))}</b>` : ""}`;
  };
  view.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => {
    const k = inp.dataset.f;
    purDraft[k] = inp.type === "number" ? purNum(inp.value) : inp.value;
    if (k === "discount_line") purDraft[k] = inp.value === "" ? null : Number(inp.value);
    if (k === "discount" || k === "discount_line") purApplyDiscount(purDraft);
    if (k === "discount_line") { renderPurchasesView(); return; }
    if (k === "supplier") {
      const sup = purFindSupplier(inp.value);
      if (sup && sup.default_category) (purDraft.lines || []).forEach(l => { if (!l.category) l.category = sup.default_category; });
    }
    refreshChecks();
  }));
  // بعد ما يخلص كتابة الخصم (change) نعيد الرسم عشان يبين نصيب كل صنف
  const discInp = view.querySelector('.pur-detail [data-f="discount"]');
  if (discInp) discInp.addEventListener("change", () => renderPurchasesView());
  view.querySelectorAll("[data-line]").forEach(row => {
    const i = Number(row.dataset.line);
    row.querySelectorAll("[data-l]").forEach(inp => inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => {
      const k = inp.dataset.l, line = purDraft.lines[i];
      line[k] = inp.type === "number" ? purNum(inp.value) : inp.value;
      if (k === "category") { delete line.cat_check; renderPurchasesView(); return; }
      // الكمية × السعر يعبّي المجموع لحاله إذا المجموع فاضي
      if ((k === "qty" || k === "unit_price") && purNum(line.qty) !== null && purNum(line.unit_price) !== null) {
        const tot = row.querySelector('[data-l="total"]');
        if (tot && (tot.value === "" || tot.dataset.auto === "1")) { line.total = purRound(line.qty * line.unit_price); tot.value = line.total; tot.dataset.auto = "1"; }
      }
      if (k === "total") inp.dataset.auto = "";
      if (k === "total" || k === "qty" || k === "unit_price") purApplyDiscount(purDraft);
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
  if ($("purPhoto")) $("purPhoto").addEventListener("click", () => {
    const draft = purDraft;
    if (!draft) return;
    DocScan.open({ ai: true, onDone: async ({ dataUrl, qr, ai, aiLater }) => {
      // البيانات المقروءة تنحط أول — لو فشل رفع الصورة ما تضيع
      // القراءة الآلية هي الأساس، والـ QR يعبّي الناقص بس
      purFillFromAi(draft, ai);
      const before = { supplier: draft.supplier, invoice_date: draft.invoice_date, total: draft.total, vat: draft.vat, subtotal: draft.subtotal };
      purFillFromQr(draft, qr);
      const fromQr = Object.keys(before).filter(k => draft[k] !== before[k]);
      if (purDraft === draft) renderPurchasesView();
      // القراءة الآلية وصلت بعد ما ضغط «استخدم» → تعبّي الفاضي وتستبدل اللي جا من الـ QR (إذا ما انعدّل)
      if (aiLater) aiLater.then((late) => {
        if (!late || late.error) return;
        const qrVals = {};
        fromQr.forEach(k => { qrVals[k] = draft[k]; draft[k] = ""; });
        purFillFromAi(draft, late);
        fromQr.forEach(k => { if (draft[k] === "" || draft[k] === null || draft[k] === undefined) draft[k] = qrVals[k]; });
        if (purDraft === draft) renderPurchasesView();
      }).catch(() => {});
      const read = (qr && qr.seller) || (ai && !ai.error);
      try {
        showToast("⏳ جاري رفع الصورة…");
        draft.receipt = await SupaEngine.uploadReceipt(draft.invoice_date || todayStr(), draft.branch || PUR_CENTRAL_BRANCH, dataUrl);
        if (purDraft === draft) renderPurchasesView();
        showToast(read ? "✅ انرفعت وانقرت بيانات الفاتورة — راجعها واحفظ" : "✅ انرفعت الصورة — لا تنسى تحفظ");
      } catch (err) {
        showToast("⚠ ما انرفعت الصورة — " + (err.message || err));
      }
    } });
  });
  view.querySelectorAll(".pur-detail [data-receipt]").forEach(btn => btn.addEventListener("click", () => openCustodyReceipt(btn.dataset.receipt)));
}

// رمز QR الفاتورة الضريبية → نعبّي الفاضي بس (ما نغيّر شي كتبه أحد)
function purFillFromQr(d, qr) {
  if (!qr || !qr.seller) return;
  const empty = (v) => v === null || v === undefined || String(v).trim() === "";
  if (empty(d.supplier)) d.supplier = qr.seller;
  if (empty(d.invoice_date) && qr.date) d.invoice_date = qr.date;
  if (empty(d.total) && qr.total !== null) d.total = qr.total;
  if (empty(d.vat) && qr.vat !== null) d.vat = qr.vat;
  if (empty(d.subtotal) && qr.total !== null && qr.vat !== null) d.subtotal = purRound(qr.total - qr.vat);
  if (qr.vatNo) d.extra = { ...(d.extra || {}), supplier_vat: (d.extra && d.extra.supplier_vat) || qr.vatNo };
}

// سطر من القراءة الآلية: التصنيف من قائمة المشتريات، وإذا مو متأكد نعلّمه للمحاسب
function purAiLine(l, sup) {
  const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
  const cat = PUR_CATEGORIES.includes(l.category) ? l.category : ((sup && sup.default_category) || "");
  const line = { name: String(l.name || "").trim(), qty: num(l.qty), unit: String(l.unit || "").trim(), unit_price: num(l.unit_price), total: num(l.total), category: cat };
  if (!cat || l.category_sure === false || !PUR_CATEGORIES.includes(l.category)) line.cat_check = true;
  return line;
}

// قراءة الذكاء الاصطناعي → رقم الفاتورة والأصناف وأي خانة فاضية (المبالغ من الـ QR أولى)
function purFillFromAi(d, a) {
  if (!a || a.error) return;
  const empty = (v) => v === null || v === undefined || String(v).trim() === "";
  const num = (v) => (empty(v) || isNaN(Number(v)) ? null : Number(v));
  if (empty(d.supplier) && a.supplier) d.supplier = a.supplier;
  if (empty(d.invoice_no) && a.invoice_no) d.invoice_no = String(a.invoice_no);
  if (empty(d.invoice_date) && a.date) d.invoice_date = a.date;
  if (empty(d.subtotal) && num(a.subtotal) !== null) d.subtotal = num(a.subtotal);
  if (empty(d.vat) && num(a.vat) !== null) d.vat = num(a.vat);
  if (empty(d.total) && num(a.total) !== null) d.total = num(a.total);
  if (empty(d.discount) && num(a.discount)) d.discount = num(a.discount);
  if (a.supplier_vat) d.extra = { ...(d.extra || {}), supplier_vat: (d.extra && d.extra.supplier_vat) || a.supplier_vat };
  const hasLines = (d.lines || []).some(l => String(l.name || "").trim());
  if (!hasLines && Array.isArray(a.lines) && a.lines.length) {
    const sup = purFindSupplier(d.supplier || "");
    d.lines = a.lines.filter(l => l && typeof l === "object").slice(0, 60).map(l => purAiLine(l, sup));
  }
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
  if (Number.isInteger(row.discount_line) && !row.lines[row.discount_line]) row.discount_line = null;
  purApplyDiscount(row);
  purBusy = true;
  try {
    await SupaEngine.savePurchase(row);
    const supName = String(row.supplier || "").trim();
    if (supName && Auth.isOwner() && !purFindSupplier(supName)) {
      const cat = (row.lines || []).map(l => l.category).find(Boolean) || "";
      await SupaEngine.savePurchaseSupplier({ name: supName, default_category: cat }).catch(() => {});
    }
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

function newPurchaseInvoice(branch) {
  const emp = Auth.getEmployee();
  const inv = {
    id: purNewId(), source: "site", kind: "invoice", invoice_date: todayStr(), invoice_no: "", supplier: "",
    branch: branch || PUR_CENTRAL_BRANCH, subtotal: null, vat: null, total: null,
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

function purFindSupplier(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  return purSuppliers.find(x => x.name === n || (x.aliases || []).includes(n)) || null;
}

// مستند الفاتورة (رابط Drive من شيت يزيد) + الدفع وملاحظة يزيد
function purExtraHtml(d) {
  const e = d.extra || {};
  const bits = [e.doc_type, e.payment_method && `الدفع: ${e.payment_method}`, e.pay_status && `السداد: ${e.pay_status}`,
    e.remaining > 0 && `المتبقي ${purSar(e.remaining)}`].filter(Boolean);
  const note = e.form_review && e.form_review !== "سليم" ? e.form_review : "";
  if (!e.doc_link && !bits.length && !note && !e.supplier_original) return "";
  return `<div class="pur-extra">
    ${e.doc_link && /^https:\/\//.test(e.doc_link) ? `<a class="cust-receipt-btn" href="${escHtml(e.doc_link)}" target="_blank" rel="noopener">📄 مستند الفاتورة</a>` : ""}
    ${bits.length ? `<small>${bits.map(escHtml).join(" · ")}</small>` : ""}
    ${note ? `<small class="pur-extra-note">ملاحظة الشيت: ${escHtml(note)}</small>` : ""}
    ${e.supplier_original ? `<small>الاسم بالشيت: ${escHtml(e.supplier_original)}</small>` : ""}
  </div>`;
}

// ---- بحث تكلفة المنتجات: كل مشتريات المنتج بالفترة (والفرع المختار) — الكمية، المبلغ، متوسط السعر وآخر سعر ----
const purNormName = (t) => String(t || "").replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
  .replace(/\s+/g, " ").trim().toLowerCase();

function purProductGroups(scoped, query) {
  const words = purNormName(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const groups = {};
  scoped.forEach(inv => {
    if (inv.status === "rejected") return;
    const sign = purSign(inv);
    (inv.lines || []).forEach(l => {
      const name = String(l.name || "").trim();
      const key = purNormName(name);
      if (!key || !words.every(w => key.includes(w))) return;
      const unit = String(l.unit || "").trim();
      const gk = key + "|" + unit;
      const g = groups[gk] || (groups[gk] = { key: gk, name, unit, qty: 0, spent: 0, buys: [] });
      const qty = Number(l.qty) || 0, net = purLineNet(l);
      g.qty += qty * sign; g.spent = purRound(g.spent + net * sign);
      g.buys.push({ id: inv.id, date: inv.invoice_date || "", supplier: inv.supplier || "", branch: inv.branch || "", qty: qty * sign, unit,
        price: qty ? purRound(net / qty) : purNum(l.unit_price) || 0, total: purRound(net * sign), status: inv.status });
    });
  });
  return Object.values(groups).map(g => {
    g.buys.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const prices = g.buys.filter(b => b.qty > 0 && b.price > 0).map(b => b.price);
    g.avg = g.qty > 0 ? purRound(g.spent / g.qty) : 0;
    g.min = prices.length ? Math.min(...prices) : 0;
    g.max = prices.length ? Math.max(...prices) : 0;
    g.last = g.buys.find(b => b.qty > 0 && b.price > 0) || null;
    return g;
  }).sort((a, b) => b.spent - a.spent);
}

function purProductsHtml(scoped) {
  if (!purProdQuery.trim()) return `<div class="cust-hint">ابحث عن أي منتج وبيطلعلك كم اشترينا منه بالفترة، بكم، ومتوسط سعره وآخر سعر.</div>`;
  const groups = purProductGroups(scoped, purProdQuery);
  if (!groups.length) return `<div class="cust-hint">ما لقينا «${escHtml(purProdQuery.trim())}» بمشتريات هالفترة — جرّب كلمة ثانية أو وسّع الفترة.</div>`;
  const all = purRound(groups.reduce((t, g) => t + g.spent, 0));
  const fmtQ = (n) => (Math.round(n * 100) / 100).toLocaleString("en-US");
  const fmtD = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString(phLocale(), { day: "numeric", month: "numeric", timeZone: "UTC" }) : "—");
  return `<div class="pur-prod-total">${groups.length} منتج · المجموع ${purSar(all)} <small>(قبل الضريبة)</small></div>
    ${groups.slice(0, 40).map(g => {
      const open = purProdOpen === g.key;
      return `<div class="pur-prod-item ${open ? "open" : ""}">
        <button type="button" class="pur-prod-row" data-prod="${escHtml(g.key)}">
          <span class="pur-prod-name">${escHtml(g.name)}${g.unit ? ` <small>/ ${escHtml(g.unit)}</small>` : ""}</span>
          <b>${purSar(g.spent)}</b>
          <small class="pur-prod-meta">${fmtQ(g.qty)} ${escHtml(g.unit)} · ${g.buys.length} مرة · متوسط ${purSar(g.avg)}${g.last ? ` · آخر سعر ${purSar(g.last.price)} (${fmtD(g.last.date)})` : ""}${g.max > g.min ? ` · من ${purSar(g.min)} إلى ${purSar(g.max)}` : ""}</small>
        </button>
        ${open ? `<div class="pur-prod-buys">${g.buys.map(b => `<div class="cust-row"><span>${fmtD(b.date)} · ${escHtml(b.supplier || "—")}${purBranch ? "" : ` <small>· ${escHtml(b.branch)}</small>`}${b.status === "pending" ? ` <small>⏳</small>` : ""}<br>
          <small>${fmtQ(b.qty)} ${escHtml(b.unit)} × ${purSar(b.price)}</small></span><b>${purSar(b.total)}</b></div>`).join("")}</div>` : ""}
      </div>`;
    }).join("")}
    ${groups.length > 40 ? `<div class="cust-hint">وفيه ${groups.length - 40} غيرهم — اكتب الاسم أدق.</div>` : ""}`;
}

// تحديث النتائج بس (عشان ما يروح المؤشر من خانة البحث)
function purRenderProducts() {
  const box = document.getElementById("purProdResults");
  if (!box) return;
  box.innerHTML = purProductsHtml(purInvoices.filter(i => !purBranch || i.branch === purBranch));
  box.querySelectorAll("[data-prod]").forEach(b => b.addEventListener("click", () => {
    purProdOpen = purProdOpen === b.dataset.prod ? "" : b.dataset.prod;
    purRenderProducts();
  }));
}

// قائمة الموردين: كل الموردين بأسمائهم + كم فاتورة لكل واحد بالفترة، والمالك يضيف مورد جديد
function purSuppliersHtml(scoped) {
  const counts = {};
  scoped.forEach(i => { const n = String(i.supplier || "").trim(); if (n) counts[n] = (counts[n] || 0) + 1; });
  const list = purSuppliers.filter(x => x.active !== false);
  return `
    <div class="cust-owner pur-suppliers">
      <button type="button" class="pur-sup-toggle" id="purSupToggle">🏪 الموردين (${list.length}) ${purShowSuppliers ? "▲" : "▼"}</button>
      ${purShowSuppliers ? `
        <div class="pur-sup-list">
          ${list.map(x => `<div class="cust-row pur-sup-row"><span>${escHtml(x.name)}${x.default_category ? ` <small>· ${escHtml(x.default_category)}</small>` : ""}
              ${Auth.isOwner() ? `<input type="text" inputmode="numeric" class="pur-sup-vat" data-supvat="${escHtml(x.name)}" value="${escHtml(x.vat_no || "")}" placeholder="الرقم الضريبي">`
                : x.vat_no ? `<small>ض: ${escHtml(x.vat_no)}</small>` : ""}</span><b>${counts[x.name] || ""}</b></div>`).join("")
            || `<div class="cust-hint">ما فيه موردين.</div>`}
        </div>
        ${Auth.isOwner() ? `<div class="pur-sup-add">
          <input type="text" id="purSupName" placeholder="اسم مورد جديد">
          <select id="purSupCat"><option value="">التصنيف</option>${PUR_CATEGORIES.map(c => `<option>${escHtml(c)}</option>`).join("")}</select>
          <button type="button" class="cust-btn primary" id="purSupAdd">➕ أضف</button>
        </div>` : ""}` : ""}
    </div>`;
}

// أزرار الفترة السريعة
function purSetPreset(k) {
  const t = todayStr();
  purPreset = k;
  if (k === "today") { purStart = purEnd = t; }
  else if (k === "yesterday") { purStart = purEnd = addDaysStr(t, -1); }
  else if (k === "week") { purStart = addDaysStr(t, -6); purEnd = t; }
  else if (k === "lastmonth") {
    const [y, m] = t.split("-").map(Number);
    const pm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    ({ start: purStart, end: purEnd } = purMonthRange(pm));
  } else { purPreset = "month"; ({ start: purStart, end: purEnd } = purMonthRange(t.slice(0, 7))); }
}

// ترتيب يومي: كل يوم لحاله (الأحدث فوق) مع عدد فواتيره ومجموعه
function purDayGroups(list) {
  const groups = [];
  list.forEach(inv => {
    const d = inv.invoice_date || "";
    let g = groups.find(x => x.date === d);
    if (!g) {
      const label = d ? new Date(d + "T12:00:00Z").toLocaleDateString(phLocale(), { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" }) : "بدون تاريخ";
      g = { date: d, label, items: [], total: 0 };
      groups.push(g);
    }
    g.items.push(inv);
    if (inv.status !== "rejected") g.total = purRound(g.total + purInvoiceTotal(inv) * purSign(inv));
  });
  return groups.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

const purPct = (part, whole) => (whole ? `${(Math.round(part / whole * 1000) / 10).toLocaleString("en-US")}٪` : "—");

// مبيعات الفترة (كل الفروع أو الفرع المختار) + الفروع اللي مبيعاتها ناقصة بالفترة
function purSalesSummary() {
  const today = todayStr();
  const end = purEnd < today ? purEnd : today;
  let days = 0;
  for (let d = purStart; d <= end; d = addDaysStr(d, 1)) days++;
  const branches = purBranch ? [purBranch] : branchList();
  const byBranch = {}, amountBy = {};
  let total = 0, count = 0;
  purSales.forEach(r => {
    // «عبداللطيف جميل — فاتورة الدعم» (الـ٢٠٪ اللي يدفعونها شهرياً) تنحسب مع مبيعات الفرع نفسه
    const br = String(r.branch || "").split(" — ")[0];
    if (purBranch && br !== purBranch) return;
    total += Number(r.amount) || 0;
    count += Number(r.transactions) || 0;
    amountBy[br] = (amountBy[br] || 0) + (Number(r.amount) || 0);
    if (br !== r.branch) return; // فاتورة الشهر ما تخلّي أيام الفرع «مكتملة»
    (byBranch[r.branch] = byBranch[r.branch] || new Set()).add(r.date);
  });
  // فرع ما له ولا يوم مبيعات = ناقص (أيام الإجازة الطبيعية ما تنحسب نقص)
  const missing = branches.filter(b => !(byBranch[b] && byBranch[b].size)).concat(
    branches.filter(b => byBranch[b] && byBranch[b].size && days > 6 && byBranch[b].size < days / 2).map(b => `${b} (${byBranch[b].size} يوم من ${days})`));
  // توزيع المبيعات حسب المصدر (كل فرع + اشتراكات تكرار) — الأكبر أول
  const sources = Object.entries(amountBy).filter(([, v]) => v).sort((a, b) => b[1] - a[1])
    .map(([b, v]) => ({ name: b === "تكرار" ? "اشتراكات تكرار" : b, amount: purRound(v) }));
  // تكرار مو فرع بالقائمة — ما ينحسب «ناقص» لو ما له مبيعات
  return { total: purRound(total), count, missing: missing.filter(b => b !== "تكرار"), sources };
}

// ---- ملخص الفترة PDF (A4 طولي): نفس الكرت اللي على الشاشة مع ترويسة الفترة والفرع ----
async function sharePurSummaryPdf(btn) {
  const card = document.querySelector(".pur-summary");
  if (!card) return;
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳";
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;background:#fff;padding:28px 34px;box-sizing:border-box;direction:rtl;";
  try {
    await loadPdfLibs();
    if (!window.html2canvas || !window.jspdf) throw new Error("مكتبة PDF ما تحمّلت — تأكد من النت");
    const period = purStart === purEnd ? purStart : `${purStart} → ${purEnd}`;
    stage.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px;">
        <div><b style="font-size:20px;">ملخص المشتريات</b><div style="font-size:13px;color:#444;"><span dir="ltr">${escHtml(period)}</span> · ${escHtml(purBranch || "كل الفروع")}</div></div>
        <img src="assets/logo.png" style="height:44px;" alt=""></div>`;
    const clone = card.cloneNode(true);
    clone.querySelectorAll(".pur-pdf-btn").forEach(b => b.remove());
    clone.style.boxShadow = "none";
    stage.appendChild(clone);
    document.body.appendChild(stage);
    await new Promise(r => setTimeout(r, 300));
    const canvas = await html2canvas(stage, { scale: 2, backgroundColor: "#ffffff", logging: false });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const pageH = Math.floor(canvas.width * 297 / 210); // ارتفاع صفحة A4 بالبكسل
    for (let y = 0, first = true; y < canvas.height; y += pageH, first = false) {
      const part = document.createElement("canvas");
      part.width = canvas.width; part.height = Math.min(pageH, canvas.height - y);
      const ctx = part.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, part.width, part.height);
      ctx.drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
      if (!first) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, part.height * 210 / canvas.width);
    }
    const name = `ملخص_المشتريات_${purStart}_${purEnd}${purBranch ? "_" + purBranch : ""}.pdf`;
    const file = new File([pdf.output("blob")], name, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "ملخص المشتريات" }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast("✅ نزل الـ PDF");
  } catch (e) {
    showToast("⚠ " + (e.message || e));
  } finally {
    stage.remove();
    btn.disabled = false; btn.textContent = label;
  }
}
