// ==================== الحضور والانصراف ====================
// الموظف بيكتب اسمه، بيوقّع على الشاشة، وبيصوّر ورقة الحضور. الوقت من السيرفر (ما بيتغيّر من الجهاز).
// ورقتين لكل فرع (حضور / انصراف) + المطبخ المركزي، والمالك بيشوف كل الفروع مع بعض.

const ATT_KITCHEN = "المطبخ المركزي";
const ATT_ALL = "__all";
let attDate = todayStr();
let attPlace = "";
let attRows = [];
let attLoadSeq = 0;
let attForm = null; // { kind, photo }

function attPlaces() {
  const all = branchList().concat(ATT_KITCHEN);
  if (Auth.canSeeAllBranches()) return all;
  const mine = Auth.branches();
  const list = all.filter(b => mine.includes(b));
  return list.length ? list : all.filter(b => b === Branch.get());
}

const attTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" }) : "—");

async function loadAttendanceView() {
  const view = document.getElementById("attendanceView");
  if (!view) return;
  const places = attPlaces();
  const canAll = Auth.canSeeAllBranches();
  if (attPlace !== ATT_ALL || !canAll) {
    if (!places.includes(attPlace)) attPlace = places.includes(Branch.get()) ? Branch.get() : (places[0] || "");
  }
  const seq = ++attLoadSeq;
  view.innerHTML = '<div class="loader">جاري التحميل…</div>';
  try {
    attRows = await SupaEngine.getAttendance(attDate, attPlace === ATT_ALL ? null : attPlace);
  } catch (e) {
    if (seq !== attLoadSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر تحميل الحضور — ${escHtml(e.message || String(e))}</div>`;
    return;
  }
  if (seq !== attLoadSeq) return;
  renderAttendanceView(places, canAll);
}

function attSheetHtml(kind, showPlace) {
  const rows = attRows.filter(r => r.kind === kind);
  const title = kind === "in" ? "📥 ورقة الحضور" : "📤 ورقة الانصراف";
  if (!rows.length) return `<div class="item-card"><div class="att-sheet-title">${title}</div><div class="empty-state">ما في تسجيلات لهاليوم</div></div>`;
  return `<div class="item-card"><div class="att-sheet-title">${title} <small>(${rows.length})</small></div>
    <table class="att-table"><thead><tr><th>#</th><th>الاسم</th>${showPlace ? "<th>الفرع</th>" : ""}<th>الوقت</th><th>التوقيع</th><th>الورقة</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${escHtml(r.employee_name)}</td>${showPlace ? `<td>${escHtml(r.branch)}</td>` : ""}
      <td><b>${attTime(r.recorded_at)}</b></td>
      <td>${r.signature_path ? `<img class="att-sig" data-att-path="${escHtml(r.signature_path)}" alt="توقيع">` : "—"}</td>
      <td>${r.photo_path ? `<img class="att-photo" data-att-path="${escHtml(r.photo_path)}" alt="صورة الورقة">` : "—"}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function renderAttendanceView(places, canAll) {
  const view = document.getElementById("attendanceView");
  const opts = (canAll ? [[ATT_ALL, "كل الفروع"]] : []).concat(places.map(p => [p, p]));
  const showPlace = attPlace === ATT_ALL;
  view.innerHTML = `
    <h2 class="juice-page-title">🕘 الحضور والانصراف</h2>
    <div class="item-card">
      <div class="inputs-row">
        <div class="field"><label>التاريخ</label><input type="date" id="attDateInput" value="${attDate}"></div>
        <div class="field"><label>الفرع</label>${opts.length > 1
          ? `<select id="attPlaceSelect">${opts.map(([v, t]) => `<option value="${escHtml(v)}" ${v === attPlace ? "selected" : ""}>${escHtml(t)}</option>`).join("")}</select>`
          : `<div class="readonly-field">${escHtml(attPlace || "—")}</div>`}</div>
      </div>
      ${showPlace ? "" : `<div class="att-actions">
        <button class="btn att-btn att-in" id="attInBtn">🟢 تسجيل حضور</button>
        <button class="btn att-btn att-out" id="attOutBtn">🔴 تسجيل انصراف</button>
      </div>`}
    </div>
    <div id="attFormBox"></div>
    ${attSheetHtml("in", showPlace)}
    ${attSheetHtml("out", showPlace)}`;
  bindAttendanceView();
  if (attForm) renderAttForm();
  // صور التوقيع والورقة بمخزن خاص: روابط مؤقتة
  view.querySelectorAll("img[data-att-path]").forEach(async img => {
    try { img.src = await SupaEngine.receiptUrl(img.dataset.attPath); } catch (e) { img.alt = "⚠"; }
  });
}

function bindAttendanceView() {
  const d = document.getElementById("attDateInput");
  if (d) d.addEventListener("change", () => { attDate = d.value || todayStr(); attForm = null; loadAttendanceView(); });
  const s = document.getElementById("attPlaceSelect");
  if (s) s.addEventListener("change", () => { attPlace = s.value; attForm = null; loadAttendanceView(); });
  const inB = document.getElementById("attInBtn"), outB = document.getElementById("attOutBtn");
  if (inB) inB.addEventListener("click", () => { attForm = { kind: "in", photo: null }; renderAttForm(); });
  if (outB) outB.addEventListener("click", () => { attForm = { kind: "out", photo: null }; renderAttForm(); });
  document.querySelectorAll("#attendanceView img[data-att-path]").forEach(img =>
    img.addEventListener("click", () => { if (img.src) window.open(img.src, "_blank"); }));
}

function renderAttForm() {
  const box = document.getElementById("attFormBox");
  if (!box || !attForm) return;
  const isIn = attForm.kind === "in";
  box.innerHTML = `<div class="item-card att-form ${isIn ? "att-in-card" : "att-out-card"}">
    <div class="att-sheet-title">${isIn ? "🟢 تسجيل حضور" : "🔴 تسجيل انصراف"} — ${escHtml(attPlace)}</div>
    <div class="field"><label>اسم الموظف</label><input type="text" id="attName" placeholder="اكتب اسمك" autocomplete="off"></div>
    <div class="field"><label>التوقيع</label>
      <canvas id="attSig" class="att-sig-pad" width="600" height="200"></canvas>
      <button class="btn btn-ghost att-small" id="attSigClear" type="button">مسح التوقيع</button></div>
    <div class="field"><label>صورة الورقة</label>
      <label class="btn att-small att-cam">📷 صوّر الورقة<input type="file" id="attPhoto" accept="image/*" capture="environment" hidden></label>
      <img id="attPhotoPreview" class="att-preview hidden" alt=""></div>
    <div class="att-now">الوقت بينسجّل تلقائي من السيرفر لحظة الحفظ</div>
    <div class="att-actions"><button class="btn" id="attSave">💾 حفظ</button><button class="btn btn-ghost" id="attCancel">إلغاء</button></div>
  </div>`;
  const pad = document.getElementById("attSig");
  const ctx = pad.getContext("2d");
  const clear = () => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pad.width, pad.height); pad.dataset.signed = ""; };
  clear();
  ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
  let drawing = false;
  const pos = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
  pad.addEventListener("pointerdown", e => { drawing = true; pad.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
  pad.addEventListener("pointermove", e => { if (!drawing) return; ctx.lineTo(...pos(e)); ctx.stroke(); pad.dataset.signed = "1"; });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => pad.addEventListener(t, () => { drawing = false; }));
  document.getElementById("attSigClear").addEventListener("click", clear);
  document.getElementById("attPhoto").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    attForm.photo = await attCompress(f);
    const p = document.getElementById("attPhotoPreview");
    p.src = attForm.photo; p.classList.remove("hidden");
  });
  document.getElementById("attCancel").addEventListener("click", () => { attForm = null; box.innerHTML = ""; });
  document.getElementById("attSave").addEventListener("click", attSave);
  document.getElementById("attName").focus();
}

