// ==================== الحضور والانصراف ====================
// الموظف بيوقّع على الورقة المطبوعة، وبالموقع بيكتب اسمه ولازم يصوّر الورقة. الوقت من السيرفر (ما بيتغيّر من الجهاز).
// ورقتين لكل فرع (حضور / انصراف) + المطبخ المركزي، والمالك بيشوف كل الفروع مع بعض.

const ATT_KITCHEN = "المطبخ المركزي";
const ATT_ALL = "__all";
let attDate = todayStr();
let attPlace = "";
let attRows = [];
let attLoadSeq = 0;
let attForm = null; // { kind, photo }

function attPlaces() {
  const all = branchList().concat(ATT_KITCHEN).filter(b => !(typeof isAttendanceOffBranch === "function" && isAttendanceOffBranch(b)));
  if (Auth.canSeeAllBranches()) return all;
  const mine = Auth.branches();
  const list = all.filter(b => mine.includes(b));
  return list.length ? list : all.filter(b => b === Branch.get());
}

// وقت دوام كل فريق (إعداد shift_times: {"الروضة": "11:45"}) — الفروع اللي مو موجودة بدون وقت
function attShift(place) {
  try {
    const raw = typeof currentSettings !== "undefined" && currentSettings.shift_times;
    const map = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
    return map[place] || "";
  } catch (e) { return ""; }
}
function attShiftLabel(hm) {
  if (!hm) return "";
  const [h, m] = hm.split(":").map(Number);
  if (h === 0 && m === 0) return "12:00 الليل";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 11 ? "الصبح" : h < 16 ? "الضهر" : "المسا"}`;
}
// دقايق التأخير عن بداية الدوام (أقرب دوام قبل/بعد، لأن دوام ١٢ الليل بيلف على اليوم)
function attLateMin(iso, hm) {
  if (!iso || !hm) return 0;
  const d = new Date(iso);
  const [h, m] = hm.split(":").map(Number);
  let diff = (d.getHours() * 60 + d.getMinutes()) - (h * 60 + m);
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return diff > 0 ? diff : 0;
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
    <table class="att-table"><thead><tr><th>#</th><th>الاسم</th>${showPlace ? "<th>الفرع</th>" : ""}<th>الوقت</th><th>الورقة</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${escHtml(r.employee_name)}</td>${showPlace ? `<td>${escHtml(r.branch)}</td>` : ""}
      <td><b>${attTime(r.recorded_at)}</b>${kind === "in" && attLateMin(r.recorded_at, attShift(r.branch)) > 5 ? `<div class="att-late">متأخر ${attLateMin(r.recorded_at, attShift(r.branch))} د</div>` : ""}</td>
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
      ${!showPlace && attShift(attPlace) ? `<div class="att-now">⏰ الدوام: ${attShiftLabel(attShift(attPlace))}</div>` : ""}
      ${showPlace ? "" : `<div class="att-actions">
        <button class="btn att-btn att-in" id="attInBtn">🟢 تسجيل حضور</button>
        <button class="btn att-btn att-out" id="attOutBtn">🔴 تسجيل انصراف</button>
      </div>
      <button class="btn btn-ghost att-small" id="attPrintBtn" type="button">🖨 اطبع ورقة الحضور</button>`}
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
  const pr = document.getElementById("attPrintBtn");
  if (pr) pr.addEventListener("click", attPrintSheet);
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
    <div class="field"><label>صورة الورقة (إجباري — بعد ما توقّع عليها)</label>
      <label class="btn att-small att-cam">📷 صوّر الورقة<input type="file" id="attPhoto" accept="image/*" capture="environment" hidden></label>
      <img id="attPhotoPreview" class="att-preview hidden" alt=""></div>
    <div class="att-now">الوقت بينسجّل تلقائي لحظة الحفظ</div>
    <div class="att-actions"><button class="btn" id="attSave">💾 حفظ</button><button class="btn btn-ghost" id="attCancel">إلغاء</button></div>
  </div>`;
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
  if (!name) { showToast("اكتب اسم الموظف"); return; }
  if (!attForm.photo) { showToast("لازم تصوّر الورقة عشان ينسجّل حضورك"); return; }
  btn.disabled = true; btn.textContent = "جاري الحفظ…";
  try {
    const photo = await SupaEngine.uploadReceipt(attDate, attPlace, attForm.photo);
    const emp = Auth.getEmployee() || {};
    const row = await SupaEngine.addAttendance({ date: attDate, branch: attPlace, kind: attForm.kind, employee_name: name, signature_path: null, photo_path: photo, recorded_by: emp.name || "" });
    showToast(`${attForm.kind === "in" ? "✅ انسجّل الحضور" : "✅ انسجّل الانصراف"} — ${row && row.recorded_at ? attTime(row.recorded_at) : ""}`);
    attForm = null;
    loadAttendanceView();
  } catch (e) {
    showToast("⚠ ما انحفظ: " + (e.message || e));
    btn.disabled = false; btn.textContent = "💾 حفظ";
  }
}

