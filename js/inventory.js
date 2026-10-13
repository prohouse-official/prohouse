// ==================== المخزون: المواد الخام من فواتير المشتريات ====================
// كل سطر فاتورة (غير مرجّعة ليزيد) ينضاف تلقائياً لمادة خام (inv_movements) — من قاعدة البيانات نفسها.
// الرصيد الفعلي يبدأ مع الجرد الافتتاحي؛ قبلها نعرض الوارد من المشتريات (الكمية، القيمة، متوسط السعر).

let invPreset = "month";
let invStart = "";
let invEnd = "";
let invQuery = "";
let invOpenId = "";
let invData = null; // {materials, moves}
let invLoadSeq = 0;

const INV_CATS = ["بروتين", "نشويات", "ألبان", "زيوت وصوصات", "خضار وفواكه", "مخبوزات", "معلبات", "حلويات ومخبوزات", "بهارات", "مشروبات", "تغليف", "منظفات وأدوات", "أخرى", "غير مفصّل"];
const INV_CAT_ICON = { "بروتين": "🥩", "نشويات": "🍚", "ألبان": "🧀", "زيوت وصوصات": "🫒", "خضار وفواكه": "🥬", "مخبوزات": "🍞", "معلبات": "🥫", "حلويات ومخبوزات": "🍫", "بهارات": "🧂", "مشروبات": "☕", "تغليف": "📦", "منظفات وأدوات": "🧽", "أخرى": "🗂", "غير مفصّل": "❔" };

function invRange(preset) {
  const t = todayStr();
  const ym = t.slice(0, 7);
  const monthEnd = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
  if (preset === "prev") {
    const [y, m] = ym.split("-").map(Number);
    const p = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    return { start: p + "-01", end: monthEnd(p) };
  }
  if (preset === "all") return { start: "2020-01-01", end: t };
  return { start: ym + "-01", end: t };
}

// الكمية بوحدة مفهومة: جم → كجم، مل → لتر
function invQty(q, unit) {
  if (q === null || q === undefined || unit === "قيمة") return "—";
  const n = Number(q) || 0;
  const f = (x, d) => x.toLocaleString("en-US", { maximumFractionDigits: d });
  if (unit === "جم") return Math.abs(n) >= 1000 ? `${f(n / 1000, 1)} كجم` : `${f(n, 0)} جم`;
  if (unit === "مل") return Math.abs(n) >= 1000 ? `${f(n / 1000, 1)} لتر` : `${f(n, 0)} مل`;
  if (unit === "حبة") return `${f(n, 0)} حبة`;
  return `${f(n, 1)} وحدة شراء`;
}
function invUnitPrice(value, q, unit) {
  if (!q || unit === "قيمة") return "";
  if (unit === "جم") return `${(value / (q / 1000)).toFixed(2)} ر.س/كجم`;
  if (unit === "مل") return `${(value / (q / 1000)).toFixed(2)} ر.س/لتر`;
  if (unit === "حبة") return `${(value / q).toFixed(2)} ر.س/حبة`;
  return `${(value / q).toFixed(2)} ر.س/وحدة`;
}

