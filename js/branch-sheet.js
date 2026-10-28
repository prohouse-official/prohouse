// ==================== 📄 ورقة الفرع اليومية (نهاية اليوم) ====================
// صفحة A4 لكل فرع: حكم عام بلون + جملة بسيطة، أرقام اليوم مع مقارنة نفس اليوم من الأسبوع اللي فات،
// جدول الأقسام (وجبات + جرام)، أكثر أصناف تستحق الانتباه، الكاش والمصاريف، الحضور، السلطات،
// الجرد الجانبي، «شو نسوي بكرا» (3 نقاط)، ودرجة الفرع الأسبوعية من 100.
// الحكم: أخضر = كل شي مسجّل + الفرق بكل قسم ≤10% + الكاش مظبوط. أصفر = تسجيل ناقص أو فرق 10–15%.
// أحمر = فرق فوق 15% أو عجز بالكاش (أي عجز) أو العهدة ما انقفلت.

const BS_GAP_RED = 0.15;
const BS_STATUS = {
  green: { cls: "g", icon: "✅", label: "يوم نظيف" },
  yellow: { cls: "y", icon: "⚠️", label: "يحتاج انتباه" },
  red: { cls: "r", icon: "🛑", label: "فيه مشكلة" },
  none: { cls: "n", icon: "➖", label: "ما في بيانات" }
};

