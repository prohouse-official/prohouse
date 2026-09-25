// ==================== الرئيسية (Dashboard) ====================
// المبدأ: الشاشة تقول للموظف "شو المطلوب منك الحين" قبل ما تعرض أرقام.
// كل سطر بكرت المهام قابل للضغط وبيوديك للمكان المطلوب مباشرة.

function branchVisibleItems(branch) {
  return Items.current.filter(item => {
    const list = (item.branches || "").split(",").map(s => s.trim()).filter(Boolean);
    return list.length === 0 || list.includes(branch);
  });
}

// مجموع الوجبات المستلمة (الأصناف اللي بتتوزن فقط) لهذا اليوم — نفس معادلة شاشة الاستلام
function mealsFromDayItems(dayItems) {
  const catById = {};
  Items.current.forEach(it => { catById[it.id] = it.category; });
  let grams = 0;
  (dayItems || []).forEach(it => {
    if (!isMealCategory(catById[it.itemId])) return;
    const n = Number(it.received);
    if (it.received !== "" && it.received != null && !isNaN(n)) grams += n;
  });
  return grams / MEAL_WEIGHT_G;
}

// يبذر كاش كل شاشة من رد الداشبورد المجمّع — هيك شاشات الاستلام/المتبقي/العصيرات
// بتلاقي بياناتها محفوظة محلياً وما بتحتاج طلبات إضافية أول ما يفتحها الموظف.
function applyDashboardPayload(dash) {
  if (!dash || !dash.branches) return;
  const today = dash.date || todayStr();
  const yesterday = addDaysStr(today, -1);
  const tomorrow = addDaysStr(today, 1);
  Object.keys(dash.branches).forEach(branch => {
    const b = dash.branches[branch];
    if (!b) return;
    
    // حماية التعديلات الحالية: لا نكتب فوق كاش اليوم إذا كان المستخدم بدأ يعبّيه محلياً
    const existingDay = Sync.cacheGet ? Sync.cacheGet("day:" + today + ":" + branch) : null;
    const hasLocalEdits = existingDay && existingDay.items && existingDay.items.some(i => i.received !== "" && i.received != null);
    if (b.today && !hasLocalEdits) Sync.cacheSet("day:" + today + ":" + branch, b.today);

    if (b.yesterday) Sync.cacheSet("day:" + yesterday + ":" + branch, b.yesterday);
    if (b.tomorrow) Sync.cacheSet("tomorrow:" + tomorrow + ":" + branch, b.tomorrow);
    if (b.juiceDay) Sync.cacheSet("juiceday:" + today + ":" + branch, b.juiceDay);
  });
}