async function loadInventory() {
  const view = document.getElementById("inventoryView");
  if (!view) return;
  if (!invStart) ({ start: invStart, end: invEnd } = invRange(invPreset));
  const seq = ++invLoadSeq;
  if (!invData) view.innerHTML = '<div class="loader">جاري تحميل المخزون…</div>';
  try {
    const data = await SupaEngine.getInventory();
    if (seq !== invLoadSeq) return;
    invData = data;
  } catch (e) {
    if (seq !== invLoadSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر جلب المخزون — ${escHtml(e.message || String(e))}</div>`;
    return;
  }
  renderInventoryView();
}

function invSummary() {
  const mats = new Map((invData.materials || []).map(m => [m.id, { ...m, qty: 0, value: 0, est: 0, lines: 0, last: "", qtyKnown: true, recent: [] }]));
  let total = 0, estValue = 0, count = 0;
  (invData.moves || []).forEach(v => {
    if (v.voided || v.date < invStart || v.date > invEnd) return;
    const m = mats.get(v.material_id);
    if (!m) return;
    const val = Number(v.value) || 0;
    m.value += val; total += val; count++;
    m.lines++;
    if (v.qty_base === null || v.qty_base === undefined) m.qtyKnown = m.base_unit === "قيمة" ? true : false;
    else m.qty += Number(v.qty_base);
    if (v.estimated) { m.est += val; estValue += val; }
    if (v.date > m.last) m.last = v.date;
    m.recent.push(v);
  });
  return { mats: [...mats.values()].filter(m => m.lines), total, estValue, count };
}

function renderInventoryView() {
  const view = document.getElementById("inventoryView");
  if (!view || !invData) return;
  const s = invSummary();
  const q = invQuery.trim().toLowerCase();
  const shown = s.mats.filter(m => !q || m.name.toLowerCase().includes(q) || m.category.includes(q));
  const byCat = {};
  shown.forEach(m => (byCat[m.category] = byCat[m.category] || []).push(m));
  const cats = Object.keys(byCat).sort((a, b) => (INV_CATS.indexOf(a) + 1 || 99) - (INV_CATS.indexOf(b) + 1 || 99));
  const unmapped = s.mats.find(m => m.id === "unmapped");

  view.innerHTML = `
    <div class="cust-owner inv-head">
      <div class="cust-owner-title">📦 المخزون — المواد الخام</div>
      <div class="pur-chips">
        ${[["month", "هالشهر"], ["prev", "الشهر الماضي"], ["all", "من البداية"]].map(([k, l]) =>
          `<button type="button" class="pur-chip ${invPreset === k ? "active" : ""}" data-inv-preset="${k}">${l}</button>`).join("")}
      </div>
      <div class="pur-kpis">
        <div class="pur-kpi-sales"><span>قيمة الوارد للمخزون (قبل الضريبة)</span><b>${purSar(s.total)}</b></div>
        <div><span>مواد خام</span><b>${s.mats.filter(m => m.base_unit !== "قيمة").length}</b></div>
        <div><span>سطور فواتير</span><b>${s.count.toLocaleString("en-US")}</b></div>
      </div>
      <div class="inv-note">ℹ️ الأرقام هنا <b>الوارد من المشتريات</b> (كل فاتورة غير مرجّعة تنضاف تلقائياً وتتوزع على موادها).
        الرصيد الفعلي (الموجود بالمطبخ) يبدأ بعد <b>الجرد الافتتاحي</b>.${s.estValue ? ` · ${purSar(s.estValue)} كميتها تقديرية (الفاتورة بدون كمية — محسوبة من متوسط السعر)` : ""}</div>
      <input type="search" id="invSearch" class="inv-search" placeholder="🔍 دوّر على مادة… (دجاج، رز، جبنة)" value="${escHtml(invQuery)}">
    </div>

    ${cats.map(cat => {
      const list = byCat[cat].sort((a, b) => b.value - a.value);
      const sum = list.reduce((t, m) => t + m.value, 0);
      return `
      <div class="cust-owner inv-cat">
        <div class="inv-cat-head"><span>${INV_CAT_ICON[cat] || "•"} ${escHtml(cat)}</span><b>${purSar(sum)}</b></div>
        ${list.map(m => invRowHtml(m, s.total)).join("")}
      </div>`;
    }).join("") || '<div class="empty-state">ما فيه مشتريات بهالفترة</div>'}
    ${unmapped ? `<div class="inv-note warn">⚠ ${unmapped.lines} سطر من فواتير جديدة بانتظار الربط بمادة (${purSar(unmapped.value)}) — بنربطها أول بأول.</div>` : ""}
  `;

  view.querySelectorAll("[data-inv-preset]").forEach(b => b.addEventListener("click", () => {
    invPreset = b.dataset.invPreset; ({ start: invStart, end: invEnd } = invRange(invPreset)); renderInventoryView();
  }));
  const search = view.querySelector("#invSearch");
  if (search) search.addEventListener("input", () => {
    invQuery = search.value; const pos = search.selectionStart;
    renderInventoryView();
    const again = document.getElementById("invSearch"); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
  });
  view.querySelectorAll("[data-inv-open]").forEach(b => b.addEventListener("click", () => {
    invOpenId = invOpenId === b.dataset.invOpen ? "" : b.dataset.invOpen; renderInventoryView();
  }));
}

function invRowHtml(m, total) {
  const open = invOpenId === m.id;
  const qty = m.base_unit === "قيمة" ? "قيمة بس (الفاتورة غير مفصّلة)" : (m.qtyKnown || m.qty ? invQty(m.qty, m.base_unit) : "—");
  const price = m.qtyKnown && m.qty ? invUnitPrice(m.value, m.qty, m.base_unit) : "";
  const recent = open ? m.recent.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12) : [];
  return `
    <button type="button" class="inv-row ${open ? "open" : ""}" data-inv-open="${escHtml(m.id)}">
      <span class="inv-name">${escHtml(m.name)}${m.est ? ' <small class="inv-est" title="جزء من الكمية تقديري">≈</small>' : ""}</span>
      <span class="inv-qty">${qty}${price ? `<small>${price}</small>` : ""}</span>
      <b class="inv-val">${purSar(m.value)}<small>${purPct(m.value, total)}</small></b>
    </button>
    ${open ? `<div class="inv-detail">
      <div class="inv-detail-sub">آخر شراء: ${m.last || "—"} · ${m.lines} سطر فاتورة</div>
      ${recent.map(v => `<div class="inv-mv"><span dir="ltr">${v.date}</span><span>${escHtml(v.created_by || "")}${v.kind === "return" ? " · مرتجع" : ""}</span>
        <span>${v.qty_base === null || v.qty_base === undefined ? "—" : invQty(v.qty_base, m.base_unit)}${v.estimated ? " ≈" : ""}</span><b>${purSar(v.value)}</b></div>`).join("")}
    </div>` : ""}`;
}
