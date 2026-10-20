// ==================== تكلفة المنتجات (الريسبي) ====================
// لكل صنف ريسبي: مكوّنات من المواد الخام (نفس مواد المخزون) وكمية كل مكوّن بوحدتها (جم / مل / حبة / وحدة).
// السعر من المشتريات: متوسط آخر 90 يوم أو آخر سعر — ولو المادة ما إلها سعر واضح (مسجّلة بالكرتونة) بينكتب سعرها يدوي.
// للمالكين والمحاسب والشيف بس (نفس صلاحية المخزون بالداتابيس: inv_can_read).

let costTab = "recipes";        // recipes | prices
let costBasis = "avg";          // avg | last
let costMaterials = [];
let costMoves = [];
let costRecipes = [];
let costOverrides = {};          // material_id → { price, note }
let costEditing = null;          // ريسبي مفتوح للتعديل
let costLoadSeq = 0;

const costFmt = (n, d = 2) => (n === null || n === undefined || isNaN(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
const costCanEdit = () => !Auth.isReadOnly() && ["owner", "chef"].includes(Auth.role());

// سعر الوحدة الأساسية لكل مادة من فواتير المشتريات
function costPriceTable() {
  const since = addDaysStr(todayStr(), -90);
  const by = {};
  costMoves.forEach(m => {
    if (m.kind !== "purchase" || m.voided || m.estimated || !(Number(m.qty_base) > 0) || !(Number(m.value) > 0)) return;
    const r = (by[m.material_id] = by[m.material_id] || { v: 0, q: 0, last: null, lastDate: "", n: 0 });
    if (m.date >= since) { r.v += Number(m.value); r.q += Number(m.qty_base); r.n++; }
    if (m.date >= r.lastDate) { r.lastDate = m.date; r.last = Number(m.value) / Number(m.qty_base); }
  });
  const out = {};
  costMaterials.forEach(mat => {
    const r = by[mat.id];
    const avg = r && r.q > 0 ? r.v / r.q : (r ? r.last : null);
    const ov = costOverrides[mat.id];
    out[mat.id] = { avg, last: r ? r.last : null, lastDate: r ? r.lastDate : "", n: r ? r.n : 0,
      manual: ov ? Number(ov.price) : null,
      price: ov ? Number(ov.price) : costBasis === "last" ? (r ? r.last : null) : avg };
  });
  return out;
}

function costOfRecipe(rec, prices) {
  let total = 0, missing = 0;
  const lines = (rec.ingredients || []).map(g => {
    const p = prices[g.material_id];
    const unit = p ? p.price : null;
    const cost = unit !== null && unit !== undefined ? unit * Number(g.qty || 0) : null;
    if (cost === null) missing++; else total += cost;
    return { ...g, unit, cost };
  });
  return { lines, total, missing, pct: rec.sell_price > 0 ? total / Number(rec.sell_price) * 100 : null };
}

async function loadCostingView() {
  const view = document.getElementById("costingView");
  if (!view) return;
  const seq = ++costLoadSeq;
  view.innerHTML = '<div class="loader">جاري التحميل…</div>';
  try {
    const [inv, recipes, ov] = await Promise.all([SupaEngine.getInventory(), SupaEngine.getCostRecipes(), SupaEngine.getCostPrices()]);
    if (seq !== costLoadSeq) return;
    costMaterials = inv.materials; costMoves = inv.moves; costRecipes = recipes;
    costOverrides = {};
    (ov || []).forEach(r => { if (Number(r.price) >= 0) costOverrides[r.material_id] = r; }); // -1 = رجع لسعر المشتريات
  } catch (e) {
    if (seq !== costLoadSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر التحميل — ${escHtml(e.message || String(e))}</div>`;
    return;
  }
  renderCostingView();
}

function costUnitLabel(u) { return u === "جم" ? "جم" : u === "مل" ? "مل" : u || "وحدة"; }
// سعر الوحدة للعرض: الجرام والمل بالكيلو/اللتر عشان يكون مفهوم
function costPriceText(price, u) {
  if (price === null || price === undefined) return "—";
  return u === "جم" ? `${costFmt(price * 1000)} ر/كجم` : u === "مل" ? `${costFmt(price * 1000)} ر/لتر` : `${costFmt(price)} ر/${costUnitLabel(u)}`;
}

function renderCostingView() {
  const view = document.getElementById("costingView");
  const prices = costPriceTable();
  const head = `
    <h2 class="juice-page-title">💲 تكلفة المنتجات</h2>
    <div class="item-card">
      <div class="lbl-modes">
        <button type="button" class="lbl-mode${costTab === "recipes" ? " on" : ""}" data-cost-tab="recipes">🍽️ الأصناف (الريسبي)</button>
        <button type="button" class="lbl-mode${costTab === "prices" ? " on" : ""}" data-cost-tab="prices">🧾 أسعار المواد الخام</button>
      </div>
      <div class="lbl-modes">
        <button type="button" class="lbl-mode${costBasis === "avg" ? " on" : ""}" data-cost-basis="avg">متوسط آخر 3 شهور</button>
        <button type="button" class="lbl-mode${costBasis === "last" ? " on" : ""}" data-cost-basis="last">آخر سعر شراء</button>
      </div>
    </div>`;
  let body = "";
  if (costTab === "prices") {
    const cats = [];
    costMaterials.forEach(m => { if (!cats.includes(m.category)) cats.push(m.category); });
    body = cats.map(c => `<details class="prod-cat"><summary class="prod-cat-head"><span>${escHtml(c || "مواد")}</span></summary>
      ${costMaterials.filter(m => m.category === c).map(m => {
        const p = prices[m.id];
        return `<div class="item-card cost-mat"><div class="prod-item-head"><b>${escHtml(m.name)}</b> <small class="prod-size">(${escHtml(costUnitLabel(m.base_unit))})</small></div>
          <div class="cost-mat-row"><span>متوسط: <b>${costPriceText(p.avg, m.base_unit)}</b></span><span>آخر سعر: <b>${costPriceText(p.last, m.base_unit)}</b>${p.lastDate ? ` <small>${escHtml(p.lastDate)}</small>` : ""}</span></div>
          <div class="cost-mat-row"><label>سعر يدوي (ر لكل ${escHtml(costUnitLabel(m.base_unit))})
            <input type="number" inputmode="decimal" min="0" step="any" class="cost-override" data-mat="${escHtml(m.id)}" value="${costOverrides[m.id] ? escHtml(costOverrides[m.id].price) : ""}" placeholder="من المشتريات" ${costCanEdit() ? "" : "disabled"}></label></div>
        </div>`;
      }).join("")}</details>`).join("") + `<div class="att-now">المواد المسجّلة بالكرتونة أو الربطة (وحدة) سعرها للوحدة كاملة — للريسبي اكتب الكمية بنفس الوحدة، أو حط سعر يدوي.</div>`;
  } else if (costEditing) {
    body = costEditorHtml(prices);
  } else {
    const list = costRecipes.filter(r => r.active !== false);
    body = (costCanEdit() ? `<div class="att-actions"><button class="btn" id="costNewBtn">➕ صنف جديد</button></div>` : "") +
      (!list.length ? `<div class="empty-state">ما في أصناف لسا — أضف الريسبي</div>` : list.map(r => {
        const c = costOfRecipe(r, prices);
        return `<button type="button" class="item-card cost-rec" data-cost-open="${escHtml(r.id)}">
          <div class="prod-item-head"><b>${escHtml(r.name)}</b>${r.size ? ` <small class="prod-size">(${escHtml(r.size)})</small>` : ""}
            <span class="prod-total">التكلفة: <b>${costFmt(c.total)} ر</b></span></div>
          <div class="cost-mat-row"><span>سعر البيع: <b>${r.sell_price ? costFmt(r.sell_price) + " ر" : "—"}</b></span>
            <span>نسبة التكلفة: <b class="${c.pct > 40 ? "prod-short-count" : ""}">${c.pct === null ? "—" : costFmt(c.pct, 1) + "%"}</b></span>
            ${c.missing ? `<span class="prod-short-count">⚠ ${c.missing} مكوّن بدون سعر</span>` : ""}</div>
        </button>`;
      }).join(""));
  }
  view.innerHTML = head + body;
  view.querySelectorAll("[data-cost-tab]").forEach(b => b.addEventListener("click", () => { costTab = b.dataset.costTab; costEditing = null; renderCostingView(); }));
  view.querySelectorAll("[data-cost-basis]").forEach(b => b.addEventListener("click", () => { costBasis = b.dataset.costBasis; renderCostingView(); }));
  view.querySelectorAll("[data-cost-open]").forEach(b => b.addEventListener("click", () => {
    const r = costRecipes.find(x => x.id === b.dataset.costOpen);
    costEditing = JSON.parse(JSON.stringify(r)); renderCostingView();
  }));
  const nb = document.getElementById("costNewBtn");
  if (nb) nb.addEventListener("click", () => { costEditing = { id: "", name: "", size: "", sell_price: null, ingredients: [], notes: "" }; renderCostingView(); });
  view.querySelectorAll(".cost-override").forEach(inp => inp.addEventListener("change", () => costSaveOverride(inp.dataset.mat, inp.value)));
  if (costEditing) bindCostEditor();
}

function costEditorHtml(prices) {
  const r = costEditing;
  const c = costOfRecipe(r, prices);
  const ed = costCanEdit();
  const opts = costMaterials.map(m => `<option value="${escHtml(m.name)}"></option>`).join("");
  return `<div class="item-card">
    <div class="inputs-row">
      <div class="field"><label>اسم الصنف</label><input type="text" id="costName" value="${escHtml(r.name || "")}" ${ed ? "" : "disabled"}></div>
      <div class="field"><label>الحجم</label><input type="text" id="costSize" value="${escHtml(r.size || "")}" placeholder="مثلاً: وجبة 150" ${ed ? "" : "disabled"}></div>
      <div class="field"><label>سعر البيع (ر)</label><input type="number" inputmode="decimal" step="any" id="costSell" value="${r.sell_price ?? ""}" ${ed ? "" : "disabled"}></div>
    </div>
    <datalist id="costMatList">${opts}</datalist>
    <table class="prod-table cost-table"><thead><tr><th>المكوّن</th><th>الكمية</th><th>سعر الوحدة</th><th>التكلفة</th>${ed ? "<th></th>" : ""}</tr></thead><tbody>
      ${c.lines.map((g, i) => {
        const m = costMaterials.find(x => x.id === g.material_id);
        return `<tr data-cost-row="${i}">
          <td><input type="text" list="costMatList" class="cost-mat-in" value="${escHtml(m ? m.name : g.name || "")}" placeholder="ابحث عن مادة" ${ed ? "" : "disabled"}></td>
          <td><div class="prod-cell"><input type="number" inputmode="decimal" min="0" step="any" class="cost-qty" value="${g.qty ?? ""}" ${ed ? "" : "disabled"}><small>${escHtml(costUnitLabel(m && m.base_unit))}</small></div></td>
          <td><small class="cost-unit-cell">${m ? costPriceText(g.unit, m.base_unit) : "—"}</small></td>
          <td><b class="cost-line-cell">${g.cost === null ? "⚠" : costFmt(g.cost)}</b></td>
          ${ed ? `<td><button type="button" class="btn btn-ghost att-small cost-del" title="شيل">✕</button></td>` : ""}
        </tr>`;
      }).join("")}
    </tbody></table>
    ${ed ? `<button type="button" class="btn btn-ghost att-small" id="costAddRow">➕ مكوّن</button>` : ""}
    <div class="cost-summary" id="costSummary">
      <span>التكلفة الكاملة: <b>${costFmt(c.total)} ر</b></span>
      <span>نسبة التكلفة: <b>${c.pct === null ? "—" : costFmt(c.pct, 1) + "%"}</b></span>
      ${c.missing ? `<span class="prod-short-count">⚠ ${c.missing} مكوّن بدون سعر — حط سعر يدوي من «أسعار المواد الخام»</span>` : ""}
    </div>
    <div class="field"><label>ملاحظات</label><input type="text" id="costNotes" value="${escHtml(r.notes || "")}" ${ed ? "" : "disabled"}></div>
    <div class="att-actions">
      ${ed ? `<button class="btn" id="costSaveBtn">💾 حفظ</button>` : ""}
      <button class="btn btn-ghost" id="costBackBtn">→ رجوع</button>
      ${ed && r.id ? `<button class="btn btn-ghost" id="costHideBtn">🗑 إخفاء الصنف</button>` : ""}
    </div>
  </div>`;
}

// قراءة الشاشة لداخل الريسبي المفتوح (بدون حفظ)
function costReadEditor() {
  const r = costEditing;
  const val = (id) => (document.getElementById(id) || {}).value;
  if (document.getElementById("costName")) {
    r.name = (val("costName") || "").trim(); r.size = (val("costSize") || "").trim();
    r.sell_price = val("costSell") === "" ? null : Number(val("costSell")); r.notes = (val("costNotes") || "").trim();
  }
  r.ingredients = [...document.querySelectorAll("[data-cost-row]")].map(tr => {
    const name = tr.querySelector(".cost-mat-in").value.trim();
    const m = costMaterials.find(x => x.name === name);
    return { material_id: m ? m.id : "", name, qty: tr.querySelector(".cost-qty").value === "" ? null : Math.max(0, Number(tr.querySelector(".cost-qty").value)) };
  });
}

// تحديث الأرقام بدون ما نعيد رسم الشاشة (إعادة الرسم وقت الكتابة كانت تضيّع كبسة الزر اللي بعدها)
function costLiveUpdate() {
  costReadEditor();
  const prices = costPriceTable();
  const c = costOfRecipe(costEditing, prices);
  document.querySelectorAll("[data-cost-row]").forEach((tr, i) => {
    const g = c.lines[i] || {};
    const m = costMaterials.find(x => x.id === g.material_id);
    const qtyUnit = tr.querySelector(".prod-cell small");
    if (qtyUnit) qtyUnit.textContent = costUnitLabel(m && m.base_unit);
    tr.querySelector(".cost-unit-cell").textContent = m ? costPriceText(g.unit, m.base_unit) : "—";
    tr.querySelector(".cost-line-cell").textContent = g.cost === null || g.cost === undefined ? "⚠" : costFmt(g.cost);
  });
  const sum = document.getElementById("costSummary");
  if (sum) sum.innerHTML = `<span>التكلفة الكاملة: <b>${costFmt(c.total)} ر</b></span>
    <span>نسبة التكلفة: <b>${c.pct === null ? "—" : costFmt(c.pct, 1) + "%"}</b></span>
    ${c.missing ? `<span class="prod-short-count">⚠ ${c.missing} مكوّن بدون سعر — حط سعر يدوي من «أسعار المواد الخام»</span>` : ""}`;
}

function bindCostEditor() {
  document.querySelectorAll(".cost-mat-in, .cost-qty, #costSell").forEach(i => i.addEventListener("input", costLiveUpdate));
  document.querySelectorAll(".cost-del").forEach(b => b.addEventListener("click", () => {
    costReadEditor(); costEditing.ingredients.splice(Number(b.closest("[data-cost-row]").dataset.costRow), 1); renderCostingView();
  }));
  const add = document.getElementById("costAddRow");
  if (add) add.addEventListener("click", () => { costReadEditor(); costEditing.ingredients.push({ material_id: "", name: "", qty: null }); renderCostingView(); });
  document.getElementById("costBackBtn").addEventListener("click", () => { costEditing = null; renderCostingView(); });
  const sv = document.getElementById("costSaveBtn");
  if (sv) sv.addEventListener("click", () => costSaveRecipe(true));
  const hd = document.getElementById("costHideBtn");
  if (hd) hd.addEventListener("click", async () => {
    if (!(await phConfirm("الصنف بيختفي من القائمة (ما بينمسح).", { title: "إخفاء الصنف", ok: "إخفاء", cancel: "إلغاء", danger: true }))) return;
    costEditing.active = false; costSaveRecipe(false);
  });
}

async function costSaveRecipe(read) {
  if (read) costReadEditor();
  const r = costEditing;
  if (!r.name) { showToast("اكتب اسم الصنف"); return; }
  const bad = r.ingredients.filter(g => g.name && !g.material_id);
  if (bad.length) { showToast(`⚠ ما لقيت المادة: ${bad[0].name} — اختارها من القائمة`); return; }
  const emp = Auth.getEmployee() || {};
  const row = { id: r.id || "rcp_" + Date.now().toString(36), name: r.name, size: r.size || "", sell_price: r.sell_price,
    ingredients: r.ingredients.filter(g => g.material_id), notes: r.notes || "", active: r.active !== false,
    updated_by: emp.name || "", updated_at: new Date().toISOString() };
  try {
    await SupaEngine.saveCostRecipe(row);
    const i = costRecipes.findIndex(x => x.id === row.id);
    if (i >= 0) costRecipes[i] = row; else costRecipes.push(row);
    costEditing = row.active ? row : null;
    showToast(row.active ? "✅ انحفظ الصنف" : "✅ انخفى الصنف");
    renderCostingView();
  } catch (e) { showToast("⚠ ما انحفظ: " + (e.message || e)); }
}

async function costSaveOverride(materialId, value) {
  const emp = Auth.getEmployee() || {};
  try {
    if (value === "") {
      // بلا سعر يدوي: منرجع لسعر المشتريات (ما منمسح الصف — منحط السعر فاضي بالشاشة بس)
      await SupaEngine.saveCostPrice({ material_id: materialId, price: -1, note: "off", updated_by: emp.name || "", updated_at: new Date().toISOString() });
      delete costOverrides[materialId];
    } else {
      const row = { material_id: materialId, price: Math.max(0, Number(value)), note: "", updated_by: emp.name || "", updated_at: new Date().toISOString() };
      await SupaEngine.saveCostPrice(row);
      costOverrides[materialId] = row;
    }
    showToast("✅ انحفظ السعر");
    renderCostingView();
  } catch (e) { showToast("⚠ ما انحفظ: " + (e.message || e)); }
}
