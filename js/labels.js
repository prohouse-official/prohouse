// ==================== ملصقات القيم الغذائية (اشتراكات تكرار) ====================
// ملصق 6×4 سم (عرضي) لكل وجبة: الاسم، الحجم، السعرات والبروتين والكارب والدهون، والتاريخ.
// القيم من منيو تكرار (جدول takrar_products). وضعين: «طلبات يوم» من تقرير BoQ (عدد الملصقات = عدد الوجبات)،
// أو «كل الأصناف» — بتختار أي صنف وأي حجم وكم ملصق.

let lblMode = "day";
let lblDate = new Date().getHours() >= 12 ? addDaysStr(todayStr(), 1) : todayStr();
let lblProducts = [];
let lblBoq = [];
let lblFilter = "";  // تصنيف محدد (وضع كل الأصناف)
let lblQuery = "";   // بحث بالاسم
let lblCounts = {}; // «id|الحجم» → عدد (وضع كل الأصناف)
let lblLoadSeq = 0;
let lblHost = "labelsView"; // نفس الشاشة: من القائمة أو من التقارير

const LBL_SIZES = { "100P - 100C": "100 جم بروتين · 100 جم كارب", "150P - 150C": "150 جم بروتين · 150 جم كارب", "200P - 200C": "200 جم بروتين · 200 جم كارب" };
// سلطات الفرع: اسم عربي وإنجليزي، مكونات بالإنجليزي فقط، وسعرات تقريبية (تقدير، تتعدّل من هون بعد ما الشيف يأكدها)
const LBL_SALADS = [
  { n: 1, ar: "مكسيكو سلاد", en: "Mexico Salad", cal: 280, ing: "White cabbage, red cabbage, grated carrot, sweet corn, cucumber, boiled chickpeas. Sauce: cocktail or ranch." },
  { n: 2, ar: "تكساس سلاد", en: "Texas Salad", cal: 240, ing: "Arugula, Greek olives, cherry tomato, corn, basil leaves. Sauce: Italian or pomegranate molasses." },
  { n: 3, ar: "تروبيكال سلاد", en: "Tropical Salad", cal: 310, ing: "Oven-fried eggplant cubes, pomegranate, lettuce, arugula, apple. Sauce: ranch." },
  { n: 4, ar: "جريلد بيبي كورن سلاد", en: "Grilled Baby Corn Salad", cal: 230, ing: "Lettuce, grated carrot, green onion, tomato, grilled yellow corn. Sauce: cocktail or Italian." },
  { n: 5, ar: "بيتروت هلثي", en: "Beetroot Healthy", cal: 190, ing: "Beetroot, cucumber, parsley, lettuce, sliced grapes. Sauce: Italian or pomegranate molasses." },
  { n: 6, ar: "روكا آبل سلاد", en: "Rocca Apple Salad", cal: 300, ing: "Arugula, apple, lettuce, dried berries, feta cheese. Sauce: ranch or Italian." }
];
const lblNorm = (s) => String(s || "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ـ/g, "").replace(/\s+/g, " ").trim();
const lblNum = (x) => (Math.round(Number(x) * 10) / 10).toString();

async function loadLabelsView(host) {
  if (host) lblHost = host;
  // الشاشة بمكان واحد بس (نفس أرقام العناصر)
  ["labelsView", "labelsReportView"].forEach(id => { const el = document.getElementById(id); if (id !== lblHost && el) el.innerHTML = ""; });
  const view = document.getElementById(lblHost);
  if (!view) return;
  const seq = ++lblLoadSeq;
  view.innerHTML = '<div class="loader">جاري التحميل…</div>';
  try {
    const [prods, boq] = await Promise.all([
      lblProducts.length ? lblProducts : SupaEngine.getTakrarProducts(),
      lblMode === "day" ? SupaEngine.getTakrarBoq(lblDate) : []
    ]);
    if (seq !== lblLoadSeq) return;
    lblProducts = prods || []; lblBoq = boq || [];
  } catch (e) {
    if (seq !== lblLoadSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر التحميل — ${escHtml(e.message || String(e))}</div>`;
    return;
  }
  renderLabelsView();
}

// قائمة الملصقات: [{ p, size, nut, extra }]
// الأصناف الظاهرة حسب فلتر التصنيف والبحث
function lblVisibleProducts() {
  const q = lblNorm(lblQuery);
  return lblProducts.filter(p => (!lblFilter || p.category === lblFilter) && (!q || lblNorm(p.name_ar + " " + (p.name_en || "")).includes(q)));
}

function lblList() {
  const byName = new Map(lblProducts.map(p => [lblNorm(p.name_ar), p]));
  const out = [], missing = [];
  if (lblMode === "salad") {
    const any = LBL_SALADS.some(x => Number(lblCounts["salad|" + x.n]) > 0);
    LBL_SALADS.forEach(x => {
      const n = any ? Number(lblCounts["salad|" + x.n]) || 0 : 1;
      for (let i = 0; i < n; i++) out.push({ p: { id: "salad" + x.n, name_ar: x.ar, name_en: x.en }, size: "", nut: { calories: x.cal }, extra: "", ing: x.ing });
    });
  } else if (lblMode === "day") {
    lblBoq.forEach(b => {
      const p = byName.get(lblNorm(b.name));
      const nut = p && (p.nutrition[b.size || ""] || (!b.size && Object.values(p.nutrition).length === 1 ? Object.values(p.nutrition)[0] : null));
      if (!p || !nut) { missing.push(`${b.name}${b.size ? " (" + b.size + ")" : ""}`); return; }
      const vs = (b.variants || []).map(v => [v.name, Number(v.qty) || 0]);
      const rest = (Number(b.qty) || 0) - vs.reduce((t, [, q]) => t + q, 0);
      vs.concat(rest > 0 ? [["", rest]] : []).forEach(([vn, q]) => { for (let i = 0; i < q; i++) out.push({ p, size: b.size || "", nut, extra: vn ? "مع " + vn : "" }); });
    });
  } else {
    const any = Object.values(lblCounts).some(v => Number(v) > 0);
    lblVisibleProducts().forEach(p => Object.entries(p.nutrition).forEach(([size, nut]) => {
      const n = any ? Number(lblCounts[p.id + "|" + size]) || 0 : 1; // ما اخترت عدد؟ ملصق لكل صنف وحجم
      for (let i = 0; i < n; i++) out.push({ p, size, nut, extra: "" });
    }));
  }
  return { out, missing };
}

function lblSaladHtml(l) {
  return `<div class="lbl lbl-salad"><div class="lbl-hd"><img src="assets/logo.png" alt=""><div class="lbl-nm"><b>${escHtml(l.p.name_ar)}</b><span>${escHtml(l.p.name_en)}</span></div></div>
    <div class="lbl-ing"><b>Ingredients:</b> ${escHtml(l.ing)}</div>
    <div class="lbl-cal"><span>Calories</span><b>≈ ${lblNum(l.nut.calories)} kcal</b></div></div>`;
}

function lblHtml(l, date) {
  if (l.ing) return lblSaladHtml(l);
  const [y, m, d] = date ? date.split("-").map(Number) : [];
  const w = (/^(\d+)P/.exec(l.size || "") || [])[1]; // حجم الوجبة اللي محسوبة عليه السعرات (100 / 150 / 200)
  const sz = [LBL_SIZES[l.size] || "", l.extra].filter(Boolean).join(" · ");
  return `<div class="lbl"><div class="lbl-hd"><img src="assets/logo.png" alt=""><div class="lbl-nm"><b>${escHtml(l.p.name_ar)}</b><span>${escHtml(l.p.name_en || "")}</span></div></div>
    <div class="lbl-sz">${w ? `<span class="lbl-w">وجبة ${w}</span>` : ""}${escHtml(sz)}</div>
    <table class="lbl-t"><tr><th>سعرات<i>Calories</i></th><th>بروتين<i>Protein</i></th><th>كارب<i>Carbs</i></th><th>دهون<i>Fat</i></th></tr>
    <tr><td><b>${lblNum(l.nut.calories)}</b></td><td>${lblNum(l.nut.protein)} g</td><td>${lblNum(l.nut.carbs)} g</td><td>${lblNum(l.nut.fat)} g</td></tr></table>
    ${date ? `<div class="lbl-ft">${d}/${m}/${y}</div>` : ""}</div>`;
}

function renderLabelsView() {
  const view = document.getElementById(lblHost);
  const { out, missing } = lblList();
  const cats = [];
  lblProducts.forEach(p => { if (!cats.includes(p.category)) cats.push(p.category); });
  const visible = lblVisibleProducts();
  const visCats = cats.filter(c => visible.some(p => p.category === c));
  view.innerHTML = `
    <h2 class="juice-page-title">🏷️ ملصقات القيم الغذائية</h2>
    <div class="item-card">
      <div class="lbl-modes">
        <button type="button" class="lbl-mode${lblMode === "day" ? " on" : ""}" data-lbl-mode="day">📦 طلبات يوم</button>
        <button type="button" class="lbl-mode${lblMode === "all" ? " on" : ""}" data-lbl-mode="all">📋 كل الأصناف</button>
        <button type="button" class="lbl-mode${lblMode === "salad" ? " on" : ""}" data-lbl-mode="salad">🥗 السلطات</button>
      </div>
      <div class="inputs-row">
        ${lblMode === "day" ? `<div class="field"><label>يوم التوصيل</label><input type="date" id="lblDateInput" value="${lblDate}"></div>` : ""}
        <div class="field"><label>الملصقات</label><div class="readonly-field"><b>${out.length}</b> ملصق · 6×4 سم${lblMode === "all" && !Object.values(lblCounts).some(v => Number(v) > 0) ? " (واحد لكل صنف وحجم)" : ""}</div></div>
      </div>
      <div class="att-actions">
        <button class="btn" id="lblPrintBtn" ${out.length ? "" : "disabled"}>🖨 اطبع</button>
        <button class="btn btn-ghost" id="lblDownBtn" ${out.length ? "" : "disabled"}>⬇ تنزيل PDF</button>
        <button class="btn btn-ghost" id="lblShareBtn" ${out.length ? "" : "disabled"}>📤 مشاركة</button>
      </div>
      ${lblMode === "all" ? `<div class="lbl-filters">
        <button type="button" class="lbl-chip${!lblFilter ? " on" : ""}" data-lbl-filter="">الكل</button>
        ${cats.map(c => `<button type="button" class="lbl-chip${lblFilter === c ? " on" : ""}" data-lbl-filter="${escHtml(c)}">${escHtml(c || "أصناف")} (${lblProducts.filter(p => p.category === c).length})</button>`).join("")}
        <button type="button" class="lbl-chip" data-lbl-mode="salad">🥗 سلطات الفرع</button>
      </div>
      <div class="field"><label>بحث بالاسم</label><input type="search" id="lblSearch" value="${escHtml(lblQuery)}" placeholder="اكتب جزء من الاسم"></div>` : ""}
      ${missing.length ? `<div class="att-now prod-short-count">⚠ ما في قيم غذائية لـ: ${missing.map(escHtml).join("، ")}</div>` : ""}
    </div>
    ${lblMode === "salad"
      ? `<div class="item-card"><div class="lbl-sizes">${LBL_SALADS.map(x => `<label class="lbl-size"><span><b>${escHtml(x.ar)}</b> · ${escHtml(x.en)} · ≈${x.cal} kcal</span>
          <input type="number" inputmode="numeric" min="0" step="1" class="lbl-count" data-lbl-key="${"salad|" + x.n}" value="${lblCounts["salad|" + x.n] || ""}" placeholder="0"></label>`).join("")}</div>
          <div class="att-now">السعرات تقديرية للحصة. إذا ما حددت عدد، بيطلع ملصق واحد لكل سلطة.</div></div>`
      : lblMode === "day"
      ? (lblBoq.length ? `<div class="item-card">${lblBoq.map(b => `<div class="inote-line"><b>${escHtml(b.name)}</b><span>${escHtml(b.size || "")} · ${Number(b.qty) || 0} وجبة${(b.variants || []).length ? " · " + b.variants.map(v => `${escHtml(v.name)} ${v.qty}`).join("، ") : ""}</span></div>`).join("")}</div>`
        : `<div class="empty-state">ما في طلبات اشتراكات لهاليوم</div>`)
      : (visCats.length ? visCats : []).map(c => `<details class="prod-cat" open><summary class="prod-cat-head"><span>${escHtml(c || "أصناف")}</span><span class="prod-cat-count">${visible.filter(p => p.category === c).length}</span></summary>
        ${visible.filter(p => p.category === c).map(p => {
          const sizes = Object.keys(p.nutrition);
          return `<div class="item-card lbl-item"><div class="prod-item-head"><b>${escHtml(p.name_ar)}</b> <small class="prod-size">${escHtml(p.name_en || "")}</small></div>
            ${!sizes.length ? `<div class="att-now">ما في قيم غذائية بتكرار</div>` : `<div class="lbl-sizes">${sizes.map(s => `<label class="lbl-size">
              <span>${escHtml(s ? s.replace(/P - \d+C/, "") + " جم" : "حجم واحد")} · ${lblNum(p.nutrition[s].calories)} سعرة</span>
              <input type="number" inputmode="numeric" min="0" step="1" class="lbl-count" data-lbl-key="${escHtml(p.id + "|" + s)}" value="${lblCounts[p.id + "|" + s] || ""}" placeholder="0"></label>`).join("")}</div>`}
          </div>`;
        }).join("")}</details>`).join("")}`;
  view.querySelectorAll("[data-lbl-mode]").forEach(b => b.addEventListener("click", () => { lblMode = b.dataset.lblMode; loadLabelsView(); }));
  view.querySelectorAll("[data-lbl-filter]").forEach(b => b.addEventListener("click", () => { lblFilter = b.dataset.lblFilter; renderLabelsView(); }));
  const sq = document.getElementById("lblSearch");
  if (sq) sq.addEventListener("input", () => { lblQuery = sq.value; clearTimeout(sq._t); sq._t = setTimeout(() => { renderLabelsView(); const n = document.getElementById("lblSearch"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
  const d = document.getElementById("lblDateInput");
  if (d) d.addEventListener("change", () => { lblDate = d.value || todayStr(); if (lblMode === "day") loadLabelsView(); else renderLabelsView(); });
  view.querySelectorAll(".lbl-count").forEach(inp => inp.addEventListener("change", () => {
    lblCounts[inp.dataset.lblKey] = Math.max(0, parseInt(inp.value, 10) || 0);
    renderLabelsView();
  }));
  const pb = document.getElementById("lblPrintBtn");
  if (pb) pb.addEventListener("click", () => lblOpenPrint(out));
  const db = document.getElementById("lblDownBtn");
  if (db) db.addEventListener("click", (e) => lblPdf(out, e.currentTarget, false));
  const sb = document.getElementById("lblShareBtn");
  if (sb) sb.addEventListener("click", (e) => lblPdf(out, e.currentTarget, true));
}

// الطباعة جوّا التطبيق (متل ورقة الحضور): كل ملصق صفحة 60×40 مم
function lblOpenPrint(list) {
  const old = document.getElementById("lblPrintOverlay");
  if (old) old.remove();
  const oldPg = document.getElementById("lblPageSize");
  if (oldPg) oldPg.remove();
  const ov = document.createElement("div");
  ov.id = "lblPrintOverlay";
  ov.className = "att-print-overlay";
  ov.innerHTML = `<div class="att-print-bar">
      <button type="button" class="btn btn-ghost" id="lblPrintClose">→ رجوع للتطبيق</button>
      <button type="button" class="btn" id="lblPrintGo">🖨 اطبع (${list.length})</button>
    </div>
    <div class="lbl-pages">${list.map(l => lblHtml(l, lblMode === "day" ? lblDate : "")).join("")}</div>`;
  // مقاس الصفحة 60×40 بس وقت طباعة الملصقات (ورقة الحضور A4)
  const pg = document.createElement("style");
  pg.id = "lblPageSize";
  pg.textContent = "@media print{@page{size:60mm 40mm;margin:0}}";
  document.head.appendChild(pg);
  document.body.appendChild(ov);
  document.body.classList.add("lbl-printing");
  document.getElementById("lblPrintClose").addEventListener("click", () => { ov.remove(); pg.remove(); document.body.classList.remove("lbl-printing"); });
  document.getElementById("lblPrintGo").addEventListener("click", () => window.print());
}

// PDF: صفحة 60×40 مم لكل ملصق — بالجوال بيفتح المشاركة
async function lblPdf(list, btn, share) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ جاري التجهيز…";
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-99999px;top:0;background:#fff;";
  document.body.appendChild(stage);
  try {
    if (typeof loadPdfLibs === "function") await loadPdfLibs();
    if (!window.html2canvas || !window.jspdf) throw new Error("مكتبة PDF ما تحمّلت — تأكد من النت");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [60, 40], compress: true });
    // الأشكال المختلفة بس (نفس الصنف بنفس الحجم = نفس الصورة)، ومنصوّرهم دفعات: 30 ملصق بصورة وحدة ومنقصّها
    // (صورة لكل ملصق كانت تاخد دقايق على الجوال)
    const keyOf = (l) => l.p.id + "|" + l.size + "|" + l.extra;
    const uniq = [];
    const seen = new Set();
    list.forEach(l => { const k = keyOf(l); if (!seen.has(k)) { seen.add(k); uniq.push(l); } });
    const date = lblMode === "day" ? lblDate : "";
    const cache = new Map();
    const COLS = 5, BATCH = 30, SCALE = 3;
    for (let b = 0; b < uniq.length; b += BATCH) {
      const part = uniq.slice(b, b + BATCH);
      stage.innerHTML = `<div class="lbl-batch" style="display:grid;grid-template-columns:repeat(${COLS},60mm);background:#fff">${part.map(l => lblHtml(l, date)).join("")}</div>`;
      const grid = stage.firstElementChild;
      const big = await html2canvas(grid, { scale: SCALE, backgroundColor: "#ffffff", logging: false });
      const cells = [...grid.children];
      const gr = grid.getBoundingClientRect();
      cells.forEach((cell, j) => {
        const r = cell.getBoundingClientRect();
        const c = document.createElement("canvas");
        c.width = Math.round(r.width * SCALE); c.height = Math.round(r.height * SCALE);
        c.getContext("2d").drawImage(big, Math.round((r.left - gr.left) * SCALE), Math.round((r.top - gr.top) * SCALE), c.width, c.height, 0, 0, c.width, c.height);
        cache.set(keyOf(part[j]), c.toDataURL("image/jpeg", 0.88));
      });
      btn.textContent = `⏳ ${Math.min(b + BATCH, uniq.length)}/${uniq.length}`;
    }
    list.forEach((l, i) => {
      if (i) pdf.addPage([60, 40], "landscape");
      pdf.addImage(cache.get(keyOf(l)), "JPEG", 0, 0, 60, 40, keyOf(l)); // نفس الصورة بتنحفظ مرة وحدة بالملف
    });
    const blob = pdf.output("blob");
    const name = lblMode === "salad" ? "ملصقات_السلطات.pdf" : lblMode === "day" ? `ملصقات_القيم_الغذائية_${lblDate}.pdf` : "ملصقات_القيم_الغذائية_كل_الأصناف.pdf";
    const file = new File([blob], name, { type: "application/pdf" });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "ملصقات القيم الغذائية" }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {
    showToast("⚠ " + (e.message || e));
  } finally { stage.remove(); btn.disabled = false; btn.textContent = label; }
}
