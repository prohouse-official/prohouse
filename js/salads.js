// ==================== تجهيز السلطات (قائمة يومية لكل فرع) ====================
// المطبخ المركزي يعلّم على كل مكون (✅ جاهز / ❌ ناقص) قبل الإرسال — والروضة قبل بداية البيع.
// الفرع يأكد الاستلام بضغطة. القائمة تطلع صفحة لحالها بملف طلبية الشيف، وسطر بالتقرير اليومي.

// R = الروضة · S = الشاطئ · A = عبداللطيف جميل (نفس ملف «قائمة تجهيز مكونات السلطات»)
const SALAD_MASTER = [
  ["الورقيات", [["خس", "RSA"], ["جرجير", "RSA"], ["كيل", "RSA"], ["ملفوف ملون", "RSA"]]],
  ["الخضار", [["خيار", "RSA"], ["طماطم شيري", "RSA"], ["جزر", "RSA"], ["شمندر", "RSA"], ["بصل", "R"], ["فجل", "R"], ["بصل أخضر", "R"], ["هالبينو", "RA"]]],
  ["الإضافات", [["زيتون", "RSA"], ["ذرة", "RSA"], ["حمص", "R"], ["فاصوليا حمراء", "RA"]]],
  ["الخضار المشوية", [["فلفل رومي مشوي", "R"], ["كوسة مشوية", "RA"], ["باذنجان مشوي", "RA"], ["زهرة مشوية", "RA"], ["بطاطا حلوة مشوية", "RA"], ["بروكلي مشوي", "A"]]],
  ["البروتين", [["دجاج للسلطة", "RSA"], ["جمبري للسلطة", "RSA"], ["سالمون للسلطة", "RSA"]]],
  ["التقديم", [["ليمون", "R"], ["خبز محمص", "RA"]]],
  ["الفواكه", [["رمان", "RSA"], ["توت بري", "RSA"], ["عنب", "RSA"], ["شرائح تفاح أخضر", "R"]]],
  ["الحبوب والمكرونة", [["كينوا", "RSA"], ["رز سوشي", "RSA"], ["مكرونة", "RSA"]]],
  ["الأجبان", [["جبنة فيتا", "RSA"], ["جبنة حلومي", "RA"], ["جبنة بارميزان", "RSA"]]],
  ["الصوصات", [["صوص سيزر", "SA"], ["صوص رانش", "SA"], ["صوص إيطالي", "SA"]]],
  ["إضافات عبداللطيف", [["بيض أومليت بالجبنة", "A"], ["بيض مسلوق", "A"], ["تيركي", "A"], ["بيبروني", "A"], ["شرائح لحم", "A"], ["جبنة شرائح", "A"]]]
];
const SALAD_BRANCH_KEY = { "الروضة": "R", "الشاطئ": "S", "عبداللطيف جميل": "A" };
// الروضة هي المطبخ المركزي: تتعبّى قبل بداية البيع (ما فيه إرسال ولا تأكيد استلام)
const SALAD_NO_DISPATCH = ["الروضة"];

function saladSectionsFor(branch) {
  const k = SALAD_BRANCH_KEY[branch];
  if (!k) return [];
  return SALAD_MASTER.map(([cat, list]) => [cat, list.filter(([, b]) => b.includes(k)).map(([n]) => n)]).filter(([, l]) => l.length);
}
const saladItemsFor = (branch) => saladSectionsFor(branch).flatMap(([, l]) => l);
const saladBranches = () => Object.keys(SALAD_BRANCH_KEY);

// ملخص قائمة محفوظة: كم جاهز من كم + الناقص
function saladSummary(check, branch) {
  const all = saladItemsFor(branch);
  const items = (check && check.items) || {};
  const ok = all.filter(n => items[n] === "ok");
  const miss = all.filter(n => items[n] === "miss");
  return { total: all.length, ok: ok.length, miss, done: ok.length + miss.length === all.length && all.length > 0, started: ok.length + miss.length > 0 };
}

// ---- الشاشة ----
let saladDate = todayStr();
let saladBranch = "";
let saladCheck = null;   // الصف المحفوظ لهذا اليوم/الفرع
let saladDraft = {};     // {اسم المكون: "ok" | "miss"}
let saladLoadSeq = 0;

const saladCanFill = () => ["owner", "manager", "chef", "kitchen"].includes(Auth.role());
const saladCanReceive = () => ["owner", "manager", "branch_staff", "employee"].includes(Auth.role());

