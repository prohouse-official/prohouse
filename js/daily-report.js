// ==================== 📅 تقرير اليوم لكل فرع ====================
// صفحة وحدة لكل فرع: المستلم، المباع (تابسنس)، المتبقي (يرجع للمطبخ)، الهدر، والفرق — بالوجبات.
// المستخدم = المستلم − المتبقي − الهدر. الفرق = المستخدم − المباع (موجب = عجز: أكل راح بدون بيع).
// إذا ناقص استلام أو جرد أو مبيعات، ما نحسب فرق (نقول وش الناقص بدل رقم غلط).
// المبيعات فيها أصلاً إضافات الـ +50 جم (كجزء من وجبة) وأم علي (نص ساندويتش).

const DR_SECTIONS = [
  { cat: "دجاج", icon: "🍗", weight: true },
  { cat: "لحم", icon: "🥩", weight: true },
  { cat: "بحري", icon: "🐟", weight: true },
  { cat: "فطور", icon: "🥪", label: "ساندويتش", unit: "ساندويتش" },
  { cat: "السلطات", icon: "🥗", label: "سلطات", unit: "حبة" }
];

const DR_NORMAL_GAP = 0.10; // الفرق حتى 10% من المستلم طبيعي، وما زاد عليه هدر
let dailyReportRun = 0;

function initDailyReportControls() {
  const sel = document.getElementById("dailyReportBranch");
  sel.innerHTML = `<option value="">كل الفروع</option>` + branchList().map(b => `<option value="${b}">${b}</option>`).join("");
  const dateEl = document.getElementById("dailyReportDate");
  dateEl.value = todayStr();
  dateEl.addEventListener("change", runDailyReport);
  sel.addEventListener("change", runDailyReport);
}

async function runDailyReport() {
  const run = ++dailyReportRun;
  const view = document.getElementById("dailyReportView");
  const date = document.getElementById("dailyReportDate").value || todayStr();
  const only = document.getElementById("dailyReportBranch").value;
  const branches = only ? [only] : branchList();
  view.innerHTML = '<div class="loader">جاري تجهيز تقرير اليوم…</div>';
  await Items.load();
  let cards;
  try {
    cards = await Promise.all(branches.map(b => loadDailyBranch(date, b)));
  } catch (e) {
    if (run === dailyReportRun) view.innerHTML = `<div class="empty-state">⚠ تعذّر تحميل التقرير — ${escHtml(e.message || String(e))}</div>`;
    return;
  }
  if (run !== dailyReportRun) return;
  view.innerHTML = cards.map(c => dailyBranchHtml(c, date)).join("");
  refreshTabsenseSyncInfo();
}

async function loadDailyBranch(date, branch) {
  const [day, sales, waste, custody, pays, salad, attendance, inotes] = await Promise.all([
    SupaEngine.getDay(date, branch).catch(() => null),
    SupaEngine.getSalesByCategory(date, date, branch).catch(() => []),
    SupaEngine.getWasteReport(date, branch).catch(() => null),
    SupaEngine.getCustody(date, branch).catch(() => null),
    SupaEngine.getPayments(date, branch).catch(() => []),
    SupaEngine.getSaladCheck(date, branch).catch(() => null),
    SupaEngine.getAttendance(date, branch).catch(() => []),
    SupaEngine.getItemNotes(date, branch).catch(() => null)
  ]);
  const salesMap = {};
  (sales || []).forEach(r => { salesMap[r.category] = (salesMap[r.category] || 0) + Number(r.qty || 0); });
  const catOf = (id, fallbackCat) => (Items.byId(id) || {}).category || fallbackCat || "";
  const items = (day && day.items) || [];
  const wasteItems = (waste && waste.items) || [];

  const sections = DR_SECTIONS.map(s => {
    const mine = items.filter(x => catOf(x.itemId) === s.cat);
    const received = mine.reduce((a, x) => a + Number(x.received || 0), 0);
    const counted = mine.some(x => x.remaining != null || x.remainingWeight != null || x.remainingSauce != null);
    const remaining = mine.reduce((a, x) => {
      // الصوص الباقي بالصحن من وزن الاستلام، فيحسب من المتبقي
      if (s.weight) return a + Number(x.remainingWeight != null ? x.remainingWeight : (x.remainingSauce != null ? x.remainingSauce : (x.remaining || 0)));
      return a + Number(x.remaining != null ? x.remaining : (x.remainingWeight || 0));
    }, 0);
    const wasted = wasteItems.filter(w => catOf(w.itemId) === s.cat).reduce((a, w) => a + Number(w.qty || 0), 0);
    const soldUnits = getMatchedCategorySales(salesMap, s.cat); // وجبات أو ساندويتشات
    const toMeals = (g) => s.weight ? g / MEAL_WEIGHT_G : g;
    const missing = [];
    if (!(received > 0)) missing.push("الاستلام");
    if (!counted) missing.push("جرد المتبقي");
    if (!(soldUnits > 0)) missing.push("المبيعات");
    const used = toMeals(received - remaining - wasted);
    const gap = missing.length ? null : used - soldUnits; // موجب = عجز
    const pct = gap === null || !(received > 0) ? null : Math.abs(gap) / toMeals(received);
    // هامش طبيعي 10% من المستلم: الفرق ضمنه عادي، وما زاد عليه يعتبر هدر
    const tol = DR_NORMAL_GAP * toMeals(received);
    const excessU = gap !== null && gap > tol ? gap - tol : 0;
    return { ...s, received, remaining, wasted, soldUnits, counted, missing, gap, pct, excessU,
             receivedU: toMeals(received), remainingU: toMeals(remaining), wastedU: toMeals(wasted) };
  }).filter(s => s.received > 0 || s.counted || s.soldUnits > 0 || s.wasted > 0);

  return {
    branch, sections,
    hasReceiving: items.some(x => Number(x.received || 0) > 0),
    hasRemaining: items.some(x => x.remaining != null || x.remainingWeight != null || x.remainingSauce != null),
    hasSales: (sales || []).length > 0,
    hasWaste: wasteItems.length > 0,
    custody, pays: pays || [], salad, attendance: attendance || [], inotes
  };
}

