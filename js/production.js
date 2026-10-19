// ==================== تسجيل الإنتاج (المطبخ المركزي) ====================
// فريق الشيف بيكتب الكمية اللي انتجها من كل صنف، والشاشة بتطابقها مع مجموع طلبية الفروع لنفس اليوم.
// صف واحد لكل يوم بجدول production_checks: items = { item_id: الكمية المنتجة }.

let prodDate = todayStr();
let prodLoadSeq = 0;
let prodLines = [];   // [{ key, itemId, name, category, unit, ordered, perBranch: {فرع: كمية} }]
let prodSaved = null; // صف production_checks

// مجموع طلبية الفروع لليوم: صنف واحد لكل item_id (الكمية الملغاية/الفاضية ما بتنحسب)
async function prodOrderLines(date) {
  await Items.load();
  const branches = branchList();
  const orders = await Promise.all(branches.map(b => SupaEngine.getTomorrowOrder(date, b).catch(() => [])));
  const map = new Map();
  orders.forEach((rows, i) => rows.forEach(r => {
    const q = Number(r.qty);
    if (!(q > 0)) return;
    const it = Items.byId(r.itemId) || {};
    // الفروع اللي بتطلب بالسفنديش بتكتب الجرامات والوحدة حجم السفنديش (1/3) — منوحّدها جرام
    const unit = /^\d\/\d$/.test(String(r.unit || "")) ? "جم" : (r.unit || it.unit || "");
    const key = r.itemId + "|" + unit;
    if (!map.has(key)) {
      const name = typeof chefReportName === "function" ? chefReportName({ name: r.itemName || it.name, category: it.category }, r.cookName) : (r.itemName || it.name);
      map.set(key, { key, itemId: r.itemId, name, category: it.category || "", unit, ordered: 0, perBranch: {} });
    }
    const line = map.get(key);
    line.ordered += q;
    line.perBranch[branches[i]] = (line.perBranch[branches[i]] || 0) + q;
  }));
  const order = new Map(Items.current.map((it, i) => [it.id, i]));
  return [...map.values()].sort((a, b) => (order.get(a.itemId) ?? 1e9) - (order.get(b.itemId) ?? 1e9));
}

// ملخص اليوم للرئيسية: كم صنف انسجّل إنتاجه من كم، والطباعة
async function productionStatus(date) {
  const [lines, saved] = await Promise.all([prodOrderLines(date), SupaEngine.getProduction(date)]);
  const items = (saved && saved.items) || {};
  const done = lines.filter(l => items[l.key] !== undefined && items[l.key] !== null && items[l.key] !== "").length;
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
  const d = Number(produced) - ordered;
  const tol = Math.max(ordered * 0.05, 0.01);
  if (Math.abs(d) <= tol) return `<span class="prod-diff ok">✓ مطابق</span>`;
  return d < 0 ? `<span class="prod-diff short">ناقص ${prodFmt(-d)}</span>` : `<span class="prod-diff over">زيادة ${prodFmt(d)}</span>`;
}

function renderProductionView() {
  const view = document.getElementById("productionView");
  const items = (prodSaved && prodSaved.items) || {};
  const ro = Auth.isReadOnly();
  const done = prodLines.filter(l => items[l.key] !== undefined && items[l.key] !== "").length;
  const short = prodLines.filter(l => items[l.key] !== undefined && items[l.key] !== "" && Number(items[l.key]) < l.ordered - Math.max(l.ordered * 0.05, 0.01)).length;
  const cats = [];
  prodLines.forEach(l => { if (!cats.includes(l.category)) cats.push(l.category); });
  view.innerHTML = `
    <h2 class="juice-page-title">🏭 تسجيل الإنتاج</h2>
    <div class="item-card">
      <div class="inputs-row">
        <div class="field"><label>يوم التوزيع</label><input type="date" id="prodDateInput" value="${prodDate}"></div>
        <div class="field"><label>الملخص</label><div class="readonly-field">${done}/${prodLines.length} صنف${short ? ` · <b class="prod-short-count">${short} ناقص</b>` : ""}</div></div>
      </div>
      ${prodSaved && prodSaved.printed_at ? `<div class="att-now">🖨 انطبعت الطلبية ${new Date(prodSaved.printed_at).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" })}</div>` : ""}
      ${tabAllowed("report") ? `<button type="button" class="btn btn-ghost att-small" id="prodPrintBtn">🖨 اطبع طلبية الفروع</button>` : ""}
    </div>
    ${!prodLines.length ? `<div class="empty-state">ما في طلبية فروع لهاليوم</div>` : cats.map(cat => `
      <div class="item-card">
        <div class="att-sheet-title">${escHtml(cat || "أصناف")}</div>
        <table class="prod-table"><thead><tr><th>الصنف</th><th>المطلوب</th><th>المنتج</th><th>المطابقة</th></tr></thead><tbody>
        ${prodLines.filter(l => l.category === cat).map(l => `<tr>
          <td><b>${escHtml(l.name)}</b><div class="prod-branches">${Object.entries(l.perBranch).map(([b, q]) => `${escHtml(b)} ${prodFmt(q)}`).join(" · ")}</div></td>
          <td>${prodFmt(l.ordered)} <small>${escHtml(l.unit)}</small></td>
          <td><input type="number" inputmode="decimal" min="0" step="any" class="prod-input" data-prod-key="${escHtml(l.key)}" value="${items[l.key] ?? ""}" ${ro ? "disabled" : ""}></td>
          <td data-prod-diff="${escHtml(l.key)}">${prodDiffHtml(l.ordered, items[l.key])}</td>
        </tr>`).join("")}
        </tbody></table>
      </div>`).join("")}
    ${prodLines.length && !ro ? `<div class="att-actions"><button class="btn" id="prodSaveBtn">💾 حفظ الإنتاج</button></div>` : ""}
    ${prodSaved && prodSaved.saved_at && prodSaved.chef_name ? `<div class="att-now">آخر حفظ: ${escHtml(prodSaved.chef_name)} · ${new Date(prodSaved.saved_at).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" })}</div>` : ""}`;
  const d = document.getElementById("prodDateInput");
  if (d) d.addEventListener("change", () => { prodDate = d.value || todayStr(); loadProductionView(); });
  view.querySelectorAll(".prod-input").forEach(inp => inp.addEventListener("input", () => {
    const l = prodLines.find(x => x.key === inp.dataset.prodKey);
    const cell = view.querySelector(`[data-prod-diff="${CSS.escape(inp.dataset.prodKey)}"]`);
    if (l && cell) cell.innerHTML = prodDiffHtml(l.ordered, inp.value);
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
    if (inp.value !== "") items[inp.dataset.prodKey] = Number(inp.value);
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
