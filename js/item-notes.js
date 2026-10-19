// ==================== ملاحظات الأصناف (متابعة يومية لكل فرع) ====================
// الفرع بيسجّل ملاحظاته على الأصناف اللي وصلته اليوم (من طلبيته)، والشيف والمالك بيشوفوا ملاحظات كل الفروع.
// صف لكل يوم وفرع بجدول item_notes: items = { item_id: { tags: [...], text } }، none = «ما في ملاحظات».

const INOTE_TAGS = ["👍 ممتاز", "🧂 ملح زيادة", "🧂 ملح ناقص", "🔥 ناشف / محروق", "🥶 مو مستوي", "😕 الطعم مو مضبوط", "📉 الكمية ناقصة", "📦 التغليف"];
const INOTE_ALL = "__all";
let inoteDate = todayStr();
let inoteBranch = "";
let inoteLoadSeq = 0;
let inoteLines = [];   // [{ itemId, name, category }]
let inoteRow = null;   // صف item_notes للفرع
let inoteAllRows = []; // لعرض كل الفروع
let inoteItemNames = {};

function inoteBranches() {
  if (Auth.canSeeAllBranches() || Auth.role() === "kitchen") return branchList();
  const mine = Auth.branches();
  const list = branchList().filter(b => mine.includes(b));
  return list.length ? list : [Branch.get()].filter(Boolean);
}
const inoteCanEdit = (branch) => !Auth.isReadOnly() && Auth.role() !== "kitchen" && (Auth.role() === "owner" || Auth.branches().includes(branch));

// أصناف طلبية الفرع لليوم (الكمية الفاضية ما بتنحسب)
async function inoteItemsFor(date, branch) {
  await Items.load();
  const [ordered, day] = await Promise.all([
    SupaEngine.getTomorrowOrder(date, branch).catch(() => []),
    SupaEngine.getDay(date, branch).catch(() => null)
  ]);
  // اللي وصل وما انطلب (الشيف بعته بداله) كمان بينكتب عليه ملاحظة
  const got = ((day && day.items) || []).filter(d => Number(d.received) > 0)
    .map(d => ({ itemId: d.itemId, itemName: d.itemName, qty: d.received, cookName: d.cookName || "" }));
  const rows = ordered.concat(got);
  const seen = new Set();
  const order = new Map(Items.current.map((it, i) => [it.id, i]));
  return rows.filter(r => Number(r.qty) > 0 && !seen.has(r.itemId) && seen.add(r.itemId)).map(r => {
    const it = Items.byId(r.itemId) || {};
    const name = typeof chefReportName === "function" ? chefReportName({ name: r.itemName || it.name, category: it.category }, r.cookName) : (r.itemName || it.name);
    return { itemId: r.itemId, name, category: it.category || "" };
  }).sort((a, b) => (order.get(a.itemId) ?? 1e9) - (order.get(b.itemId) ?? 1e9));
}

// عدد الأصناف اللي عليها ملاحظة (غير «ممتاز» لحالها)
function inoteIssues(row) {
  const items = (row && row.items) || {};
  return Object.values(items).filter(n => (n.text && n.text.trim()) || (n.tags || []).some(t => t !== INOTE_TAGS[0])).length;
}
// للرئيسية: انسجّلت ملاحظات اليوم ولا لا
async function itemNotesStatus(date, branch) {
  const row = await SupaEngine.getItemNotes(date, branch).catch(() => null);
  const saved = !!(row && (row.none || Object.keys(row.items || {}).length));
  return { saved, issues: inoteIssues(row), none: !!(row && row.none) };
}