// ورقة للطباعة: حضور وانصراف، كل سطر اسم وتوقيع (الوقت من صورة الموقع)
// بتفتح جوّا التطبيق (مو نافذة جديدة) عشان يكون فيه زر رجوع — بالتطبيق المثبّت ما في أزرار متصفح
function attPrintSheet() {
  const shift = attShiftLabel(attShift(attPlace));
  const rows = (n) => Array.from({ length: n }, (_, i) => `<tr><td>${i + 1}</td><td></td><td></td></tr>`).join("");
  const table = (t) => `<h2>${t}</h2><table><thead><tr><th style="width:8%">#</th><th style="width:52%">الاسم</th><th>التوقيع</th></tr></thead><tbody>${rows(12)}</tbody></table>`;
  const old = document.getElementById("attPrintOverlay");
  if (old) old.remove();
  const ov = document.createElement("div");
  ov.id = "attPrintOverlay";
  ov.className = "att-print-overlay";
  ov.innerHTML = `<div class="att-print-bar">
      <button type="button" class="btn btn-ghost" id="attPrintClose">→ رجوع للتطبيق</button>
      <button type="button" class="btn btn-ghost" id="attPrintShare">📤 مشاركة</button>
      <button type="button" class="btn" id="attPrintGo">🖨 اطبع</button>
    </div>
    <div class="att-print-page">
      <h1>Pro House — ورقة الحضور والانصراف</h1>
      <div class="meta"><span>الفرع: <b>${escHtml(attPlace)}</b></span><span>التاريخ: ____ / ____ / ________</span>${shift ? `<span>الدوام: <b>${shift}</b></span>` : ""}</div>
      ${table("📥 الحضور")}${table("📤 الانصراف")}
      <p class="att-print-foot">بعد التوقيع صوّر الورقة من الموقع (الحضور والانصراف) — ما بينسجّل الحضور بدون صورة.</p>
    </div>`;
  document.body.appendChild(ov);
  document.body.classList.add("att-printing");
  const close = () => { ov.remove(); document.body.classList.remove("att-printing"); };
  document.getElementById("attPrintClose").addEventListener("click", close);
  document.getElementById("attPrintGo").addEventListener("click", () => window.print());
  document.getElementById("attPrintShare").addEventListener("click", attShareSheet);
}

// الورقة PDF صفحة وحدة (A4) — بالجوال بتفتح المشاركة (واتساب)، بالكمبيوتر بتنزل
async function attShareSheet() {
  const btn = document.getElementById("attPrintShare");
  const page = document.querySelector("#attPrintOverlay .att-print-page");
  if (!btn || !page) return;
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ جاري التجهيز…";
  try {
    if (typeof loadPdfLibs === "function") await loadPdfLibs();
    if (!window.html2canvas || !window.jspdf) throw new Error("مكتبة PDF ما تحمّلت — تأكد من النت");
    // نصوّر الورقة بعرض ثابت عشان تطلع نفس الشكل من أي جهاز
    const stage = document.createElement("div");
    stage.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;background:#fff;";
    stage.innerHTML = `<div class="att-print-page att-print-fixed">${page.innerHTML}</div>`;
    document.body.appendChild(stage);
    let canvas;
    try { canvas = await html2canvas(stage.firstElementChild, { scale: 2, backgroundColor: "#ffffff", logging: false }); }
    finally { stage.remove(); }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const m = 8, maxW = 210 - 2 * m, maxH = 297 - 2 * m;
    const r = Math.min(maxW / canvas.width, maxH / canvas.height);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (210 - canvas.width * r) / 2, m, canvas.width * r, canvas.height * r);
    const blob = pdf.output("blob");
    const name = `ورقة_الحضور_${attPlace}.pdf`.replace(/\s+/g, "_");
    const file = new File([blob], name, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "ورقة الحضور والانصراف" }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {
    showToast("⚠ " + (e.message || e));
  } finally { btn.disabled = false; btn.textContent = label; }
}