async function loadBranchStatus(branch, dash) {
  const visible = branchVisibleItems(branch);
  const today = todayStr();
  const yesterday = addDaysStr(today, -1);
  const tomorrow = addDaysStr(today, 1);

  let dayData, yesterdayData, tomorrowOrder, juiceDay;
  const fromDash = dash && dash.branches && dash.branches[branch];
  if (fromDash) {
    // نداء واحد مجمّع من السيرفر (getDashboard) بدل 4 نداءات مستقلة لكل فرع
    dayData = fromDash.today;
    yesterdayData = fromDash.yesterday;
    tomorrowOrder = fromDash.tomorrow;
    juiceDay = fromDash.juiceDay || null;
  } else {
    // ما رجع الداشبورد (أوفلاين من أول مرة)؟ منرجع للطريقة القديمة — الكاش المحلي بيكفّي
    [dayData, yesterdayData, tomorrowOrder, juiceDay] = await Promise.all([
      Sync.get("getDay", { date: today, branch }, "day:" + today + ":" + branch),
      Sync.get("getDay", { date: yesterday, branch }, "day:" + yesterday + ":" + branch),
      Sync.get("getTomorrowOrder", { date: tomorrow, branch }, "tomorrow:" + tomorrow + ":" + branch),
      tabAllowed("juices")
        ? Sync.get("getJuiceDay", { date: today, branch }, "juiceday:" + today + ":" + branch)
        : Promise.resolve(null)
    ]);
  }

  const items = (dayData && dayData.items) || [];
  const confirmedIds = new Set(items.filter(it => it.confirmed === true || it.confirmed === "TRUE").map(it => it.itemId));
  const touchedIds = new Set(items.filter(it => it.received !== "" && it.received != null).map(it => it.itemId));

  const total = visible.length;
  const confirmed = visible.filter(it => confirmedIds.has(it.id)).length;
  const touched = visible.filter(it => touchedIds.has(it.id)).length;

  let status = "none";
  if (touched > 0 && confirmed >= total && total > 0) status = "done";
  else if (touched > 0) status = "partial";

  const juicesTotal = typeof visibleJuicesFor === "function" ? visibleJuicesFor(branch).length : 0;
  const juicesCounted = ((juiceDay && juiceDay.items) || [])
    .filter(r => r.counted !== "" && r.counted != null && !isNaN(Number(r.counted))).length;

  const chkStats = typeof Checklist !== "undefined" ? Checklist.getCompletionStats(today, branch, "morning") : null;
  const checklistComplete = !!(chkStats && chkStats.isComplete);
  const checklistPercent = chkStats ? chkStats.percent : 0;

  const remainingVisible = visible.filter(it => !["كارب", "معدات"].includes(it.category));
  const hasValue = (v) => v !== "" && v !== null && v !== undefined;
  const countedIds = new Set(items.filter(it => hasValue(it.remaining) || hasValue(it.remainingWeight) || hasValue(it.remainingSauce)).map(it => it.itemId));
  let photosCount = 0;
  try {
    const raw = dayData && dayData.meta && dayData.meta.salesReportLink;
    const photos = raw && String(raw).startsWith("[") ? JSON.parse(raw) : [];
    photosCount = Array.isArray(photos) ? photos.length : 0;
  } catch (e) { photosCount = 0; }
  const custody = typeof Custody !== "undefined" ? await Custody.statusFor(today, branch) : null;

  return {
    branch, total, confirmed, touched, status,
    remainingTotal: remainingVisible.length,
    remainingCounted: remainingVisible.filter(it => countedIds.has(it.id)).length,
    photosCount,
    custodyClosed: !!(custody && custody.closed),
    mealsToday: mealsFromDayItems(items),
    mealsYesterday: mealsFromDayItems((yesterdayData && yesterdayData.items) || []),
    tomorrowSaved: !!(tomorrowOrder && tomorrowOrder.length),
    juicesTotal, juicesCounted,
    checklistComplete, checklistPercent
  };
}



// ---- خطوات اليوم: نفس القائمة للموظف (فرعه) وللمالك (كل فرع شغّال) ----
// كل خطوة: حالتها باختصار (✓ / رقم / لسا) وبتفتح شاشتها لما تنكبس
function dayStepsFor(s) {
  const steps = [];
  const fraction = (done, total) => (total > 0 ? `${done}/${total}` : "—");
  const state = (done, total) => (total > 0 && done >= total ? "done" : done > 0 ? "partial" : "todo");

  steps.push({ tab: "receiving", icon: "📦", title: "استلام الصبح", state: state(s.touched, s.total), note: fraction(s.touched, s.total) });
  if (tabAllowed("opening")) {
    steps.push({ tab: "opening", icon: "📷", title: "صور التوثيق", state: s.photosCount > 0 ? "done" : "todo", note: s.photosCount > 0 ? `${s.photosCount} صورة` : "باقي" });
  }
  steps.push({ tab: "remaining", icon: "📊", title: "جرد المتبقي", state: state(s.remainingCounted, s.remainingTotal), note: fraction(s.remainingCounted, s.remainingTotal) });
  if (tabAllowed("custody")) {
    steps.push({ tab: "custody", icon: "💰", title: "إغلاق العهدة", state: s.custodyClosed ? "done" : "todo", note: s.custodyClosed ? "تقفّلت" : "باقي" });
  }
  return steps;
}