// الصورة: أقصى عرض ١٢٨٠ بكسل، JPEG
function attCompress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function attSave() {
  const btn = document.getElementById("attSave");
  const name = (document.getElementById("attName").value || "").trim();
  const pad = document.getElementById("attSig");
  if (!name) { showToast("اكتب اسم الموظف"); return; }
  if (!pad.dataset.signed) { showToast("لازم توقّع"); return; }
  if (!attForm.photo) { showToast("صوّر الورقة"); return; }
  btn.disabled = true; btn.textContent = "جاري الحفظ…";
  try {
    const [sig, photo] = await Promise.all([
      SupaEngine.uploadReceipt(attDate, attPlace, pad.toDataURL("image/png")),
      SupaEngine.uploadReceipt(attDate, attPlace, attForm.photo)
    ]);
    const emp = Auth.getEmployee() || {};
    const row = await SupaEngine.addAttendance({ date: attDate, branch: attPlace, kind: attForm.kind, employee_name: name, signature_path: sig, photo_path: photo, recorded_by: emp.name || "" });
    showToast(`${attForm.kind === "in" ? "✅ انسجّل الحضور" : "✅ انسجّل الانصراف"} — ${row && row.recorded_at ? attTime(row.recorded_at) : ""}`);
    attForm = null;
    loadAttendanceView();
  } catch (e) {
    showToast("⚠ ما انحفظ: " + (e.message || e));
    btn.disabled = false; btn.textContent = "💾 حفظ";
  }
}
