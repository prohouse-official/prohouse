// ==================== تسجيل الإنتاج (المطبخ المركزي) ====================
// فريق الشيف بيكتب الكمية اللي انتجها من كل صنف، والشاشة بتطابقها مع مجموع طلبية الفروع لنفس اليوم.
// صف واحد لكل يوم بجدول production_checks: items = { item_id: الكمية المنتجة }.

let prodDate = new Date().getHours() >= 12 ? addDaysStr(todayStr(), 1) : todayStr();
let prodLoadSeq = 0;
let prodLines = [];   // [{ key, itemId, name, category, unit, ordered, perBranch: {فرع: كمية} }]
let prodSaved = null; // صف production_checks

// نفس الورقة المجمعة اللي بيستلمها الشيف (طلبية الفروع + الاشتراكات): سطر لكل صنف بإجمالي المطلوب
async function prodOrderLines(date) {
  await Items.load();
  const branches = branchList();
  const [perBranch, boq] = await Promise.all([
    Promise.all(branches.map(b => SupaEngine.getTomorrowOrder(date, b).catch(() => []))),
    SupaEngine.getTakrarBoq ? SupaEngine.getTakrarBoq(addDaysStr(date, 1)).catch(() => []) : []
  ]);
  const order = new Map(Items.current.map((it, i) => [it.id, i]));
  const sheet = chefCombinedSheet(branches, perBranch, order, boq || []);
  return sheet.rows.map(r => {
    // المطلوب رقم واحد (جم أو عدد) → منطابق عليه. لو مخلوط (جم + سفنديشات) بس بينكتب
    const m = /^([\d.]+)(?:\s*(جم))?(?:\s*\((.+)\))?$/.exec(String(r.total || "").trim());
    const parts = {};
    sheet.branches.forEach((b, i) => { if (r.byBranch[i]) parts[b] = r.byBranch[i]; });
    return { key: `${r.category}|${r.name}`, name: r.name, category: r.category, size: r.size || "",
      totalText: r.total, ordered: m ? Number(m[1]) : null, unit: m ? (m[2] || m[3] || "") : "", perBranch: parts };
  });
}

// يوم الطلبية الافتراضي: الشيف بيشتغل على طلبية بكرا (بعد نص الليل صارت طلبية اليوم)
const prodDefaultDate = () => (new Date().getHours() >= 12 ? addDaysStr(todayStr(), 1) : todayStr());

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
  const done = prodLines.filter(l => items[l.key] !== undefined && items[l.key] !== "").length;
  const short = prodLines.filter(l => items[l.key] !== undefined && items[l.key] !== "" && l.ordered !== null && Number(items[l.key]) < l.ordered - Math.max(l.ordered * 0.05, 0.01)).length;
  const cats = [];
  prodLines.forEach(l => { if (!cats.includes(l.category)) cats.push(l.category); });
  view.innerHTML = `
    <h2 class="juice-page-title">🏭 تسجيل الإنتاج</h2>
    <div class="item-card">
      <div class="inputs-row">
        <div class="field"><label>طلبية يوم</label><input type="date" id="prodDateInput" value="${prodDate}"></div>
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
          <td><b>${escHtml(l.name)}</b>${l.size ? ` <small class="prod-size">${escHtml(l.size)}</small>` : ""}<div class="prod-branches">${Object.entries(l.perBranch).map(([b, q]) => `${escHtml(b)} ${escHtml(q)}`).join(" · ")}</div></td>
          <td class="prod-need">${escHtml(l.totalText)}</td>
          <td><div class="prod-cell"><input type="${l.ordered === null ? "text" : "number"}" inputmode="decimal" min="0" step="any" class="prod-input" data-prod-key="${escHtml(l.key)}" value="${escHtml(items[l.key] ?? "")}" ${ro ? "disabled" : ""}>
            ${ro ? "" : `<button type="button" class="prod-full" data-prod-full="${escHtml(l.key)}" title="انعمل كامل">✓</button>`}</div></td>
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
  view.querySelectorAll(".prod-full").forEach(b => b.addEventListener("click", () => {
    const l = prodLines.find(x => x.key === b.dataset.prodFull);
    const inp = view.querySelector(`.prod-input[data-prod-key="${CSS.escape(b.dataset.prodFull)}"]`);
    if (!l || !inp) return;
    inp.value = l.ordered !== null ? l.ordered : l.totalText;
    inp.dispatchEvent(new Event("input"));
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
    if (inp.value.trim() !== "") items[inp.dataset.prodKey] = inp.type === "number" ? Number(inp.value) : inp.value.trim();
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