function stepRowHtml(step, branch, isNext) {
  const label = step.state === "done" ? "✓ تم" : step.note === "باقي" ? "باقي" : step.note;
  return `
    <button type="button" class="day-step ${step.state}${isNext ? " next" : ""}" data-tab="${step.tab}" data-branch="${branch}">
      <span class="day-step-icon">${step.icon}</span>
      <span class="day-step-title">${step.title}</span>
      <span class="day-step-status">${label}</span>
      <span class="day-step-go">‹</span>
    </button>`;
}

function stepsCardHtml(s, showBranchName) {
  const steps = dayStepsFor(s);
  const nextIndex = steps.findIndex(st => st.state !== "done");
  const doneCount = steps.filter(st => st.state === "done").length;
  return `
    <div class="day-steps-card">
      <div class="day-steps-head">
        <span class="day-steps-branch">${showBranchName ? "🏪 " + s.branch : "خطوات اليوم"}</span>
        <span class="day-steps-count">${doneCount}/${steps.length}</span>
      </div>
      ${steps.map((st, i) => stepRowHtml(st, s.branch, i === nextIndex)).join("")}
    </div>`;
}

async function renderDashboard() {
  const view = document.getElementById("dashboardView");
  if (!view.children.length) {
    view.innerHTML = '<div class="loader">جاري تحميل الرئيسية…</div>';
  }

  await Items.load();
  const branches = workingBranchList();
  const today = todayStr();
  const dash = await Sync.get("getDashboard", { date: today }, "dashboard:" + today, (fresh) => applyDashboardPayload(fresh));
  applyDashboardPayload(dash);
  const statuses = await Promise.all(branches.map(b => loadBranchStatus(b, dash)));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "صباح الخير" : "مساء الخير";
  const name = (Auth.getEmployee() || {}).name || "";
  const dateLabel = new Date().toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long" });

  if (Auth.isBranchStaff()) {
    const activeBranch = Branch.get() || branches[0] || "";
    const s = statuses.find(x => x.branch === activeBranch) || statuses[0];
    const steps = s ? dayStepsFor(s) : [];
    const next = steps.find(st => st.state !== "done");
    view.innerHTML = `
      <div class="home-hello">${greeting}، ${name} 👋</div>
      <div class="home-sub">${dateLabel} · ${activeBranch}</div>
      ${next ? `
        <button type="button" class="home-next" data-tab="${next.tab}" data-branch="${s.branch}">
          <span class="home-next-label">الخطوة الجاية</span>
          <span class="home-next-title">${next.icon} ${next.title}</span>
        </button>` : `<div class="home-all-done">✅ خلّصت كل خطوات اليوم. يعطيك العافية!</div>`}
      ${s ? stepsCardHtml(s, false) : ""}
      <div id="pushCardHome" class="push-card-slot"></div>
    `;
  } else {
    let flagged = [];
    if (Auth.canSeeReports()) {
      const monthStart = today.slice(0, 7) + "-01";
      const flaggedData = await Sync.get("getFlaggedItems", { start: monthStart, end: today }, "flagged:" + monthStart + ":" + today);
      flagged = (flaggedData || []).filter(t => t.returnPct > 0);
    }
    view.innerHTML = `
      <div class="home-hello">${greeting}، ${name}</div>
      <div class="home-sub">${dateLabel}</div>
      ${statuses.map(s => stepsCardHtml(s, true)).join("")}
      ${flagged.length ? `<button type="button" class="home-flag" data-tab="report">⚠ ${flagged.length} صنف إرجاعه مرتفع هالشهر ‹</button>` : ""}
      <div id="pushCardHome" class="push-card-slot"></div>
    `;
  }

  view.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.branch) Branch.set(btn.dataset.branch);
      setActiveTab(btn.dataset.tab);
    });
  });
  if (typeof mountPushCard === "function") mountPushCard(document.getElementById("pushCardHome"), { compact: true });
}

function initDashboardTab() {
  renderDashboard();
}
