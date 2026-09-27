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
    if (run === dailyReportRun) view.innerHTML = `<div class="empty-state">⚠ تعذّر تحميل التقرير — ${e.message || e}</div>`;
    return;
  }
  if (run !== dailyReportRun) return;
  view.innerHTML = cards.map(c => dailyBranchHtml(c, date)).join("");
}

async function loadDailyBranch(date, branch) {
  const [day, sales, waste, custody, pays] = await Promise.all([
    SupaEngine.getDay(date, branch).catch(() => null),
    SupaEngine.getSalesByCategory(date, date, branch).catch(() => []),
    SupaEngine.getWasteReport(date, branch).catch(() => null),
    SupaEngine.getCustody(date, branch).catch(() => null),
    SupaEngine.getPayments(date, branch).catch(() => [])
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
      if (s.weight) return a + Number(x.remainingWeight != null ? x.remainingWeight : (x.remainingSauce == null ? (x.remaining || 0) : 0));
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
    return { ...s, received, remaining, wasted, soldUnits, counted, missing, gap, pct,
             receivedU: toMeals(received), remainingU: toMeals(remaining), wastedU: toMeals(wasted) };
  }).filter(s => s.received > 0 || s.counted || s.soldUnits > 0 || s.wasted > 0);

  return {
    branch, sections,
    hasReceiving: items.some(x => Number(x.received || 0) > 0),
    hasRemaining: items.some(x => x.remaining != null || x.remainingWeight != null || x.remainingSauce != null),
    hasSales: (sales || []).length > 0,
    hasWaste: wasteItems.length > 0,
    custody, pays: pays || []
  };
}

function drNum(n, digits = 1) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return r.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function drGapHtml(s) {
  if (s.gap === null) return `<span class="dr-gap missing" title="ناقص: ${s.missing.join("، ")}">ناقص ${s.missing.join(" + ")}</span>`;
  const cls = s.pct <= 0.05 ? "ok" : s.pct <= 0.10 ? "warn" : "bad";
  if (Math.abs(s.gap) < 0.05) return `<span class="dr-gap ok">✓ مطابق</span>`;
  // موجب: أكل طلع بدون بيع (عجز). سالب: انباع أكثر من اللي طلع — غالباً استلام ما انسجل كامل
  const g = s.weight ? `<small>${drNum(Math.abs(s.gap) * MEAL_WEIGHT_G, 0)} جم</small>` : "";
  return `<span class="dr-gap ${cls}">${s.gap > 0 ? "عجز" : "مباع أكثر"}<b>${drNum(Math.abs(s.gap))}</b>${g}</span>`;
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
      <td>${s.wasted ? cell(s.wastedU, s.wasted, s.weight) : "0"}</td>
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
    <div class="dr-note">الأرقام بالوجبات (الوجبة ${MEAL_WEIGHT_G} جم) · الفرق = المستلم − المتبقي − الهدر − المباع · «مباع أكثر» يعني غالباً إن الاستلام ما انسجل كامل · 🟢 ≤5% 🟡 ≤10% 🔴 أكثر</div>`}
    ${cash}
  </section>`;
}