// ---- 🔄 سحب مبيعات تابسنس من داخل التطبيق ----
let drSyncPoll = null;

function drWhen(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(phLocale(), { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" });
}

function drSyncInfo(out, note) {
  const el = document.getElementById("drSyncInfo");
  if (!el) return;
  const last = out && out.lastImport;
  el.textContent = note || (last ? `آخر مبيعات وصلت: ${drWhen(last.imported_at)} (يوم ${last.date})` : "مبيعات تابسنس");
}

async function refreshTabsenseSyncInfo() {
  if (!(Auth.role && Auth.role() === "owner") || typeof SupaEngine === "undefined" || !SupaEngine.tabsensePull) return;
  try { drSyncInfo(await SupaEngine.tabsensePull("status")); } catch (e) { /* يكفي الزر */ }
}

async function startTabsensePull() {
  const btn = document.getElementById("drSyncBtn");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  let out;
  try { out = await SupaEngine.tabsensePull("start"); }
  catch (e) { btn.disabled = false; showToast("⚠ ما قدرنا نبدأ السحب — " + (e.message || e)); return; }
  if (out.error === "not_configured") {
    btn.disabled = false;
    drSyncInfo(out);
    showToast("⚠ زر السحب يحتاج تفعيل من السيرفر (مفتاح GitHub) — السحب التلقائي شغّال بدونه");
    return;
  }
  const before = out.lastImport && out.lastImport.imported_at;
  drSyncInfo(out, out.started ? "⏳ جاري السحب من تابسنس… ياخذ دقيقتين تقريباً" : "⏳ فيه سحب شغّال الحين… ننتظره يخلص");
  clearInterval(drSyncPoll);
  let tries = 0, sawRunning = false;
  drSyncPoll = setInterval(async () => {
    tries++;
    let st;
    try { st = await SupaEngine.tabsensePull("status"); } catch (e) { return; }
    if (st.busy) sawRunning = true;
    const done = (sawRunning || tries >= 4) && !st.busy;
    if (!done && tries < 30) return;
    clearInterval(drSyncPoll);
    btn.disabled = false;
    const now = st.lastImport && st.lastImport.imported_at;
    const failed = st.run && st.run.conclusion && st.run.conclusion !== "success";
    drSyncInfo(st);
    if (failed) showToast("⚠ السحب ما نجح — جرّب مرة ثانية بعد شوي");
    else if (now && now !== before) { showToast("✅ وصلت مبيعات تابسنس الجديدة"); runDailyReport(); }
    else showToast("ℹ️ خلص السحب — ما فيه مبيعات جديدة بتابسنس للحين");
  }, 10000);
}

function drNum(n, digits = 1) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return r.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function drGapHtml(s) {
  if (s.gap === null) return `<span class="dr-gap missing" title="ناقص: ${s.missing.join("، ")}">ناقص ${s.missing.join(" + ")}</span>`;
  const g = s.weight ? `<small>${drNum(Math.abs(s.gap) * MEAL_WEIGHT_G, 0)} جم</small>` : "";
  if (Math.abs(s.gap) < 0.05) return `<span class="dr-gap ok">✓ مطابق</span>`;
  // موجب: أكل طلع بدون بيع. ضمن 10% من المستلم = طبيعي، وما زاد عليه ينحسب هدر.
  // سالب: انباع أكثر من اللي طلع — غالباً استلام ما انسجل كامل
  if (s.gap > 0) return `<span class="dr-gap ${s.pct <= DR_NORMAL_GAP ? "ok" : "bad"}">${s.pct <= DR_NORMAL_GAP ? "طبيعي" : "فرق"}<b>${drNum(s.gap)}</b>${g}</span>`;
  return `<span class="dr-gap ${s.pct <= DR_NORMAL_GAP ? "ok" : "warn"}">${s.pct <= DR_NORMAL_GAP ? "طبيعي" : "مباع أكثر"}<b>${drNum(Math.abs(s.gap))}</b>${g}</span>`;
}

// سطر تجهيز السلطات: كم جاهز من كم، الناقص، مين جهّز، وتأكيد استلام الفرع
function saladDailyLine(c) {
  if (typeof SALAD_BRANCH_KEY === "undefined" || !SALAD_BRANCH_KEY[c.branch]) return "";
  const s = c.salad;
  const sum = saladSummary(s, c.branch);
  if (!s || !sum.started) return `<div class="dr-cash no">🥗 السلطات: القائمة ما انعبّت لهاليوم</div>`;
  const miss = sum.miss.length ? ` · ناقص: ${sum.miss.map(escHtml).join("، ")}` : "";
  const recv = SALAD_NO_DISPATCH.includes(c.branch) ? "" : s.received_status
    ? ` · الفرع: ${s.received_status === "ok" ? "✅ وصل كامل" : "❌ وصل في نقص" + (s.received_note ? " (" + escHtml(s.received_note) + ")" : "")}`
    : " · الفرع لسا ما أكّد الاستلام";
  return `<div class="dr-cash${sum.miss.length ? " no" : ""}">🥗 السلطات: ${sum.ok} من ${sum.total} جاهز${miss}<span class="dr-cash-sub">${escHtml(s.chef_name || "")}${recv}</span></div>`;
}

// سطر الحضور والانصراف: مين حضر ومين انصرف ووقته (الوقت من السيرفر)
function attendanceDailyLine(c) {
  if (typeof isAttendanceOffBranch === "function" && isAttendanceOffBranch(c.branch)) return "";
  const rows = c.attendance || [];
  if (!rows.length) return `<div class="dr-cash no">🕘 الحضور والانصراف: ما انسجّل حدا اليوم</div>`;
  const t = (r) => new Date(r.recorded_at).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" });
  const ins = rows.filter(r => r.kind === "in"), outs = rows.filter(r => r.kind === "out");
  const list = (arr) => arr.map(r => `${escHtml(r.employee_name)} ${t(r)}`).join("، ") || "—";
  return `<div class="dr-cash${outs.length < ins.length ? " no" : ""}">🕘 الحضور: ${ins.length} · الانصراف: ${outs.length}<span class="dr-cash-sub">حضور: ${list(ins)}<br>انصراف: ${list(outs)}</span></div>`;
}

function dailyBranchHtml(c, date) {
  const chip = (ok, label) => `<span class="dr-check ${ok ? "ok" : "no"}">${ok ? "✅" : "⚠️"} ${label}</span>`;
  const closed = !!(c.custody && c.custody.closed_at);
  const cell = (u, grams, isWeight) => `${drNum(u)}${isWeight && grams ? `<small>${drNum(grams, 0)} جم</small>` : ""}`;
  const rows = c.sections.map(s => `<tr>
      <td class="dr-cat">${s.icon} ${s.label || s.cat}</td>
      <td>${cell(s.receivedU, s.received, s.weight)}</td>
      <td>${s.soldUnits > 0 ? drNum(s.soldUnits) : "—"}</td>
      <td>${s.counted ? cell(s.remainingU, s.remaining, s.weight) : "—"}</td>
      <td>${(s.wasted || s.excessU) ? cell(s.wastedU + s.excessU, s.wasted + s.excessU * (s.weight ? MEAL_WEIGHT_G : 1), s.weight) : "0"}</td>
      <td>${drGapHtml(s)}</td>
    </tr>`).join("");

  let cash = `<div class="dr-cash no">💵 العهدة: لم تُغلق</div>`;
  if (closed) {
    const r = custodyReconciliation({ ...c.custody, expenses: c.custody.expenses || [] }, c.pays);
    cash = c.pays.length
      ? `<div class="dr-cash">💵 الكاش: ${diffPillHtml(r.cashDiff)} <span class="dr-cash-sub">المتوقع ${sar(r.expectedCash)} · المعدود ${sar(Number(c.custody.cash_counted || 0))}</span></div>
         <div class="dr-cash">💳 الشبكة: ${diffPillHtml(r.cardDiff)}</div>`
      : `<div class="dr-cash">💵 العهدة مقفولة — مبيعات تابسنس لهذا اليوم ما انسحبت للحين</div>`;
  }

  const empty = !c.sections.length;
  return `<section class="dr-card">
    <div class="dr-head"><b>🏪 ${c.branch}</b><span>${new Date(date + "T12:00:00Z").toLocaleDateString(phLocale(), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</span></div>
    <div class="dr-checks">${chip(c.hasReceiving, "الاستلام")}${chip(c.hasRemaining, "جرد المتبقي")}${chip(c.hasSales, "مبيعات تابسنس")}${chip(closed, "إغلاق العهدة")}</div>
    ${empty ? `<div class="dr-empty">ما فيه بيانات لهذا اليوم.</div>` : `
    <div class="dr-table-wrap"><table class="dr-table">
      <colgroup><col style="width:24%"><col style="width:14%"><col style="width:11%"><col style="width:14%"><col style="width:12%"><col style="width:25%"></colgroup>
      <thead><tr><th>القسم</th><th>المستلم</th><th>المباع</th><th>المتبقي</th><th>الهدر</th><th>الفرق</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="dr-note">الأرقام بالوجبات (الوجبة ${MEAL_WEIGHT_G} جم) · الفرق = المستلم − المتبقي − الهدر المسجل − المباع · الفرق حتى 10% من المستلم طبيعي، وما زاد عليه ينحسب هدر · «مباع أكثر» غالباً يعني إن الاستلام ما انسجل كامل</div>`}
    ${cash}
    ${saladDailyLine(c)}
    ${attendanceDailyLine(c)}
  </section>`;
}


// ---- 📄 ملخص الفروع صفحة وحدة PDF (للمشاركة على قروب التشغيل) ----
function dailySummaryHtml(cards, date) {
  const dateTxt = new Date(date + "T12:00:00Z").toLocaleDateString(phLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const body = cards.map(c => dailyBranchHtml(c, date).replace(/<div class="dr-note">[\s\S]*?<\/div>/, ""))
    .map(h => h.replace(/<div class="dr-cash[^>]*>🕘[\s\S]*?<\/div>/, "").replace(/<div class="dr-cash[^>]*>🥗[\s\S]*?<\/div>/, "")).join("");
  return `<div class="dr-pdf"><div class="dr-pdf-hd"><img src="assets/logo.png" alt=""><div><b>ملخص الفروع اليومي</b><span>${dateTxt}</span></div></div>${body}
    <div class="dr-note">الأرقام بالوجبات (الوجبة ${MEAL_WEIGHT_G} جم) · الفرق = المستلم − المتبقي − الهدر − المباع · الفرق حتى 10% من المستلم طبيعي وما زاد عليه هدر · «مباع أكثر» غالباً يعني إن الاستلام ما انسجل كامل</div></div>`;
}

async function dailySummaryPdf(share, btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ جاري التجهيز…";
  const date = document.getElementById("dailyReportDate").value || todayStr();
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;background:#fff;";
  document.body.appendChild(stage);
  try {
    await Items.load();
    const cards = await Promise.all(branchList().map(b => loadDailyBranch(date, b)));
    if (typeof loadPdfLibs === "function") await loadPdfLibs();
    if (!window.html2canvas || !window.jspdf) throw new Error("مكتبة PDF ما تحمّلت — تأكد من النت");
    stage.innerHTML = dailySummaryHtml(cards, date);
    const canvas = await html2canvas(stage.firstElementChild, { scale: 2, backgroundColor: "#ffffff", logging: false });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const M = 6, maxW = 210 - M * 2, maxH = 297 - M * 2;
    let w = maxW, h = (canvas.height / canvas.width) * w;
    if (h > maxH) { h = maxH; w = (canvas.width / canvas.height) * h; } // كل الفروع بصفحة وحدة: نصغّر لو طالت
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (210 - w) / 2, M, w, h);
    const blob = pdf.output("blob");
    const name = `ملخص_الفروع_${date}.pdf`;
    const file = new File([blob], name, { type: "application/pdf" });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "ملخص الفروع اليومي", text: `ملخص الفروع — ${date}` }); return; }
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
