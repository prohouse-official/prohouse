// ==================== تسجيل الإنتاج (المطبخ المركزي) ====================
// فريق الشيف بيكتب الكمية اللي انتجها من كل صنف، والشاشة بتطابقها مع مجموع طلبية الفروع لنفس اليوم.
// صف واحد لكل يوم بجدول production_checks: items = { item_id: الكمية المنتجة }.

let prodDate = new Date().getHours() >= 12 ? addDaysStr(todayStr(), 1) : todayStr();
let prodLoadSeq = 0;
let prodLines = [];   // [{ key, itemId, name, category, unit, ordered, perBranch: {فرع: كمية} }]
let prodSaved = null; // صف production_checks

// طلبية الفروع بس (بدون اشتراكات التوصيل) — سطر لكل صنف: الإجمالي وكم طالب كل فرع
const prodNum = (t) => {
  const m = /^([\d.]+)(?:\s*(جم))?(?:\s*\((.+)\))?$/.exec(String(t || "").trim());
  return m ? { qty: Number(m[1]), unit: m[2] || m[3] || "" } : null;
};
async function prodOrderLines(date) {
  await Items.load();
  const branches = branchList();
  const perBranch = await Promise.all(branches.map(b => SupaEngine.getTomorrowOrder(date, b).catch(() => [])));
  const order = new Map(Items.current.map((it, i) => [it.id, i]));
  const sheet = chefCombinedSheet(branches, perBranch, order, []);
  return sheet.rows.map(r => {
    const parts = {};
    sheet.branches.forEach((b, i) => { if (r.byBranch[i]) parts[b] = { text: r.byBranch[i], num: prodNum(r.byBranch[i]) }; });
    return { key: `${r.category}|${r.name}`, name: r.name, category: r.category, size: r.size || "", totalText: r.total, perBranch: parts };
  });
}
// الصنف خلص تسجيله لما ينكتب المنتج لكل فرع طالبه
const prodVal = (items, key, b) => { const v = items[key]; return v && typeof v === "object" ? v[b] : undefined; };
const prodLineDone = (items, l) => Object.keys(l.perBranch).every(b => { const v = prodVal(items, l.key, b); return v !== undefined && v !== ""; });

// يوم الطلبية الافتراضي: الشيف بيشتغل على طلبية بكرا (بعد نص الليل صارت طلبية اليوم)
const prodDefaultDate = () => (new Date().getHours() >= 12 ? addDaysStr(todayStr(), 1) : todayStr());

// ملخص اليوم للرئيسية: كم صنف انسجّل إنتاجه من كم، والطباعة
async function productionStatus(date) {
  const [lines, saved] = await Promise.all([prodOrderLines(date), SupaEngine.getProduction(date)]);
  const items = (saved && saved.items) || {};
  const done = lines.filter(l => prodLineDone(items, l)).length;
  return { total: lines.length, done, printedAt: saved && saved.printed_at };
}

// تسجيل وقت طباعة طلبية الفروع (من تقرير الشيف)
async function markProductionPrinted(date) {
  try {
    await SupaEngine.saveProduction({ date, printed_at: new Date().toISOString() }); // بيحدّث وقت الطباعة بس
  } catch (e) { /* الطباعة أهم من التسجيل */ }
}