let inoteDatePicked = false;
async function loadItemNotesView() {
  if (!inoteDatePicked) inoteDate = todayStr();
  const view = document.getElementById("itemnotesView");
  if (!view) return;
  const branches = inoteBranches();
  const canAll = branches.length > 1;
  if (inoteBranch !== INOTE_ALL || !canAll) {
    if (!branches.includes(inoteBranch)) inoteBranch = branches.includes(Branch.get()) ? Branch.get() : (canAll ? INOTE_ALL : branches[0] || "");
  }
  const seq = ++inoteLoadSeq;
  view.innerHTML = '<div class="loader">جاري التحميل…</div>';
  try {
    if (inoteBranch === INOTE_ALL) {
      inoteAllRows = await SupaEngine.getItemNotes(inoteDate, null);
      await Items.load();
      inoteItemNames = {};
      Items.current.forEach(it => { inoteItemNames[it.id] = it.name; });
    } else {
      const [lines, row] = await Promise.all([inoteItemsFor(inoteDate, inoteBranch), SupaEngine.getItemNotes(inoteDate, inoteBranch)]);
      inoteLines = lines; inoteRow = row;
    }
  } catch (e) {
    if (seq !== inoteLoadSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر التحميل — ${escHtml(e.message || String(e))}</div>`;
    return;
  }
  if (seq !== inoteLoadSeq) return;
  renderItemNotesView(branches, canAll);
}

function inoteNoteText(n) {
  return [...(n.tags || []), n.text && n.text.trim()].filter(Boolean).map(escHtml).join(" · ");
}

function renderItemNotesView(branches, canAll) {
  const view = document.getElementById("itemnotesView");
  const opts = (canAll ? [[INOTE_ALL, "كل الفروع"]] : []).concat(branches.map(b => [b, b]));
  const head = `
    <h2 class="juice-page-title">📝 ملاحظات الأصناف</h2>
    <div class="item-card"><div class="inputs-row">
      <div class="field"><label>التاريخ</label><input type="date" id="inoteDateInput" value="${inoteDate}"></div>
      <div class="field"><label>الفرع</label>${opts.length > 1
        ? `<select id="inoteBranchSelect">${opts.map(([v, t]) => `<option value="${escHtml(v)}" ${v === inoteBranch ? "selected" : ""}>${escHtml(t)}</option>`).join("")}</select>`
        : `<div class="readonly-field">${escHtml(inoteBranch || "—")}</div>`}</div>
    </div></div>`;
  let body;
  if (inoteBranch === INOTE_ALL) {
    body = branches.map(b => {
      const row = inoteAllRows.find(r => r.branch === b);
      const items = (row && row.items) || {};
      const list = Object.entries(items).filter(([, n]) => (n.tags || []).length || (n.text || "").trim());
      return `<div class="item-card"><div class="att-sheet-title">🏪 ${escHtml(b)} ${row ? `<small>${escHtml(row.saved_by || "")}</small>` : ""}</div>
        ${!row ? `<div class="empty-state">لسا ما سجّل ملاحظات</div>`
          : row.none && !list.length ? `<div class="inote-ok">✅ ما في ملاحظات</div>`
          : list.map(([id, n]) => `<div class="inote-line"><b>${escHtml(n.name || inoteItemNames[id] || id)}</b><span>${inoteNoteText(n)}</span></div>`).join("")}
      </div>`;
    }).join("");
  } else {
    const edit = inoteCanEdit(inoteBranch);
    const items = (inoteRow && inoteRow.items) || {};
    const cats = [];
    inoteLines.forEach(l => { if (!cats.includes(l.category)) cats.push(l.category); });
    body = !inoteLines.length ? `<div class="empty-state">ما في أصناف بطلبية هاليوم</div>` : cats.map(cat => `
      <div class="item-card"><div class="att-sheet-title">${escHtml(cat || "أصناف")}</div>
      ${inoteLines.filter(l => l.category === cat).map(l => {
        const n = items[l.itemId] || {};
        return `<div class="inote-item" data-inote-id="${escHtml(l.itemId)}" data-inote-name="${escHtml(l.name)}">
          <div class="inote-name">${escHtml(l.name)}</div>
          <div class="inote-tags">${INOTE_TAGS.map(t => `<button type="button" class="inote-tag${(n.tags || []).includes(t) ? " on" : ""}" data-tag="${escHtml(t)}" ${edit ? "" : "disabled"}>${t}</button>`).join("")}</div>
          <input type="text" class="inote-text" placeholder="ملاحظة (اختياري)" value="${escHtml(n.text || "")}" ${edit ? "" : "disabled"}>
        </div>`;
      }).join("")}</div>`).join("") + (edit ? `
      <div class="att-actions">
        <button class="btn" id="inoteSaveBtn">💾 حفظ الملاحظات</button>
        <button class="btn btn-ghost" id="inoteNoneBtn">✅ ما في ملاحظات</button>
      </div>` : "") + (inoteRow && inoteRow.saved_at ? `<div class="att-now">آخر حفظ: ${escHtml(inoteRow.saved_by || "")} · ${new Date(inoteRow.saved_at).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" })}${inoteRow.none ? " · ما في ملاحظات" : ""}</div>` : "");
  }
  view.innerHTML = head + body;
  const d = document.getElementById("inoteDateInput");
  if (d) d.addEventListener("change", () => { inoteDate = d.value || todayStr(); inoteDatePicked = true; loadItemNotesView(); });
  const s = document.getElementById("inoteBranchSelect");
  if (s) s.addEventListener("change", () => { inoteBranch = s.value; if (s.value !== INOTE_ALL) Branch.set(s.value); loadItemNotesView(); });
  view.querySelectorAll(".inote-tag").forEach(b => b.addEventListener("click", () => b.classList.toggle("on")));
  const sb = document.getElementById("inoteSaveBtn");
  if (sb) sb.addEventListener("click", () => saveItemNotes(false));
  const nb = document.getElementById("inoteNoneBtn");
  if (nb) nb.addEventListener("click", () => saveItemNotes(true));
}

async function saveItemNotes(none) {
  if (none && inoteIssues(inoteRow) && !confirm("في ملاحظات مسجّلة — «ما في ملاحظات» بيمسحها. متأكد؟")) return;
  const items = {};
  if (!none) {
    document.querySelectorAll("#itemnotesView .inote-item").forEach(el => {
      const tags = [...el.querySelectorAll(".inote-tag.on")].map(b => b.dataset.tag);
      const text = el.querySelector(".inote-text").value.trim();
      if (tags.length || text) items[el.dataset.inoteId] = { name: el.dataset.inoteName, tags, text };
    });
    if (!Object.keys(items).length) { showToast("اختار ملاحظة على صنف، أو اكبس «ما في ملاحظات»"); return; }
  }
  const emp = Auth.getEmployee() || {};
  const row = { date: inoteDate, branch: inoteBranch, items, none: !!none, saved_by: emp.name || "", saved_at: new Date().toISOString() };
  try {
    await SupaEngine.saveItemNotes(row);
    inoteRow = row;
    showToast("✅ انحفظت ملاحظات الأصناف");
    loadItemNotesView();
  } catch (e) {
    showToast("⚠ ما انحفظ: " + (e.message || e));
  }
}
