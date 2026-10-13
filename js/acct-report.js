// ==================== تقرير المحاسب: المشتريات/المرتجعات + المبيعات/المرتجعات (ضريبي) ====================
// نفس ورقة المحاسب: لكل فاتورة مشتريات — التاريخ، رقم فاتورة المورد، اسم المورد، الرقم الضريبي، نوع التوريد،
// الإجمالي قبل الضريبة، الضريبة، بعد الضريبة. والمبيعات — التاريخ، رقم الفاتورة، الفرع، العميل، الرقم الضريبي، قبل/الضريبة/بعد.
// المبيعات من طرق الدفع اليومية (تابسنس وفوديكس) — صف لكل فرع بكل يوم، والمبالغ شاملة الضريبة ١٥٪.

let acctStart = "";
let acctEnd = "";
let acctData = null; // { purchases, returns, sales }
let acctSeq = 0;
let acctKind = "all"; // all | sales | sreturns | purchases
const ACCT_KIND_NAME = { all: "تقرير_المحاسب", sales: "تقرير_المبيعات", sreturns: "تقرير_مردودات_المبيعات", purchases: "تقرير_المشتريات" };
const acctShow = (k) => acctKind === "all" || acctKind === k;

function acctSetQuarter(offset) {
  const [y0, m0] = todayStr().split("-").map(Number);
  let q = Math.floor((m0 - 1) / 3) + offset, y = y0;
  while (q < 0) { q += 4; y--; }
  const sm = q * 3 + 1;
  acctStart = `${y}-${String(sm).padStart(2, "0")}-01`;
  acctEnd = new Date(Date.UTC(y, sm + 2, 0)).toISOString().slice(0, 10);
}

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
  acctData = null; // ما نصدّر بيانات فترة قديمة باسم الفترة الجديدة
  view.innerHTML = '<div class="loader">جاري تجهيز تقرير المحاسب…</div>';
  try {
    const [invoices, sups, sales] = await Promise.all([
      SupaEngine.getPurchases(acctStart, acctEnd),
      SupaEngine.getPurchaseSuppliers().catch(() => []),
      // فشل جلب المبيعات ما يطلع تقرير مبيعات فاضي بصمت — نعلّمه ونبيّن تحذير
      SupaEngine.getSalesRange(acctStart, acctEnd).catch(() => null)
    ]);
    if (seq !== acctSeq) return;
    const valid = (invoices || []).filter(i => i.status !== "rejected")
      .sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)) || String(a.invoice_no).localeCompare(String(b.invoice_no)));
    const byCh = {};
    (sales || []).forEach(r => {
      const k = r.date + "|" + r.branch + "|" + (r.channel || "—");
      byCh[k] = (byCh[k] || 0) + (Number(r.amount) || 0) + Math.abs(Number(r.returns_amount) || 0); // إجمالي مثل جدول المبيعات
    });
    const salesByChannel = Object.entries(byCh).sort((a, b) => a[0].localeCompare(b[0])).map(([k, amt]) => {
      const [date, branch, channel] = k.split("|");
      return { date, branch, channel, total: purRound(amt) };
    }).filter(r => r.total);
    // فوديكس يعطينا الصافي بعد المرتجعات + مبلغ المرتجعات لحاله:
    // المبيعات = الصافي + المرتجع (إجمالي قبل المرتجعات)، والمردودات صف لحاله، فالصافي للضريبة يضل صح
    const byDay = {}, retByDay = {};
    (sales || []).forEach(r => {
      const k = r.date + "|" + r.branch, ret = Math.abs(Number(r.returns_amount) || 0);
      byDay[k] = (byDay[k] || 0) + (Number(r.amount) || 0) + ret;
      if (ret) retByDay[k] = (retByDay[k] || 0) + ret;
    });
    const salesReturns = Object.entries(retByDay).sort((a, b) => a[0].localeCompare(b[0])).map(([k, amt]) => {
      const [date, branch] = k.split("|");
      const total = purRound(amt), sub = purRound(total / (1 + PUR_VAT_RATE));
      return { date, no: `R${date.replace(/-/g, "")}-${branchCode(branch)}`, branch, customer: "مرتجع مبيعات (من نقطة البيع)", vatNo: "", sub, vat: purRound(total - sub), total };
    });
    const salesRows = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).map(([k, amt]) => {
      const [date, branch] = k.split("|");
      const total = purRound(amt);
      const sub = purRound(total / (1 + PUR_VAT_RATE));
      return { date, no: `${date.replace(/-/g, "")}-${branchCode(branch)}`, branch, customer: branch === "تكرار" ? "عملاء اشتراكات تكرار (أونلاين)" : /فاتورة الدعم/.test(branch) ? "عبداللطيف جميل (فاتورة دعم ٢٠٪ الشهرية)" : "عملاء نقدي (مبيعات اليوم)", vatNo: "", sub, vat: purRound(total - sub), total };
    }).filter(r => r.total);
    acctData = {
      purchases: valid.filter(i => i.kind !== "return").map(i => acctPurchaseRow(i, sups || [])),
      returns: valid.filter(i => i.kind === "return").map(i => acctPurchaseRow(i, sups || [])),
      sales: salesRows, salesReturns, salesByChannel, salesFailed: sales === null
    };
    renderAcctReport();
  } catch (err) {
    if (seq !== acctSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر تجهيز التقرير — ${escHtml(err.message || String(err))}</div>`;
  }
}

function branchCode(b) {
  return { "الروضة": "R", "الشاطئ": "S", "عبداللطيف جميل": "A", "تكرار": "T", "عبداللطيف جميل — فاتورة الدعم": "AJ" }[b] || "B";
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

// ملخص المبيعات حسب طريقة الدفع لكل فرع (الاشتراكات، وجبات الموظفين… عشان المحاسب يقرر وش يحسب)
function acctChannelTotals(rows) {
  const t = {};
  rows.forEach(r => { const k = r.branch + "|" + r.channel; t[k] = purRound((t[k] || 0) + r.total); });
  return Object.entries(t).map(([k, total]) => { const [branch, channel] = k.split("|"); return { branch, channel, total }; })
    .sort((a, b) => a.branch.localeCompare(b.branch) || b.total - a.total);
}
function acctChannelHtml(rows) {
  const t = acctChannelTotals(rows || []);
  if (!t.length) return "";
  return `<div class="acct-sec"><div class="acct-title">💳 المبيعات حسب طريقة الدفع <small>شامل الضريبة</small></div>
    <div class="acct-scroll"><table class="acct-table"><thead><tr><th>الفرع</th><th>طريقة الدفع</th><th>الإجمالي</th></tr></thead>
    <tbody>${t.map(r => `<tr><td>${escHtml(r.branch)}</td><td>${escHtml(r.channel)}</td><td>${acctN(r.total)}</td></tr>`).join("")}</tbody></table></div></div>`;
}

function renderAcctReport() {
  const view = document.getElementById("acctReportView");
  if (!view || !acctData) return;
  const d = acctData;
  const p = acctSum(d.purchases), pr = acctSum(d.returns), s = acctSum(d.sales), sr = acctSum(d.salesReturns || []);
  const outVat = purRound(s.vat - sr.vat), inVat = purRound(p.vat - pr.vat);
  const pending = d.purchases.filter(r => r.status === "pending").length;
  const noVat = d.purchases.filter(r => !r.vatNo && r.vat > 0).length;
  view.innerHTML = `
    <div class="acct-kpis">
      <div><span>ضريبة المبيعات (صافي المرتجع)</span><b>${acctN(outVat)}</b></div>
      <div><span>ضريبة المشتريات (صافي المرتجع)</span><b>${acctN(inVat)}</b></div>
      <div><span>الصافي المستحق</span><b>${acctN(purRound(outVat - inVat))}</b></div>
    </div>
    ${pending ? `<div class="pur-pending-note">⏳ ${pending} فاتورة مشتريات لسا بانتظار المراجعة (ظاهرة بالأصفر)</div>` : ""}
    ${d.salesFailed ? `<div class="pur-pending-note">⚠ ما قدرنا نجيب المبيعات (النت ضعيف؟) — جداول المبيعات فاضية. اضغط الفترة مرة ثانية قبل ما تصدّر</div>` : ""}
    ${noVat ? `<div class="pur-sales-note">⚠ ${noVat} فاتورة فيها ضريبة بدون رقم ضريبي للمورد — حطه من قائمة الموردين بصفحة المشتريات</div>` : ""}
    ${acctShow("purchases") ? acctTable("🧾 المشتريات", ACCT_PUR_HEAD, d.purchases, ACCT_PUR_CELLS, "ما فيه مشتريات بهالفترة.") : ""}
    ${acctShow("purchases") ? acctTable("↩ مرتجعات المشتريات", ACCT_PUR_HEAD, d.returns, ACCT_PUR_CELLS, "ما فيه مرتجعات مشتريات.") : ""}
    ${acctShow("sales") ? acctTable("💰 المبيعات", ACCT_SALE_HEAD, d.sales, ACCT_SALE_CELLS, "ما فيه مبيعات مسجلة بهالفترة.") : ""}
    ${acctShow("sales") ? acctChannelHtml(d.salesByChannel) : ""}
    ${acctShow("sreturns") ? acctTable("↩ مردودات المبيعات", ACCT_SALE_HEAD, d.salesReturns, ACCT_SALE_CELLS, "ما فيه مردودات مبيعات مسجلة بهالفترة (فوديكس: الروضة والشاطئ).") : ""}
    <div class="pur-sales-note">المبيعات: صف لكل فرع بكل يوم من طرق الدفع (تابسنس وفوديكس)، والمبالغ شاملة ضريبة ١٥٪.</div>`;
}

async function exportAcctExcel() {
  if (!acctData) { showToast("جهّز التقرير أول"); return; }
  if (acctData.salesFailed && acctKind !== "purchases") { showToast("⚠ المبيعات ما تحمّلت — حدّث التقرير أول"); return; }
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
  const pw = [6, 12, 18, 30, 18, 22, 18, 14, 18], sw = [6, 12, 16, 16, 26, 18, 18, 14, 18];
  if (acctShow("purchases")) {
    add("المشتريات", ACCT_PUR_HEAD, acctData.purchases, ACCT_PUR_CELLS, pw);
    add("مرتجعات المشتريات", ACCT_PUR_HEAD, acctData.returns, ACCT_PUR_CELLS, pw);
  }
  if (acctShow("sales")) {
    add("المبيعات", ACCT_SALE_HEAD, acctData.sales, ACCT_SALE_CELLS, sw);
    const ch = wb.addWorksheet("حسب طريقة الدفع");
    ch.addRow(["التاريخ", "الفرع", "طريقة الدفع", "الإجمالي شامل الضريبة"]);
    (acctData.salesByChannel || []).forEach(r => ch.addRow([r.date, r.branch, r.channel, r.total]));
    ch.addRow([]);
    ch.addRow(["الإجمالي حسب الفرع وطريقة الدفع"]);
    acctChannelTotals(acctData.salesByChannel || []).forEach(r => ch.addRow(["", r.branch, r.channel, r.total]));
    styleExcelSheet(ch, [12, 16, 28, 20]);
  }
  if (acctShow("sreturns")) add("مردودات المبيعات", ACCT_SALE_HEAD, acctData.salesReturns, ACCT_SALE_CELLS, sw);
  await downloadWorkbook(wb, `${ACCT_KIND_NAME[acctKind]}_${acctStart}_${acctEnd}.xlsx`);
}

function initAcctReportControls() {
  const $ = (id) => document.getElementById(id);
  if (!$("acctReportControls")) return;
  [["acctThisMonth", 0], ["acctLastMonth", -1]].forEach(([id, off]) => $(id).addEventListener("click", () => { acctSetMonth(off); loadAcctReport(); }));
  [["acctThisQuarter", 0], ["acctLastQuarter", -1]].forEach(([id, off]) => $(id).addEventListener("click", () => { acctSetQuarter(off); loadAcctReport(); }));
  $("acctKind").addEventListener("change", (e) => { acctKind = e.target.value; renderAcctReport(); });
  ["acctStart", "acctEnd"].forEach(id => $(id).addEventListener("change", () => {
    const a = $("acctStart").value, z = $("acctEnd").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(z)) return;
    acctStart = a <= z ? a : z; acctEnd = a <= z ? z : a;
    loadAcctReport();
  }));
  $("acctExportBtn").addEventListener("click", exportAcctExcel);
  $("acctPdfBtn").addEventListener("click", shareAcctPdf);
}

// ---- PDF بنفس ترتيب ورقة المحاسب: «المشتريات / مرتجعات» وبعدها «المبيعات / مرتجعات» — A4 بالعرض ----
const ACCT_PDF_W = 1123, ACCT_PDF_H = 794; // A4 بالعرض بدقة الشاشة
const ACCT_PDF_CSS = `
  .ap-page{ width:${ACCT_PDF_W}px; height:${ACCT_PDF_H}px; box-sizing:border-box; padding:28px 34px; background:#fff; color:#111;
    direction:rtl; font-family:inherit; display:flex; flex-direction:column; }
  .ap-head{ display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:10px; }
  .ap-head img{ height:46px; }
  .ap-head b{ font-size:20px; } .ap-head .ap-per{ font-size:13px; color:#444; display:block; }
  .ap-sec{ font-size:18px; font-weight:900; margin:4px 0 6px; }
  .ap-sub{ font-size:14px; font-weight:900; margin:8px 0 4px; }
  .ap-table{ width:100%; border-collapse:collapse; font-size:12px; table-layout:auto; }
  .ap-table th, .ap-table td{ border:1px solid #444; padding:4px 5px; text-align:center; }
  .ap-table th{ background:#e9e9e9; font-weight:900; }
  .ap-table td.n{ direction:ltr; white-space:nowrap; }
  .ap-table tr.tot td{ font-weight:900; background:#f6efc4; }
  .ap-table tr.pend td{ background:#fffbe8; }
  .ap-empty{ font-size:12.5px; color:#555; padding:4px 2px; }
  .ap-sum{ margin-top:12px; border:1.5px solid #111; border-radius:8px; padding:8px 12px; font-size:13.5px; display:grid; grid-template-columns:repeat(3,1fr); gap:6px; text-align:center; }
  .ap-sum b{ display:block; font-size:16px; direction:ltr; }
  .ap-foot{ margin-top:auto; font-size:10.5px; color:#555; display:flex; justify-content:space-between; padding-top:6px; }`;

async function buildAcctPdf() {
  await loadPdfLibs();
  if (!window.html2canvas || !window.jspdf) throw new Error("مكتبة PDF ما تحمّلت — تأكد من النت");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const d = acctData;
  const period = `الفترة: من <span dir="ltr">${acctStart}</span> إلى <span dir="ltr">${acctEnd}</span>`;
  let logo = "";
  try {
    const blob = await (await fetch("assets/logo.png")).blob();
    logo = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(""); r.readAsDataURL(blob); });
  } catch (e) { logo = ""; }
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-99999px;top:0;background:#fff;";
  stage.innerHTML = `<style>${ACCT_PDF_CSS}</style>`;
  document.body.appendChild(stage);
  let page = null, body = null, pageNo = 0, first = true;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fits = () => body.scrollHeight <= body.clientHeight;
  const newPage = (secTitle) => {
    page = el("div", "ap-page");
    page.appendChild(el("div", "ap-head", `<div><b>${{ all: "تقرير المحاسب — ضريبة القيمة المضافة", sales: "تقرير المبيعات", sreturns: "تقرير مردودات المبيعات", purchases: "تقرير المشتريات" }[acctKind]}</b><div class="ap-per">${period}</div></div>${logo ? `<img src="${logo}" alt="">` : ""}`));
    body = el("div", "", null);
    body.style.cssText = "flex:1;min-height:0;overflow:hidden;";
    page.appendChild(body);
    page.appendChild(el("div", "ap-foot", `<span>Pro House</span><span>صفحة ${++pageNo}</span>`));
    stage.appendChild(page);
    if (secTitle) body.appendChild(el("div", "ap-sec", secTitle));
  };
  const flush = async () => {
    if (!page) return;
    const canvas = await html2canvas(page, { scale: 1.6, backgroundColor: "#ffffff", logging: false });
    if (!first) pdf.addPage();
    first = false;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 297, 210);
    page.remove(); page = null;
  };
  // يضيف عنصر للصفحة، وإذا ما وسع يفتح صفحة جديدة (بعنوان القسم «تابع»)
  const place = async (node, secTitle) => {
    body.appendChild(node);
    if (fits()) return;
    node.remove();
    await flush();
    newPage(secTitle + " (تابع)");
    body.appendChild(node);
  };
  const thead = (head) => `<thead><tr><th>م</th>${head.map(h => `<th>${h}</th>`).join("")}<th>الإجمالي قبل الضريبة</th><th>الضريبة</th><th>الإجمالي بعد الضريبة</th></tr></thead>`;
  const table = async (secTitle, subTitle, head, rows, cells) => {
    const sub = el("div", "ap-sub", subTitle);
    await place(sub, secTitle);
    if (!rows.length) { await place(el("div", "ap-empty", "لا يوجد"), secTitle); return; }
    let tbl = null, tb = null;
    const startTable = () => {
      tbl = el("table", "ap-table", thead(head));
      tb = el("tbody"); tbl.appendChild(tb); body.appendChild(tbl);
    };
    startTable();
    // العنوان ما يبقى لحاله آخر الصفحة: إذا الجدول ما وسع ولا صف، العنوان ينتقل معه
    tb.appendChild(el("tr", "", `<td>1</td>`));
    const roomy = fits();
    tb.innerHTML = "";
    if (!roomy) { tbl.remove(); sub.remove(); await flush(); newPage(secTitle + " (تابع)"); body.appendChild(sub); startTable(); }
    const addRow = async (tr) => {
      tb.appendChild(tr);
      if (fits()) return;
      tr.remove();
      await flush();
      newPage(secTitle + " (تابع)");
      body.appendChild(el("div", "ap-sub", subTitle + " (تابع)"));
      startTable();
      tb.appendChild(tr);
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const tr = el("tr", r.status === "pending" ? "pend" : "",
        `<td>${i + 1}</td>${cells(r).map(c => `<td><span dir="auto">${escHtml(String(c))}</span></td>`).join("")}<td class="n">${acctN(r.sub)}</td><td class="n">${acctN(r.vat)}</td><td class="n">${acctN(r.total)}</td>`);
      await addRow(tr);
    }
    const t = acctSum(rows);
    await addRow(el("tr", "tot", `<td colspan="${head.length + 1}">الإجمالي</td><td class="n">${acctN(t.sub)}</td><td class="n">${acctN(t.vat)}</td><td class="n">${acctN(t.total)}</td>`));
  };
  try {
    const P = "المشتريات / مرتجعات", S = acctKind === "sreturns" ? "مردودات المبيعات" : acctKind === "sales" ? "المبيعات" : "المبيعات / مرتجعات";
    if (acctShow("purchases")) {
      newPage(P);
      await table(P, "المشتريات", ACCT_PUR_HEAD, d.purchases, ACCT_PUR_CELLS);
      await table(P, "مرتجعات المشتريات", ACCT_PUR_HEAD, d.returns, ACCT_PUR_CELLS);
      await flush();
    }
    if (acctShow("sales") || acctShow("sreturns")) {
      newPage(S);
      if (acctShow("sales")) {
        await table(S, "المبيعات", ACCT_SALE_HEAD, d.sales, ACCT_SALE_CELLS);
        const ct = acctChannelTotals(d.salesByChannel || []);
        if (ct.length) {
          await place(el("div", "ap-sub", "المبيعات حسب طريقة الدفع (شامل الضريبة)"), S);
          const tbl = el("table", "ap-table", `<thead><tr><th>الفرع</th><th>طريقة الدفع</th><th>الإجمالي</th></tr></thead>`);
          const tb = el("tbody"); tbl.appendChild(tb); body.appendChild(tbl);
          for (const r of ct) {
            const tr = el("tr", "", `<td>${escHtml(r.branch)}</td><td>${escHtml(r.channel)}</td><td class="n">${acctN(r.total)}</td>`);
            tb.appendChild(tr);
            if (!fits()) { tr.remove(); await flush(); newPage(S + " (تابع)"); const t2 = el("table", "ap-table", tbl.querySelector("thead").outerHTML); const b2 = el("tbody"); t2.appendChild(b2); body.appendChild(t2); b2.appendChild(tr); }
          }
        }
      }
      if (acctShow("sreturns")) await table(S, "مردودات المبيعات", ACCT_SALE_HEAD, d.salesReturns, ACCT_SALE_CELLS);
    }
    if (acctKind === "all") {
      const p = acctSum(d.purchases), pr = acctSum(d.returns), s = acctSum(d.sales), sr = acctSum(d.salesReturns);
      const inVat = purRound(p.vat - pr.vat), outVat = purRound(s.vat - sr.vat);
      await place(el("div", "ap-sum", `<div>ضريبة المبيعات (صافي المرتجع)<b>${acctN(outVat)}</b></div><div>ضريبة المشتريات (صافي المرتجع)<b>${acctN(inVat)}</b></div><div>الصافي المستحق${outVat < inVat ? " (بالسالب = مسترد)" : ""}<b>${acctN(purRound(outVat - inVat))}</b></div>`), S);
    }
    await flush();
  } finally { stage.remove(); }
  return pdf.output("blob");
}

async function shareAcctPdf() {
  if (!acctData) { showToast("جهّز التقرير أول"); return; }
  if (acctData.salesFailed && acctKind !== "purchases") { showToast("⚠ المبيعات ما تحمّلت — حدّث التقرير أول"); return; }
  const btn = document.getElementById("acctPdfBtn");
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ جاري تجهيز PDF…";
  try {
    const blob = await buildAcctPdf();
    const name = `${ACCT_KIND_NAME[acctKind]}_${acctStart}_${acctEnd}.pdf`;
    const file = new File([blob], name, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "تقرير المحاسب" }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast("✅ نزل الـ PDF");
  } catch (e) {
    showToast("⚠ " + (e.message || e));
  } finally { btn.disabled = false; btn.textContent = label; }
}