async function loadSaladsView() {
  const view = document.getElementById("saladsView");
  if (!view) return;
  const mine = saladCanFill() ? saladBranches() : allowedBranchList().filter(b => SALAD_BRANCH_KEY[b]);
  if (!mine.includes(saladBranch)) saladBranch = mine.includes(Branch.get()) ? Branch.get() : (mine[0] || "");
  const seq = ++saladLoadSeq;
  view.innerHTML = '<div class="loader">جاري التحميل…</div>';
  let row = null;
  try { row = saladBranch ? await SupaEngine.getSaladCheck(saladDate, saladBranch) : null; }
  catch (e) {
    if (seq !== saladLoadSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر تحميل قائمة السلطات — ${escHtml(e.message || String(e))}</div>`;
    return;
  }
  if (seq !== saladLoadSeq) return;
  saladCheck = row;
  saladDraft = { ...((row && row.items) || {}) };
  renderSaladsView(mine);
}

function renderSaladsView(mine) {
  const view = document.getElementById("saladsView");
  if (!view) return;
  const fill = saladCanFill();
  const sections = saladSectionsFor(saladBranch);
  const sum = saladSummary({ items: saladDraft }, saladBranch);
  const c = saladCheck || {};
  const dispatch = !SALAD_NO_DISPATCH.includes(saladBranch);
  const recv = c.received_status;
  view.innerHTML = `
    <h2 class="juice-page-title">🥗 تجهيز السلطات</h2>
    <div class="item-card">
      <div class="inputs-row">
        <div class="field"><label>التاريخ</label><input type="date" id="saladDateInput" value="${saladDate}"></div>
        <div class="field"><label>الفرع</label>${mine.length > 1
          ? `<select id="saladBranchSelect">${mine.map(b => `<option ${b === saladBranch ? "selected" : ""}>${escHtml(b)}</option>`).join("")}</select>`
          : `<div class="readonly-field">${escHtml(saladBranch || "—")}</div>`}</div>
      </div>
      <div class="salad-status">
        <b>${sum.ok} من ${sum.total} جاهز</b>${sum.miss.length ? ` · <span class="salad-miss">ناقص ${sum.miss.length}</span>` : ""}
        ${c.chef_name ? `<small>جهّزها ${escHtml(c.chef_name)} · ${new Date(c.saved_at).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" })}</small>` : `<small>لسا ما انحفظت</small>`}
      </div>
      ${fill ? `<div class="salad-bulk"><button type="button" class="btn" id="saladAllOk">✅ الكل جاهز</button></div>` : ""}
    </div>
    ${sections.map(([cat, list]) => `
      <div class="item-card salad-sec"><div class="salad-sec-title">${escHtml(cat)}</div>
        ${list.map(n => {
          const st = saladDraft[n] || "";
          return `<div class="salad-row ${st}"><span>${escHtml(n)}</span>
            ${fill ? `<span class="salad-btns"><button type="button" class="salad-b ok ${st === "ok" ? "on" : ""}" data-sitem="${escHtml(n)}" data-sval="ok">✅</button><button type="button" class="salad-b miss ${st === "miss" ? "on" : ""}" data-sitem="${escHtml(n)}" data-sval="miss">❌</button></span>`
              : `<span class="salad-ro">${st === "ok" ? "✅" : st === "miss" ? "❌" : "—"}</span>`}
          </div>`;
        }).join("")}
      </div>`).join("")}
    <div class="item-card">
      <div class="field"><label>النواقص / ملاحظات</label>
        <input type="text" id="saladMissingInput" value="${escHtml(c.missing || "")}" placeholder="مثلاً: الرمان خلص — بيوصل بكرا" ${fill ? "" : "disabled"}></div>
      ${fill ? `<button type="button" class="btn gold" id="saladSaveBtn">💾 حفظ قائمة السلطات</button>` : ""}
    </div>
    ${dispatch ? `<div class="item-card salad-recv">
      <div class="salad-sec-title">📦 استلام الفرع</div>
      ${recv ? `<div class="salad-status"><b>${recv === "ok" ? "✅ وصل كامل" : "❌ وصل في نقص"}</b>${c.received_note ? ` · ${escHtml(c.received_note)}` : ""}<small>${escHtml(c.received_by || "")}${c.received_at ? " · " + new Date(c.received_at).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" }) : ""}</small></div>` : `<div class="cust-hint">الفرع لسا ما أكّد الاستلام.</div>`}
      ${saladCanReceive() && (c.chef_name || recv) ? `<div class="salad-bulk">
        <button type="button" class="btn" id="saladRecvOk">✅ وصل كامل</button>
        <button type="button" class="btn danger" id="saladRecvMiss">❌ في نقص</button></div>` : ""}
    </div>` : ""}`;
  bindSaladsView(mine);
}

function bindSaladsView(mine) {
  const $ = (id) => document.getElementById(id);
  if ($("saladDateInput")) $("saladDateInput").addEventListener("change", (e) => { if (e.target.value) { saladDate = e.target.value; loadSaladsView(); } });
  if ($("saladBranchSelect")) $("saladBranchSelect").addEventListener("change", (e) => { saladBranch = e.target.value; loadSaladsView(); });
  document.querySelectorAll("[data-sitem]").forEach(b => b.addEventListener("click", () => {
    const n = b.dataset.sitem, v = b.dataset.sval;
    saladDraft[n] = saladDraft[n] === v ? "" : v;
    if (!saladDraft[n]) delete saladDraft[n];
    renderSaladsView(mine);
  }));
  if ($("saladAllOk")) $("saladAllOk").addEventListener("click", () => {
    saladItemsFor(saladBranch).forEach(n => { if (saladDraft[n] !== "miss") saladDraft[n] = "ok"; });
    renderSaladsView(mine);
  });
  if ($("saladSaveBtn")) $("saladSaveBtn").addEventListener("click", async (e) => {
    const sum = saladSummary({ items: saladDraft }, saladBranch);
    if (!sum.done && !(await phConfirm(`فيه ${sum.total - sum.ok - sum.miss.length} مكون ما تعلّم عليه — تحفظ هيك؟`, { ok: "احفظ" }))) return;
    e.target.disabled = true;
    try {
      const row = { date: saladDate, branch: saladBranch, items: saladDraft, missing: $("saladMissingInput").value.trim(),
        chef_name: (Auth.getEmployee() || {}).name || "", saved_at: new Date().toISOString() };
      await SupaEngine.saveSaladCheck(row);
      showToast("✅ انحفظت قائمة السلطات");
      loadSaladsView();
    } catch (err) { showToast("⚠ ما انحفظت — " + (err.message || err)); e.target.disabled = false; }
  });
  const receive = async (status) => {
    let note = "";
    if (status === "miss") {
      note = await phPrompt("شو الناقص؟", "", { ok: "تأكيد" });
      if (note === null || note === undefined) return;
    }
    try {
      await SupaEngine.saveSaladCheck({ date: saladDate, branch: saladBranch, received_status: status, received_note: String(note || "").trim(),
        received_by: (Auth.getEmployee() || {}).name || "", received_at: new Date().toISOString() });
      showToast(status === "ok" ? "✅ تأكد الاستلام" : "✅ انسجل النقص");
      loadSaladsView();
    } catch (err) { showToast("⚠ " + (err.message || err)); }
  };
  if ($("saladRecvOk")) $("saladRecvOk").addEventListener("click", () => receive("ok"));
  if ($("saladRecvMiss")) $("saladRecvMiss").addEventListener("click", () => receive("miss"));
}

// ---- صفحة السلطات بملف طلبية الشيف: جدول واحد، عمود لكل فرع (□ فاضي، أو ✅/❌ لو انحفظت) ----
function saladSheetHtml(branches, date, checks) {
  const list = branches.filter(b => SALAD_BRANCH_KEY[b]);
  if (!list.length) return "";
  const bd = "2px solid #505050";
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mark = (b, n) => {
    if (!SALAD_MASTER.some(([, l]) => l.some(([x, k]) => x === n && k.includes(SALAD_BRANCH_KEY[b])))) return '<span style="color:#bbb">—</span>';
    const st = ((checks[b] || {}).items || {})[n];
    return st === "ok" ? "✅" : st === "miss" ? "❌" : "□";
  };
  const rows = SALAD_MASTER.map(([cat, items]) => {
    const vis = items.filter(([, k]) => list.some(b => k.includes(SALAD_BRANCH_KEY[b])));
    return vis.map(([n], i) => `<tr style="height:46px">${i === 0 ? `<td rowspan="${vis.length}" style="border:${bd};font-weight:700;background:#F2F2F2">${esc(cat)}</td>` : ""}
      <td style="border:${bd};text-align:right;padding-right:14px">${esc(n)}</td>${list.map(b => `<td style="border:${bd};font-size:36px">${mark(b, n)}</td>`).join("")}</tr>`).join("");
  }).join("");
  const cnt = (b) => saladItemsFor(b).length;
  const notes = list.map(b => (checks[b] || {}).missing).some(Boolean)
    ? list.map(b => (checks[b] || {}).missing ? `${b}: ${(checks[b] || {}).missing}` : "").filter(Boolean).join(" · ") : "";
  return `<div class="salad-sheet" style="background:#fff;width:${560 + list.length * 260}px;font-family:Tajawal,sans-serif;direction:rtl">
    <table style="border-collapse:collapse;width:100%;font-size:26px;text-align:center">
      <tr style="height:70px"><td colspan="${2 + list.length}" style="border:${bd};background:#000;color:#F7DC4E;font-weight:800;font-size:32px">🥗 قائمة تجهيز مكونات السلطات — ${esc(chefDayName(date))} ${esc(chefDateText(date))}</td></tr>
      <tr style="height:56px;background:#BFBFBF;font-weight:800"><td style="border:${bd};width:200px">القسم</td><td style="border:${bd};width:360px">المكون</td>${list.map(b => `<td style="border:${bd}">${esc(b)} (${cnt(b)})</td>`).join("")}</tr>
      ${rows}
      <tr style="height:90px"><td style="border:${bd};font-weight:700">النواقص / ملاحظات</td><td colspan="${1 + list.length}" style="border:${bd};text-align:right;padding-right:14px">${esc(notes)}</td></tr>
      <tr style="height:60px"><td colspan="2" style="border:${bd};font-weight:700">اسم الشيف</td>${list.map(b => `<td style="border:${bd}">${esc((checks[b] || {}).chef_name || "")}</td>`).join("")}</tr>
    </table>
    <div style="font-size:20px;color:#555;margin-top:8px">علّم على كل مكون بعد التأكد من جاهزيته · بلّغ عن أي نقص قبل الإرسال للفرع · لا تستبدل أي مكون دون الرجوع للمسؤول</div>
  </div>`;
}