const bsNorm = (s) => String(s || "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
const bsSum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const bsFmt = (n, d = 0) => (n === null || n === undefined || !isFinite(n) ? "—" : Math.round(n * 10 ** d) / 10 ** d).toLocaleString("en-US", { maximumFractionDigits: d });
const bsRem = (x, weight) => weight
  ? Number(x.remainingWeight != null ? x.remainingWeight : (x.remainingSauce != null ? x.remainingSauce : (x.remaining || 0)))
  : Number(x.remaining != null ? x.remaining : (x.remainingWeight || 0));

// نسخة خفيفة ليوم (لدرجة الأسبوع والمقارنة): أقسام + عهدة + مبيعات
async function bsLoadLite(date, branch) {
  const [day, sales, custody, pays, products] = await Promise.all([
    SupaEngine.getDay(date, branch).catch(() => null),
    SupaEngine.getSalesByCategory(date, date, branch).catch(() => []),
    SupaEngine.getCustody(date, branch).catch(() => null),
    SupaEngine.getPayments(date, branch).catch(() => []),
    SupaEngine.getProductSales(date, date, branch).catch(() => [])
  ]);
  const salesMap = {};
  (sales || []).forEach(r => { salesMap[r.category] = (salesMap[r.category] || 0) + Number(r.qty || 0); });
  const items = (day && day.items) || [];
  const sections = drComputeSections(items, salesMap, [], drMadeToOrderByCat(products, branch));
  return {
    date, branch, items, sections, custody, pays: pays || [],
    hasReceiving: items.some(x => Number(x.received || 0) > 0),
    hasRemaining: items.some(x => x.remaining != null || x.remainingWeight != null || x.remainingSauce != null),
    hasSales: (sales || []).length > 0
  };
}

function bsMoney(pays) {
  const amount = bsSum(pays, p => p.amount), tx = bsSum(pays, p => p.transactions), ret = bsSum(pays, p => p.returns_amount);
  return { amount, tx, avg: tx > 0 ? amount / tx : null, returns: ret };
}

// ساعات العمل من الحضور والانصراف: أول حضور لآخر انصراف لكل موظف
function bsLaborHours(rows) {
  const by = {};
  (rows || []).forEach(r => { (by[r.employee_name] = by[r.employee_name] || { ins: [], outs: [] })[r.kind === "out" ? "outs" : "ins"].push(new Date(r.recorded_at).getTime()); });
  let hours = 0, pairs = 0;
  Object.values(by).forEach(e => {
    if (!e.ins.length || !e.outs.length) return;
    const h = (Math.max(...e.outs) - Math.min(...e.ins)) / 3600000;
    if (h > 0 && h < 20) { hours += h; pairs++; }
  });
  return { hours, pairs };
}

// أصناف الوزن (دجاج/لحم/بحري): المستخدم بالوجبات مقابل المباع حسب اسم المنتج بالكاشير، وإلا نسبة المتبقي
function bsAttentionItems(day, productSales) {
  const prod = (productSales || []).map(p => ({ n: bsNorm(p.product), qty: Number(p.qty || 0) }));
  const used = new Set();
  const out = [];
  (day.items || []).forEach(x => {
    const def = Items.byId(x.itemId) || {};
    if (!["دجاج", "لحم", "بحري"].includes(def.category)) return;
    const received = Number(x.received || 0);
    if (!(received >= 300)) return;
    const counted = x.remaining != null || x.remainingWeight != null || x.remainingSauce != null;
    if (!counted) return;
    const rem = bsRem(x, true);
    const name = x.cookName || def.name || x.itemName || x.itemId;
    const cand = [def.name, x.cookName, x.itemName].filter(Boolean).map(bsNorm);
    let sold = null;
    prod.forEach((p, i) => {
      if (used.has(i) || !p.n) return;
      if (cand.some(c => c && (p.n === c || (c.length >= 5 && (p.n.includes(c) || c.includes(p.n)) && p.n.length >= 5)))) { sold = (sold || 0) + p.qty; used.add(i); }
    });
    const usedMeals = (received - rem) / MEAL_WEIGHT_G;
    const leftPct = rem / received;
    const gap = sold === null ? null : usedMeals - sold;
    let note = "", score = 0;
    if (gap !== null && Math.abs(gap) >= 1.5 && Math.abs(gap) / (received / MEAL_WEIGHT_G) > 0.10) { note = gap > 0 ? `طلع ${bsFmt(gap, 1)} وجبة أكثر من المباع` : `انباع ${bsFmt(-gap, 1)} وجبة أكثر من المستخدم`; score = Math.abs(gap) * 2; }
    else if (rem === 0 && received >= 600) { note = "نفد الصنف"; score = 1.2; }
    else if (leftPct >= 0.45) { note = `بقي منه ${bsFmt(leftPct * 100)}%`; score = leftPct * 3; }
    if (note) out.push({ name, received, rem, sold, usedMeals, note, score });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

function bsGather(L, last, week) {
  const c = L.base;
  const sections = c.sections;
  const money = bsMoney(c.pays), lastMoney = last ? bsMoney(last.pays) : null;
  const closed = !!(c.custody && c.custody.closed_at);
  const rec = closed && c.pays.length ? custodyReconciliation({ ...c.custody, expenses: c.custody.expenses || [] }, c.pays) : null;
  const labor = bsLaborHours(c.attendance);
  const noData = !c.hasReceiving && !c.hasRemaining && !c.hasSales && !closed;
  const reasons = [];
  let level = "green";
  const up = (lv) => { if (lv === "red" || (lv === "yellow" && level === "green")) level = lv; };
  if (!noData) {
    sections.forEach(s => {
      const lbl = s.label || s.cat;
      if (s.gap === null) { up("yellow"); reasons.push(`${lbl}: ناقص ${s.missing.join(" و")}`); return; }
      const what = s.gap > 0 ? `طلع ${bsFmt(s.gap, 1)} وجبة من المطبخ بدون ما تنباع` : `انباع ${bsFmt(-s.gap, 1)} وجبة أكثر من اللي طلع (غالباً استلام ناقص)`;
      const gr = s.weight && s.gap > 0 ? ` = ${bsFmt(s.gap * MEAL_WEIGHT_G)} جم` : "";
      if (s.pct > BS_GAP_RED) { up("red"); reasons.push(`${lbl}: ${what}${gr} (${bsFmt(s.pct * 100)}% من المستلم — أكثر من المسموح)`); }
      else if (s.pct > DR_NORMAL_GAP) { up("yellow"); reasons.push(`${lbl}: ${what}${gr} (${bsFmt(s.pct * 100)}% — فوق الطبيعي)`); }
    });
    if (!c.hasReceiving) { up("yellow"); reasons.push("الاستلام ما انسجل"); }
    if (!c.hasRemaining) { up("yellow"); reasons.push("جرد المتبقي ما انسجل"); }
    if (!c.hasSales) { up("yellow"); reasons.push("مبيعات تابسنس ما وصلت"); }
    if (!closed) { up("red"); reasons.push("العهدة ما انقفلت"); }
    else if (rec && rec.cashDiff !== null && rec.cashDiff <= -1) { up("red"); reasons.push(`الكاش: عجز ${sar(Math.abs(rec.cashDiff))}`); }
    else if (rec && rec.cashDiff !== null && rec.cashDiff >= 1) { up("yellow"); reasons.push(`الكاش: زيادة ${sar(rec.cashDiff)}`); }
  } else level = "none";
  // مصاريف
  const exps = (c.custody && c.custody.expenses) || [];
  const noReceipt = exps.filter(e => !e.receipt && Number(e.amount) >= 100);
  // جرد جانبي: الحلويات + أي صنف ثابت للجرد (ثلاجة الواجهة)
  const side = (L.day.items || []).filter(x => { const d = Items.byId(x.itemId) || {}; return String(x.itemId).startsWith("fr_") || d.category === "الحلويات"; })
    .filter(x => x.remaining != null || x.remainingWeight != null || Number(x.received || 0) > 0);
  const attention = bsAttentionItems(L.day, L.productSales);
  // شو نسوي بكرا
  const todo = [];
  if (!noData) {
    if (!c.hasRemaining) todo.push("سجّل جرد المتبقي قبل إغلاق اليوم — بدونه ما نقدر نحسب الاستهلاك.");
    if (!c.hasReceiving) todo.push("سجّل استلام الصباح من شاشة الاستلام.");
    if (!closed) todo.push("اقفل العهدة وعدّ الكاش.");
    if (rec && rec.cashDiff !== null && rec.cashDiff <= -1) todo.push(`راجع عدّ الكاش: العجز ${sar(Math.abs(rec.cashDiff))}.`);
    sections.filter(s => s.gap !== null && s.pct > DR_NORMAL_GAP && s.gap > 0).forEach(s => todo.push(`${s.label || s.cat}: راجع وزن التقديم والوجبات اللي طلعت بدون بيع (فرق ${bsFmt(s.gap, 1)} وجبة).`));
    attention.filter(a => /بقي منه/.test(a.note)).slice(0, 1).forEach(a => todo.push(`قلّل طلبية «${a.name}» (${a.note}).`));
    attention.filter(a => a.note === "نفد الصنف").slice(0, 1).forEach(a => todo.push(`«${a.name}» نفد: فكّر تزيد طلبه شوي.`));
    if (noReceipt.length) todo.push(`صوّر فاتورة المصروف (${sar(noReceipt[0].amount)}${noReceipt[0].note ? " — " + noReceipt[0].note : ""}).`);
    if (c.sections.some(s => s.weight) && !c.hasWaste) todo.push("سجّل أي هدر حصل (إذا ما في هدر ما يحتاج شي).");
  }
  return { c, L, sections, money, lastMoney, closed, rec, labor, level, reasons, exps, noReceipt, side, attention, todo: todo.slice(0, 3), noData, week };
}

// درجة الأسبوع من 100: التسجيل 35 + الفرق 35 + الكاش 20 + إغلاق العهدة 10
function bsWeekScore(days) {
  const act = days.filter(d => d.hasReceiving || d.hasRemaining || d.hasSales || (d.custody && d.custody.closed_at));
  if (!act.length) return null;
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const rec = avg(act.map(d => ((d.hasReceiving ? 1 : 0) + (d.hasRemaining ? 1 : 0) + (d.hasSales ? 1 : 0)) / 3));
  const gaps = act.map(d => { const s = d.sections.filter(x => x.gap !== null); return s.length ? s.filter(x => x.pct <= DR_NORMAL_GAP).length / s.length : null; }).filter(x => x !== null);
  const gapScore = gaps.length ? avg(gaps) : 0;
  const cash = avg(act.map(d => {
    if (!(d.custody && d.custody.closed_at) || !d.pays.length) return 0;
    const r = custodyReconciliation({ ...d.custody, expenses: d.custody.expenses || [] }, d.pays);
    return r.cashDiff !== null && Math.abs(r.cashDiff) < 1 ? 1 : 0;
  }));
  const close = avg(act.map(d => (d.custody && d.custody.closed_at ? 1 : 0)));
  const parts = [
    { k: "التسجيل", v: rec, max: 35 }, { k: "الفرق ضمن 10%", v: gapScore, max: 35 },
    { k: "الكاش مظبوط", v: cash, max: 20 }, { k: "إغلاق العهدة", v: close, max: 10 }
  ].map(p => ({ ...p, pts: Math.round(p.v * p.max) }));
  return { total: parts.reduce((a, p) => a + p.pts, 0), parts, days: act.length };
}

async function bsLoadBranch(date, branch) {
  const [base, day, productSales, lastWeek] = await Promise.all([
    loadDailyBranch(date, branch),
    SupaEngine.getDay(date, branch).catch(() => null),
    SupaEngine.getProductSales(date, date, branch).catch(() => []),
    SupaEngine.getPayments(addDaysStr(date, -7), branch).catch(() => [])
  ]);
  const weekDays = await Promise.all([6, 5, 4, 3, 2, 1].map(n => bsLoadLite(addDaysStr(date, -n), branch)));
  weekDays.push({ ...base, items: (day && day.items) || [], date });
  return { base, day: day || { items: [] }, productSales, lastWeek: { pays: lastWeek }, weekDays };
}

function bsArrow(cur, prev) {
  if (!(prev > 0)) return `<small class="bs-mut">لا يوجد رقم للمقارنة</small>`;
  const d = ((cur - prev) / prev) * 100;
  if (Math.abs(d) < 1) return `<small class="bs-mut">مثل نفس اليوم الأسبوع الماضي</small>`;
  return `<small class="${d > 0 ? "bs-up" : "bs-dn"}">${d > 0 ? "▲ أعلى" : "▼ أقل"} بـ ${bsFmt(Math.abs(d))}% من نفس اليوم الأسبوع الماضي</small>`;
}

// فرق الكاش بنص ملوّن (بدون كبسولات)
function bsDiff(diff) {
  if (diff === null || diff === undefined) return `<b class="bs-mut">لم يُسجَّل</b>`;
  if (Math.abs(diff) < 1) return `<b class="bs-okc">مطابق</b>`;
  return diff < 0 ? `<b class="bs-noc">عجز ${sar(Math.abs(diff))}</b>` : `<b class="bs-warnc">زيادة ${sar(diff)}</b>`;
}

function bsPageHtml(g, date, idx, total) {
  const st = BS_STATUS[g.level];
  const dateTxt = new Date(date + "T12:00:00Z").toLocaleDateString(phLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const reasons = g.noData ? ["ما في أي بيانات مسجّلة لهذا اليوم."] : g.level === "green" ? ["كل شي مسجّل، والفروقات ضمن المسموح، والكاش مظبوط."] : g.reasons.slice(0, 3);
  const hasPay = g.c.pays.length > 0;
  const splh = g.labor.pairs && g.labor.hours > 0 && g.money.amount > 0 ? g.money.amount / g.labor.hours : null;
  const kpi = (label, val, sub) => `<div class="bs-kpi"><span>${label}</span><b>${val}</b>${sub || ""}</div>`;
  const kpis = [
    kpi("مبيعات اليوم", hasPay ? sar(g.money.amount) : "—", hasPay ? bsArrow(g.money.amount, g.lastMoney ? g.lastMoney.amount : 0) : `<small class="bs-mut">لم تصل من تابسنس</small>`),
    kpi("عدد الطلبات · متوسط الفاتورة", hasPay ? `${bsFmt(g.money.tx)} · ${g.money.avg ? bsFmt(g.money.avg, 1) : "—"} ر.س` : "—", hasPay && g.lastMoney && g.lastMoney.tx ? `<small class="bs-mut">الأسبوع الماضي: ${bsFmt(g.lastMoney.tx)} طلب</small>` : ""),
    kpi("مبيعات كل ساعة عمل", splh ? `${bsFmt(splh)} ر.س` : "—", splh ? `<small class="bs-mut">إجمالي ${bsFmt(g.labor.hours, 1)} ساعة عمل</small>` : `<small class="bs-mut">الحضور والانصراف غير مكتمل</small>`)
  ].join("");
  const checks = [[g.c.hasReceiving, "الاستلام"], [g.c.hasRemaining, "جرد المتبقي"], [g.c.hasSales, "مبيعات تابسنس"], [g.closed, "إغلاق العهدة"]]
    .map(([ok, l]) => `<span class="${ok ? "bs-okc" : "bs-noc"}">${ok ? "✓" : "✗"} ${l}</span>`).join("");
  const rows = g.sections.map(s => {
    const lvl = s.gap === null ? "n" : s.pct > BS_GAP_RED ? "r" : s.pct > DR_NORMAL_GAP ? "y" : "g";
    const cell = (u, grams) => `<b>${bsFmt(u, 1)}</b>${s.weight && grams ? `<small>${bsFmt(grams)} جم</small>` : ""}`;
    const wasteTot = s.wastedU + s.excessU;
    const gapTxt = s.gap === null ? `ناقص ${s.missing.join(" و")}` : Math.abs(s.gap) < 0.05 ? "مطابق" : `${s.gap > 0 ? "طلع بدون بيع" : "انباع أكثر"} ${bsFmt(Math.abs(s.gap), 1)}`;
    return `<tr><td class="bs-cat">${s.label || s.cat}</td>
      <td>${cell(s.receivedU, s.received)}</td><td><b>${s.soldUnits > 0 ? bsFmt(s.soldUnits, 0) : "—"}</b></td>
      <td>${s.counted ? cell(s.remainingU, s.remaining) : "—"}</td>
      <td>${wasteTot > 0.04 ? cell(wasteTot, s.wasted + s.excessU * (s.weight ? MEAL_WEIGHT_G : 1)) : "<b>0</b>"}</td>
      <td class="bs-gap"><i class="bs-dot ${lvl}"></i>${gapTxt}</td></tr>`;
  }).join("");
  const att = g.c.attendance || [];
  const tm = (r) => new Date(r.recorded_at).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });
  const attOff = typeof isAttendanceOffBranch === "function" && isAttendanceOffBranch(g.c.branch);
  const dl = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const info = [];
  if (!attOff) info.push(dl("حضور", att.filter(r => r.kind !== "out").map(r => `${escHtml(r.employee_name)} ${tm(r)}`).join("، ") || "—"), dl("انصراف", att.filter(r => r.kind === "out").map(r => `${escHtml(r.employee_name)} ${tm(r)}`).join("، ") || "—"));
  if (typeof SALAD_BRANCH_KEY !== "undefined" && SALAD_BRANCH_KEY[g.c.branch]) {
    const sm = saladSummary(g.c.salad, g.c.branch);
    info.push(dl("تجهيز السلطات", !g.c.salad || !sm.started ? "القائمة لم تُعبَّأ" : `${sm.ok} من ${sm.total} جاهز${sm.miss.length ? " — ناقص: " + sm.miss.slice(0, 5).map(escHtml).join("، ") + (sm.miss.length > 5 ? "…" : "") : ""}`));
  }
  const cashTbl = g.rec ? `<dl class="bs-dl">${dl("المتوقع بالدرج", sar(g.rec.expectedCash))}${dl("المعدود", sar(Number(g.c.custody.cash_counted || 0)))}${dl("فرق الكاش", bsDiff(g.rec.cashDiff))}${dl("فرق الشبكة", bsDiff(g.rec.cardDiff))}</dl>`
    : `<p class="bs-mut">${g.closed ? "العهدة مقفولة — مبيعات تابسنس لم تصل للمطابقة." : "العهدة لم تُغلق."}</p>`;
  const expLines = g.exps.slice(0, 5).map(e => `<tr><td>${sar(e.amount)}</td><td class="bs-l">${escHtml(String(e.supplier || e.note || "مصروف").split("\n")[0].slice(0, 30))}</td><td class="${e.receipt ? "bs-okc" : "bs-noc"}">${e.receipt ? "فاتورة" : "بدون فاتورة"}</td></tr>`).join("");
  const expMore = g.exps.length > 5 ? `<tr><td colspan="3" class="bs-mut">+ ${g.exps.length - 5} مصاريف أخرى</td></tr>` : "";
  const sideTxt = g.side.length ? g.side.slice(0, 8).map(x => `${escHtml(x.cookName || (Items.byId(x.itemId) || {}).name || x.itemName || "")} <b>${x.remaining != null ? bsFmt(Number(x.remaining)) : x.remainingWeight != null ? bsFmt(Number(x.remainingWeight)) : "—"}</b>`).join(" &nbsp;|&nbsp; ") : "";
  const att3 = g.attention.map(a => `<tr><td class="bs-cat">${escHtml(a.name)}</td><td>${bsFmt(a.received)} جم</td><td>${bsFmt(a.rem)} جم</td><td>${a.sold === null ? "—" : bsFmt(a.sold)}</td><td class="bs-note">${a.note}</td></tr>`).join("");
  const wk = g.week;
  const weekBlock = wk ? `<div class="bs-score"><div class="bs-score-n"><b>${wk.total}</b><span>من 100<br>تقييم آخر 7 أيام</span></div>
      <div class="bs-score-p">${wk.parts.map(p => `<div><span>${p.k}</span><div class="bs-bar"><i style="width:${Math.round(p.v * 100)}%"></i></div><b>${p.pts}/${p.max}</b></div>`).join("")}</div></div>` : "";
  const sec = (t) => `<div class="bs-sec"><span>${t}</span></div>`;
  return `<div class="bs-page">
    <div class="bs-hd"><div class="bs-hd-r"><img src="assets/logo.png" alt=""><div><small>تقرير نهاية اليوم</small><b>${escHtml(g.c.branch)}</b></div></div><div class="bs-hd-l"><b>${dateTxt}</b><small>صفحة ${idx} من ${total}</small></div></div>
    <div class="bs-body">
    <div class="bs-status"><div class="bs-stamp ${st.cls}">${st.label}</div><ul>${reasons.map(r => `<li>${r}</li>`).join("")}</ul></div>
    <div class="bs-kpis">${kpis}</div>
    <div class="bs-checks"><span class="bs-lbl">التسجيل</span>${checks}</div>
    ${g.sections.length ? `${sec("الأقسام")}<table class="bs-tbl"><thead><tr><th>القسم</th><th>المستلم</th><th>المباع</th><th>المتبقي</th><th>الهدر</th><th>الفرق</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="bs-hint">الأرقام بالوجبات (الوجبة ${MEAL_WEIGHT_G} جم)${madeToOrderApplies(g.c.branch) ? '، والمباع بدون أصناف «حسب الطلب» (ستيك، سالمون، فيليه، بلانكو)' : ''}. الفرق = المستلم − المتبقي − الهدر المسجّل − المباع. الفرق حتى 10% من المستلم طبيعي، وما زاد عليه يُحسب هدراً.</div>` : `<div class="bs-empty">لا توجد أرقام أقسام لهذا اليوم.</div>`}
    ${att3 ? `${sec("أصناف تستحق الانتباه")}<table class="bs-tbl bs-sm"><thead><tr><th>الصنف</th><th>المستلم</th><th>المتبقي</th><th>المباع</th><th>الملاحظة</th></tr></thead><tbody>${att3}</tbody></table>` : ""}
    <div class="bs-two">
      <div>${sec("الكاش والمصاريف")}${cashTbl}${g.exps.length ? `<table class="bs-exp"><tbody>${expLines}${expMore}</tbody></table>` : ""}</div>
      <div>${sec("الحضور والتجهيز")}${info.length ? `<dl class="bs-dl">${info.join("")}</dl>` : `<p class="bs-mut">—</p>`}</div>
    </div>
    ${sideTxt ? `${sec("الجرد الجانبي: ثلاجة الواجهة والحلويات")}<p class="bs-side">${sideTxt}</p>` : ""}
    <div class="bs-todo"><div class="bs-todo-h">إجراءات الغد</div>${g.todo.length ? `<ol>${g.todo.map(t => `<li>${escHtml(t)}</li>`).join("")}</ol>` : `<p>لا يوجد إجراء مطلوب. نكمل بنفس الأداء.</p>`}</div>
    ${weekBlock}
    </div>
    <div class="bs-ft"><span>برو هاوس · نظام التشغيل</span><span>أُنشئت ${new Date().toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" })}</span></div>
  </div>`;
}

async function bsBuildPages(date, branches) {
  await Items.load();
  const gs = [];
  for (const b of branches) {
    const L = await bsLoadBranch(date, b);
    const lastP = L.lastWeek.pays && L.lastWeek.pays.length ? { pays: L.lastWeek.pays } : null;
    gs.push(bsGather({ ...L, base: L.base }, lastP, bsWeekScore(L.weekDays)));
  }
  return gs.map((g, i) => bsPageHtml(g, date, i + 1, gs.length));
}

// معاينة على الشاشة + PDF (ملف واحد: صفحة لكل فرع)
async function branchSheetsPreview(btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ جاري التجهيز…";
  try {
    const date = document.getElementById("dailyReportDate").value || todayStr();
    const only = document.getElementById("dailyReportBranch").value;
    const pages = await bsBuildPages(date, only ? [only] : branchList());
    document.getElementById("dailyReportView").innerHTML = `<div class="bs-preview">${pages.join("")}</div>`;
  } catch (e) { showToast("⚠ " + (e.message || e)); }
  finally { btn.disabled = false; btn.textContent = label; }
}

async function branchSheetsPdf(share, btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ جاري التجهيز…";
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;background:#fff;";
  document.body.appendChild(stage);
  try {
    const date = document.getElementById("dailyReportDate").value || todayStr();
    const pages = await bsBuildPages(date, branchList());
    if (typeof loadPdfLibs === "function") await loadPdfLibs();
    if (!window.html2canvas || !window.jspdf) throw new Error("مكتبة PDF ما تحمّلت — تأكد من النت");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    for (let i = 0; i < pages.length; i++) {
      stage.innerHTML = pages[i];
      const el = stage.firstElementChild;
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", logging: false });
      if (i) pdf.addPage("a4", "portrait");
      let w = 210, h = (canvas.height / canvas.width) * w;
      if (h > 297) { h = 297; w = (canvas.width / canvas.height) * h; } // صفحة أطول من A4: نصغّرها بنفس النسبة
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (210 - w) / 2, 0, w, h);
    }
    const blob = pdf.output("blob");
    const name = `ورقة_الفروع_${date}.pdf`;
    const file = new File([blob], name, { type: "application/pdf" });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "ورقة الفروع اليومية", text: `ورقة الفروع — ${date}` }); return; }
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
