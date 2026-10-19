// ==================== المستلم المتبقي (فريق الشيف) ====================
// الشاطئ وعبداللطيف بيرجّعوا المتبقي للروضة، والروضة (غالب) بترجّعه كله للمطبخ.
// الشاشة بتعرض المتبقي اللي سجّله كل فرع بآخر اليوم، وفريق الشيف بيكبس ✓ أو بيكتب الكمية اللي وصلته فعلاً.
// المتبقي المأكَّد بينقص من إنتاج طلبية اليوم اللي بعده (صفحة الإنتاج). الصوص لحاله ما بينقص.
// صف لكل يوم بجدول leftover_checks: items = { "فرع|item_id": { ok: true } | { qty: رقم } }

let leftDate = new Date().getHours() >= 12 ? todayStr() : addDaysStr(todayStr(), -1);
let leftLoadSeq = 0;
let leftLines = [];  // [{ key, branch, itemId, name, category, unit, qty, sauce }]
let leftSaved = null;

// متبقي كل الفروع ليوم معيّن (من شاشة جرد المتبقي)
async function leftoverLines(date) {
  await Items.load();
  const branches = branchList();
  const days = await Promise.all(branches.map(b => SupaEngine.getDay(date, b).catch(() => null)));
  const order = new Map(Items.current.map((it, i) => [it.id, i]));
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  const lines = [];
  days.forEach((day, i) => ((day && day.items) || []).forEach(d => {
    const w = num(d.remainingWeight), sauce = num(d.remainingSauce), plain = num(d.remaining);
    const qty = w !== null ? w : sauce !== null ? sauce : plain;
    if (!(qty > 0)) return;
    const it = Items.byId(d.itemId) || { id: d.itemId, name: d.itemName, category: "-", unit: d.unit };
    lines.push({ key: `${branches[i]}|${d.itemId}`, branch: branches[i], itemId: d.itemId,
      name: typeof chefReportName === "function" ? chefReportName(it, d.cookName) : (d.itemName || it.name),
      rawName: it.name || d.itemName, cookName: d.cookName || "",
      category: it.category || "-", unit: d.unit || it.unit || "", qty, sauce: w === null && sauce !== null && sauce > 0,
      sort: order.has(d.itemId) ? order.get(d.itemId) : 9999 });
  }));
  return lines.sort((a, b) => branches.indexOf(a.branch) - branches.indexOf(b.branch) || a.sort - b.sort);
}

// الكمية المأكَّدة لسطر: ✓ = نفس المسجّل، أو الرقم اللي كتبه الشيف
function leftConfirmed(saved, l) {
  const v = saved && saved.items && saved.items[l.key];
  if (!v) return null;
  return v.ok ? l.qty : Number(v.qty);
}

// للرئيسية: كم سطر انأكّد من كم
async function leftoverStatus(date) {
  const [lines, saved] = await Promise.all([leftoverLines(date), SupaEngine.getLeftoverCheck(date)]);
  return { total: lines.length, done: lines.filter(l => leftConfirmed(saved, l) !== null).length };
}

// لصفحة الإنتاج: المتبقي المأكَّد لكل فرع وصنف (بالجرام/العدد) — من متبقي اليوم اللي قبل الطلبية
async function leftoverForProduction(orderDate) {
  const date = addDaysStr(orderDate, -1);
  const [lines, saved] = await Promise.all([leftoverLines(date), SupaEngine.getLeftoverCheck(date)]);
  return lines.filter(l => !l.sauce).map(l => ({ ...l, confirmed: leftConfirmed(saved, l) })).filter(l => l.confirmed > 0);
}