async function loadProductionView() {
  const view = document.getElementById("productionView");
  if (!view) return;
  const seq = ++prodLoadSeq;
  view.innerHTML = '<div class="loader">جاري تحميل الطلبية…</div>';
  try {
    const [lines, saved] = await Promise.all([prodOrderLines(prodDate), SupaEngine.getProduction(prodDate)]);
    if (seq !== prodLoadSeq) return;
    prodLines = lines; prodSaved = saved;
  } catch (e) {
    if (seq !== prodLoadSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر التحميل — ${escHtml(e.message || String(e))}</div>`;
    return;
  }
  renderProductionView();
}

const prodFmt = (n) => (Math.round(n * 100) / 100).toLocaleString("en-US");
function prodDiffHtml(ordered, produced) {
  if (produced === undefined || produced === null || produced === "") return `<span class="prod-diff todo">—</span>`;
  if (ordered === null || isNaN(Number(produced))) return `<span class="prod-diff ok">✓ مسجّل</span>`;
  const d = Number(produced) - ordered;
  const tol = Math.max(ordered * 0.05, 0.01);
  if (Math.abs(d) <= tol) return `<span class="prod-diff ok">✓ مطابق</span>`;
  return d < 0 ? `<span class="prod-diff short">ناقص ${prodFmt(-d)}</span>` : `<span class="prod-diff over">زيادة ${prodFmt(d)}</span>`;
}

function renderProductionView() {
  const view = document.getElementById("productionView");
  const items = (prodSaved && prodSaved.items) || {};
  const ro = Auth.isReadOnly();
  const done = prodLines.filter(l => prodLineDone(items, l)).length;
  const cats = [];
  prodLines.forEach(l => { if (!cats.includes(l.category)) cats.push(l.category); });
  view.innerHTML = `
    <h2 class="juice-page-title">🏭 تسجيل الإنتاج</h2>
    <div class="item-card">
      <div class="inputs-row">
        <div class="field"><label>طلبية يوم</label><input type="date" id="prodDateInput" value="${prodDate}"></div>
        <div class="field"><label>الملخص</label><div class="readonly-field" id="prodSummary">${done}/${prodLines.length} صنف</div></div>
      </div>
      ${prodSaved && prodSaved.printed_at ? `<div class="att-now">🖨 انطبعت الطلبية ${new Date(prodSaved.printed_at).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" })}</div>` : ""}
      ${tabAllowed("report") ? `<button type="button" class="btn btn-ghost att-small" id="prodPrintBtn">🖨 اطبع طلبية الفروع</button>` : ""}
    </div>
    ${!prodLines.length ? `<div class="empty-state">ما في طلبية فروع لهاليوم</div>` : cats.map(cat => {
      const lines = prodLines.filter(l => l.category === cat);
      return `<details class="prod-cat" open><summary class="prod-cat-head"><span>${escHtml(cat || "أصناف")}</span>
        <span class="prod-cat-count" data-prod-cat="${escHtml(cat)}">${lines.filter(l => prodLineDone(items, l)).length}/${lines.length}</span></summary>
        ${lines.map(l => `<div class="item-card prod-item" data-prod-line="${escHtml(l.key)}">
          <div class="prod-item-head"><b>${escHtml(l.name)}</b>${l.size ? ` <small class="prod-size">(${escHtml(l.size)})</small>` : ""}
            <span class="prod-total">📋 الإجمالي: <b>${escHtml(l.totalText)}</b></span></div>
          <div class="prod-branch-grid">${Object.entries(l.perBranch).map(([b, o]) => {
            const v = prodVal(items, l.key, b);
            return `<div class="prod-branch">
              <div class="prod-branch-name">${escHtml(b)}</div>
              <div class="prod-branch-need">طلب: ${escHtml(o.text)}</div>
              <div class="prod-cell"><input type="${o.num ? "number" : "text"}" inputmode="decimal" min="0" step="any" class="prod-input" data-prod-key="${escHtml(l.key)}" data-prod-branch="${escHtml(b)}" value="${escHtml(v ?? "")}" placeholder="المنتج" ${ro ? "disabled" : ""}>
                ${ro ? "" : `<button type="button" class="prod-full" title="انعمل كامل">✓</button>`}</div>
              <div class="prod-diff-slot">${prodDiffHtml(o.num ? o.num.qty : null, v)}</div>
            </div>`;
          }).join("")}</div>
        </div>`).join("")}
      </details>`;
    }).join("")}
    ${prodLines.length && !ro ? `<div class="att-actions prod-save-bar"><button class="btn" id="prodSaveBtn">💾 حفظ الإنتاج</button></div>` : ""}
    ${prodSaved && prodSaved.saved_at && prodSaved.chef_name ? `<div class="att-now">آخر حفظ: ${escHtml(prodSaved.chef_name)} · ${new Date(prodSaved.saved_at).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" })}</div>` : ""}`;
  const d = document.getElementById("prodDateInput");
  if (d) d.addEventListener("change", () => { prodDate = d.value || todayStr(); loadProductionView(); });
  const refresh = (inp) => {
    const l = prodLines.find(x => x.key === inp.dataset.prodKey);
    const o = l && l.perBranch[inp.dataset.prodBranch];
    const slot = inp.closest(".prod-branch").querySelector(".prod-diff-slot");
    if (o && slot) slot.innerHTML = prodDiffHtml(o.num ? o.num.qty : null, inp.value);
  };
  view.querySelectorAll(".prod-input").forEach(inp => inp.addEventListener("input", () => refresh(inp)));
  view.querySelectorAll(".prod-full").forEach(btn => btn.addEventListener("click", () => {
    const inp = btn.parentElement.querySelector(".prod-input");
    const l = prodLines.find(x => x.key === inp.dataset.prodKey);
    const o = l && l.perBranch[inp.dataset.prodBranch];
    if (!o) return;
    inp.value = o.num ? o.num.qty : o.text;
    refresh(inp);
  }));
  const pb = document.getElementById("prodPrintBtn");
  if (pb) pb.addEventListener("click", () => { if (typeof openChefReportFor === "function") openChefReportFor(prodDate, ""); });
  const sb = document.getElementById("prodSaveBtn");
  if (sb) sb.addEventListener("click", saveProductionView);
}

async function saveProductionView() {
  const btn = document.getElementById("prodSaveBtn");
  const items = {};
  document.querySelectorAll("#productionView .prod-input").forEach(inp => {
    if (inp.value.trim() === "") return;
    (items[inp.dataset.prodKey] = items[inp.dataset.prodKey] || {})[inp.dataset.prodBranch] = inp.type === "number" ? Number(inp.value) : inp.value.trim();
  });
  btn.disabled = true; btn.textContent = "جاري الحفظ…";
  try {
    const emp = Auth.getEmployee() || {};
    const row = { date: prodDate, items, chef_name: emp.name || "", saved_at: new Date().toISOString() };
    await SupaEngine.saveProduction(row);
    prodSaved = { ...(prodSaved || {}), ...row };
    showToast("✅ انحفظ الإنتاج");
    renderProductionView();
  } catch (e) {
    showToast("⚠ ما انحفظ: " + (e.message || e));
    btn.disabled = false; btn.textContent = "💾 حفظ الإنتاج";
  }
}
