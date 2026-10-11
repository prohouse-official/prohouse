// ==================== تقرير المحاسب: المشتريات/المرتجعات + المبيعات/المرتجعات (ضريبي) ====================
// نفس ورقة المحاسب: لكل فاتورة مشتريات — التاريخ، رقم فاتورة المورد، اسم المورد، الرقم الضريبي، نوع التوريد،
// الإجمالي قبل الضريبة، الضريبة، بعد الضريبة. والمبيعات — التاريخ، رقم الفاتورة، الفرع، العميل، الرقم الضريبي، قبل/الضريبة/بعد.
// المبيعات من طرق الدفع اليومية (تابسنس وفوديكس) — صف لكل فرع بكل يوم، والمبالغ شاملة الضريبة ١٥٪.

let acctStart = "";
let acctEnd = "";
let acctData = null; // { purchases, returns, sales }
let acctSeq = 0;

function acctSetMonth(offset) {
  const t = todayStr();
  let [y, m] = t.split("-").map(Number);
  m += offset;
  while (m < 1) { m += 12; y--; }
  const mm = `${y}-${String(m).padStart(2, "0")}`;
  acctStart = mm + "-01";
  acctEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// نوع التوريد: تصنيفات أصناف الفاتورة (الأكبر مبلغاً أول)
function acctSupplyType(inv) {
  const by = {};
  (inv.lines || []).forEach(l => {
    const c = l.category || "أخرى";
    by[c] = (by[c] || 0) + Math.abs(typeof purLineNet === "function" ? purLineNet(l) : Number(l.total) || 0);
  });
  return Object.entries(by).sort((a, b) => b[1] - a[1]).map(x => x[0]).join("، ") || "—";
}

function acctPurchaseRow(inv, sups) {
  const total = Math.abs(purInvoiceTotal(inv));
  const vat = Math.abs(purNum(inv.vat) || 0);
  const sub = purNum(inv.subtotal) !== null ? Math.abs(purNum(inv.subtotal)) : purRound(total - vat);
  const sup = sups.find(s => s.name === inv.supplier || (s.aliases || []).includes(inv.supplier));
  return {
    date: inv.invoice_date || "", no: inv.invoice_no || "", supplier: inv.supplier || "",
    vatNo: (inv.extra && inv.extra.supplier_vat) || (sup && sup.vat_no) || "",
    type: acctSupplyType(inv), sub: purRound(sub), vat: purRound(vat), total: purRound(total), status: inv.status
  };
}

async function loadAcctReport() {
  const view = document.getElementById("acctReportView");
  if (!view) return;
  if (!acctStart || !acctEnd) acctSetMonth(0);
  const s = document.getElementById("acctStart"), e = document.getElementById("acctEnd");
  if (s) s.value = acctStart;
  if (e) e.value = acctEnd;
  const seq = ++acctSeq;
  view.innerHTML = '<div class="loader">جاري تجهيز تقرير المحاسب…</div>';
  try {
    const [invoices, sups, sales] = await Promise.all([
      SupaEngine.getPurchases(acctStart, acctEnd),
      SupaEngine.getPurchaseSuppliers().catch(() => []),
      SupaEngine.getSalesRange(acctStart, acctEnd).catch(() => [])
    ]);
    if (seq !== acctSeq) return;
    const valid = (invoices || []).filter(i => i.status !== "rejected")
      .sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)) || String(a.invoice_no).localeCompare(String(b.invoice_no)));
    const byDay = {};
    (sales || []).forEach(r => {
      const k = r.date + "|" + r.branch;
      byDay[k] = (byDay[k] || 0) + (Number(r.amount) || 0);
    });
    const salesRows = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).map(([k, amt]) => {
      const [date, branch] = k.split("|");
      const total = purRound(amt);
      const sub = purRound(total / (1 + PUR_VAT_RATE));
      return { date, no: `${date.replace(/-/g, "")}-${branchCode(branch)}`, branch, customer: "عملاء نقدي (مبيعات اليوم)", vatNo: "", sub, vat: purRound(total - sub), total };
    }).filter(r => r.total);
    acctData = {
      purchases: valid.filter(i => i.kind !== "return").map(i => acctPurchaseRow(i, sups || [])),
      returns: valid.filter(i => i.kind === "return").map(i => acctPurchaseRow(i, sups || [])),
      sales: salesRows, salesReturns: []
    };
    renderAcctReport();
  } catch (err) {
    if (seq !== acctSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر تجهيز التقرير — ${escHtml(err.message || String(err))}</div>`;
  }
}

function branchCode(b) {
  return { "الروضة": "R", "الشاطئ": "S", "عبداللطيف جميل": "A" }[b] || "B";
}

const acctSum = (rows) => rows.reduce((t, r) => ({ sub: purRound(t.sub + r.sub), vat: purRound(t.vat + r.vat), total: purRound(t.total + r.total) }), { sub: 0, vat: 0, total: 0 });
const acctN = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function acctTable(title, head, rows, cells, empty) {
  const t = acctSum(rows);
  return `
    <div class="acct-sec">
      <div class="acct-title">${title} <small>${rows.length}</small></div>
      ${rows.length ? `<div class="acct-scroll"><table class="acct-table">
        <thead><tr><th>م</th>${head.map(h => `<th>${h}</th>`).join("")}<th>الإجمالي قبل الضريبة</th><th>الضريبة</th><th>الإجمالي بعد الضريبة</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="${r.status === "pending" ? "acct-pending" : ""}"><td>${i + 1}</td>${cells(r).map(c => `<td>${escHtml(String(c))}</td>`).join("")}
          <td>${acctN(r.sub)}</td><td>${acctN(r.vat)}</td><td>${acctN(r.total)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="${head.length + 1}">الإجمالي</td><td>${acctN(t.sub)}</td><td>${acctN(t.vat)}</td><td>${acctN(t.total)}</td></tr></tfoot>
      </table></div>` : `<div class="cust-hint">${empty}</div>`}
    </div>`;
}

const ACCT_PUR_HEAD = ["التاريخ", "رقم فاتورة المورد", "اسم المورد", "الرقم الضريبي", "نوع التوريد"];
const ACCT_PUR_CELLS = (r) => [r.date, r.no || "—", r.supplier || "—", r.vatNo || "—", r.type];
const ACCT_SALE_HEAD = ["التاريخ", "رقم الفاتورة", "الفرع", "اسم العميل", "الرقم الضريبي للعميل"];
const ACCT_SALE_CELLS = (r) => [r.date, r.no, r.branch, r.customer, r.vatNo || "—"];

function renderAcctReport() {
  const view = document.getElementById("acctReportView");
  if (!view || !acctData) return;
  const d = acctData;
  const p = acctSum(d.purchases), pr = acctSum(d.returns), s = acctSum(d.sales);
  const pending = d.purchases.filter(r => r.status === "pending").length;
  const noVat = d.purchases.filter(r => !r.vatNo && r.vat > 0).length;
  view.innerHTML = `
    <div class="acct-kpis">
      <div><span>ضريبة المبيعات</span><b>${acctN(s.vat)}</b></div>
      <div><span>ضريبة المشتريات (صافي المرتجع)</span><b>${acctN(purRound(p.vat - pr.vat))}</b></div>
      <div><span>الصافي المستحق</span><b>${acctN(purRound(s.vat - (p.vat - pr.vat)))}</b></div>
    </div>
    ${pending ? `<div class="pur-pending-note">⏳ ${pending} فاتورة مشتريات لسا بانتظار المراجعة (ظاهرة بالأصفر)</div>` : ""}
    ${noVat ? `<div class="pur-sales-note">⚠ ${noVat} فاتورة فيها ضريبة بدون رقم ضريبي للمورد — حطه من قائمة الموردين بصفحة المشتريات</div>` : ""}
    ${acctTable("🧾 المشتريات", ACCT_PUR_HEAD, d.purchases, ACCT_PUR_CELLS, "ما فيه مشتريات بهالفترة.")}
    ${acctTable("↩ مرتجعات المشتريات", ACCT_PUR_HEAD, d.returns, ACCT_PUR_CELLS, "ما فيه مرتجعات مشتريات.")}
    ${acctTable("💰 المبيعات", ACCT_SALE_HEAD, d.sales, ACCT_SALE_CELLS, "ما فيه مبيعات مسجلة بهالفترة.")}
    ${acctTable("↩ مرتجعات المبيعات", ACCT_SALE_HEAD, d.salesReturns, ACCT_SALE_CELLS, "ما فيه مرتجعات مبيعات مسجلة.")}
    <div class="pur-sales-note">المبيعات: صف لكل فرع بكل يوم من طرق الدفع (تابسنس وفوديكس)، والمبالغ شاملة ضريبة ١٥٪.</div>`;
}

async function exportAcctExcel() {
  if (!acctData) { showToast("جهّز التقرير أول"); return; }
  await loadReportLibs();
  if (typeof ExcelJS === "undefined") { showToast("مكتبة Excel ما تحمّلت — تأكد من الاتصال بالنت"); return; }
  const wb = new ExcelJS.Workbook();
  const add = (name, head, rows, cells, widths) => {
    const sh = wb.addWorksheet(name);
    sh.addRow(["م", ...head, "الإجمالي قبل الضريبة", "الضريبة", "الإجمالي بعد الضريبة"]);
    rows.forEach((r, i) => sh.addRow([i + 1, ...cells(r), r.sub, r.vat, r.total]));
    const t = acctSum(rows);
    sh.addRow(["الإجمالي", ...head.map(() => ""), t.sub, t.vat, t.total]);
    styleExcelSheet(sh, widths);
    sh.getRow(sh.rowCount).font = { bold: true };
  };
  const pw = [6, 12, 18, 30, 18, 22, 18, 14, 18];
  add("المشتريات", ACCT_PUR_HEAD, acctData.purchases, ACCT_PUR_CELLS, pw);
  add("مرتجعات المشتريات", ACCT_PUR_HEAD, acctData.returns, ACCT_PUR_CELLS, pw);
  add("المبيعات", ACCT_SALE_HEAD, acctData.sales, ACCT_SALE_CELLS, [6, 12, 16, 16, 26, 18, 18, 14, 18]);
  add("مرتجعات المبيعات", ACCT_SALE_HEAD, acctData.salesReturns, ACCT_SALE_CELLS, [6, 12, 16, 16, 26, 18, 18, 14, 18]);
  await downloadWorkbook(wb, `تقرير_المحاسب_${acctStart}_${acctEnd}.xlsx`);
}

function initAcctReportControls() {
  const $ = (id) => document.getElementById(id);
  if (!$("acctReportControls")) return;
  [["acctThisMonth", 0], ["acctLastMonth", -1]].forEach(([id, off]) => $(id).addEventListener("click", () => { acctSetMonth(off); loadAcctReport(); }));
  ["acctStart", "acctEnd"].forEach(id => $(id).addEventListener("change", () => {
    const a = $("acctStart").value, z = $("acctEnd").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(z)) return;
    acctStart = a <= z ? a : z; acctEnd = a <= z ? z : a;
    loadAcctReport();
  }));
  $("acctExportBtn").addEventListener("click", exportAcctExcel);
}