async function loadLeftoversView() {
  const view = document.getElementById("leftoversView");
  if (!view) return;
  const seq = ++leftLoadSeq;
  view.innerHTML = '<div class="loader">جاري التحميل…</div>';
  try {
    const [lines, saved] = await Promise.all([leftoverLines(leftDate), SupaEngine.getLeftoverCheck(leftDate)]);
    if (seq !== leftLoadSeq) return;
    leftLines = lines; leftSaved = saved;
  } catch (e) {
    if (seq !== leftLoadSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر التحميل — ${escHtml(e.message || String(e))}</div>`;
    return;
  }
  renderLeftoversView();
}

function leftStateHtml(l, v) {
  if (!v) return `<span class="prod-diff todo">—</span>`;
  if (v.ok) return `<span class="prod-diff ok">✓ مطابق</span>`;
  const d = Number(v.qty) - l.qty;
  if (Math.abs(d) < 0.01) return `<span class="prod-diff ok">✓ مطابق</span>`;
  return d < 0 ? `<span class="prod-diff short">ناقص ${prodFmt(-d)}</span>` : `<span class="prod-diff over">زيادة ${prodFmt(d)}</span>`;
}

function renderLeftoversView() {
  const view = document.getElementById("leftoversView");
  const items = (leftSaved && leftSaved.items) || {};
  const ro = Auth.isReadOnly();
  const done = leftLines.filter(l => items[l.key]).length;
  const branches = [...new Set(leftLines.map(l => l.branch))];
  const unitTxt = (l) => (isWeightUnit(l.unit) ? "جم" : l.unit);
  view.innerHTML = `
    <h2 class="juice-page-title">♻️ المستلم المتبقي</h2>
    <div class="item-card">
      <div class="inputs-row">
        <div class="field"><label>متبقي يوم</label><input type="date" id="leftDateInput" value="${leftDate}"></div>
        <div class="field"><label>الملخص</label><div class="readonly-field">${done}/${leftLines.length} صنف</div></div>
      </div>
      <div class="att-now">الشاطئ وعبداللطيف بيرجّعوا للروضة، والروضة بترجّع للمطبخ. كبّس ✓ إذا الكمية مطابقة، أو اكتب اللي وصلك. المتبقي المأكَّد بينقص من إنتاج بكرا.</div>
    </div>
    ${!leftLines.length ? `<div class="empty-state">ما في متبقي مسجّل لهاليوم</div>` : branches.map(b => {
      const lines = leftLines.filter(l => l.branch === b);
      return `<details class="prod-cat" open><summary class="prod-cat-head"><span>🏪 ${escHtml(b)}</span>
        <span class="prod-cat-count">${lines.filter(l => items[l.key]).length}/${lines.length}</span></summary>
        ${lines.map(l => {
          const v = items[l.key];
          return `<div class="item-card left-item" data-left-key="${escHtml(l.key)}">
            <div class="prod-item-head"><b>${escHtml(l.name)}</b>${l.sauce ? ` <small class="prod-size">(صوص بس)</small>` : ""}
              <span class="prod-total">سجّل الفرع: <b>${prodFmt(l.qty)} ${escHtml(unitTxt(l))}</b></span></div>
            <div class="left-row">
              <button type="button" class="left-ok${v && v.ok ? " on" : ""}" ${ro ? "disabled" : ""}>✓ مطابق</button>
              <input type="number" inputmode="decimal" min="0" step="any" class="left-qty" placeholder="أو اكتب اللي وصل" value="${v && !v.ok ? escHtml(v.qty) : ""}" ${ro ? "disabled" : ""}>
              <span class="left-state">${leftStateHtml(l, v)}</span>
            </div>
          </div>`;
        }).join("")}
      </details>`;
    }).join("")}
    ${leftLines.length && !ro ? `<div class="att-actions prod-save-bar"><button class="btn" id="leftSaveBtn">💾 حفظ الاستلام</button></div>` : ""}
    ${leftSaved && leftSaved.checked_by ? `<div class="att-now">آخر حفظ: ${escHtml(leftSaved.checked_by)} · ${new Date(leftSaved.checked_at).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" })}</div>` : ""}`;
  const d = document.getElementById("leftDateInput");
  if (d) d.addEventListener("change", () => { leftDate = d.value || todayStr(); loadLeftoversView(); });
  view.querySelectorAll(".left-item").forEach(card => {
    const l = leftLines.find(x => x.key === card.dataset.leftKey);
    const ok = card.querySelector(".left-ok"), inp = card.querySelector(".left-qty"), st = card.querySelector(".left-state");
    const cur = () => (ok.classList.contains("on") ? { ok: true } : inp.value !== "" ? { qty: Number(inp.value) } : null);
    ok.addEventListener("click", () => { ok.classList.toggle("on"); if (ok.classList.contains("on")) inp.value = ""; st.innerHTML = leftStateHtml(l, cur()); });
    inp.addEventListener("input", () => { if (inp.value !== "") ok.classList.remove("on"); st.innerHTML = leftStateHtml(l, cur()); });
  });
  const sb = document.getElementById("leftSaveBtn");
  if (sb) sb.addEventListener("click", saveLeftovers);
}

async function saveLeftovers() {
  const btn = document.getElementById("leftSaveBtn");
  const items = {};
  document.querySelectorAll("#leftoversView .left-item").forEach(card => {
    const ok = card.querySelector(".left-ok"), inp = card.querySelector(".left-qty");
    if (ok.classList.contains("on")) items[card.dataset.leftKey] = { ok: true };
    else if (inp.value !== "") items[card.dataset.leftKey] = { qty: Number(inp.value) };
  });
  btn.disabled = true; btn.textContent = "جاري الحفظ…";
  try {
    const emp = Auth.getEmployee() || {};
    const row = { date: leftDate, items, checked_by: emp.name || "", checked_at: new Date().toISOString() };
    await SupaEngine.saveLeftoverCheck(row);
    leftSaved = row;
    showToast("✅ انحفظ استلام المتبقي");
    renderLeftoversView();
  } catch (e) {
    showToast("⚠ ما انحفظ: " + (e.message || e));
    btn.disabled = false; btn.textContent = "💾 حفظ الاستلام";
  }
}
