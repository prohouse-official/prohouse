// ==================== التقارير (يوم / شهر / فترة) + فلاتر + تصدير Excel ====================

let lastReportData = null;      // البيانات الخام من السيرفر (كل الفروع/الموظفين) لنفس الفترة
let lastReportRange = { start: "", end: "" };
let lastFilteredDays = [];      // بعد تطبيق فلاتر الفرع/الموظف/التصنيف — تُستخدم بالعرض والتصدير معاً

function monthRange(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = monthStr + "-01";
  const lastDay = new Date(y, m, 0).getDate();
  const end = monthStr + "-" + String(lastDay).padStart(2, "0");
  return { start, end };
}

// ---- تحميل مكتبات التقارير عند الطلب ----
// بتنجلب مرة وحدة بس أول ما تُفتح شاشة التقارير. لو ما في نت، بتفشل بهدوء — الجداول
// بتضل تشتغل، وبس الرسم البياني والتصدير بيتعطلوا (الكود اللي بيستخدمهم بيفحص وجودهم أصلاً).
let reportLibsPromise = null;
function loadReportLibs() {
  if (reportLibsPromise) return reportLibsPromise;
  const load = (src) => new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  reportLibsPromise = Promise.all([
    load("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"),
    load("https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js")
  ]);
  return reportLibsPromise;
}

function initReportTab() {
  document.getElementById("reportType").addEventListener("change", (e) => {
    const isTomorrow = e.target.value === "tomorrow";
    document.getElementById("entriesReportControls").classList.toggle("hidden", isTomorrow);
    document.getElementById("tomorrowReportControls").classList.toggle("hidden", !isTomorrow);
    if (isTomorrow) runTomorrowReport();
  });
  initTomorrowReportControls();

  const modeSel = document.getElementById("reportMode");
  const dayInput = document.getElementById("reportDayInput");
  const monthInput = document.getElementById("reportMonthInput");
  const startInput = document.getElementById("reportStartInput");
  const endInput = document.getElementById("reportEndInput");
  const rangeSep = document.getElementById("reportRangeSep");

  function syncBars() {
    const mode = modeSel.value;
    dayInput.classList.toggle("hidden", mode !== "day");
    monthInput.classList.toggle("hidden", mode !== "month");
    startInput.classList.toggle("hidden", mode !== "range");
    endInput.classList.toggle("hidden", mode !== "range");
    rangeSep.classList.toggle("hidden", mode !== "range");
  }
  modeSel.addEventListener("change", syncBars);
  syncBars();

  document.getElementById("reportGoBtn").addEventListener("click", runReport);
  document.getElementById("exportExcelBtn").addEventListener("click", exportExcel);
  ["reportBranchFilter", "reportCategoryFilter", "reportEmployeeFilter"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => renderReport(lastReportData));
  });
  document.getElementById("reportFlaggedOnly").addEventListener("change", () => renderReport(lastReportData));

  document.getElementById("reportDayInput").value = todayStr();
  document.getElementById("reportMonthInput").value = todayStr().slice(0, 7);
  const r = monthRange(todayStr().slice(0, 7));
  document.getElementById("reportStartInput").value = r.start;
  document.getElementById("reportEndInput").value = r.end;

  populateReportFilterOptions();
  runReport();
}

async function populateReportFilterOptions() {
  const branchSel = document.getElementById("reportBranchFilter");
  branchSel.innerHTML = `<option value="">كل الفروع</option>` + branchList().map(b => `<option value="${b}">${b}</option>`).join("");

  await Items.load();
  const cats = [...new Set(Items.current.map(it => it.category).filter(Boolean))].sort((a, b) => categoryRank(a) - categoryRank(b));
  document.getElementById("reportCategoryFilter").innerHTML = `<option value="">كل التصنيفات</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join("");

  const empData = Sync.cacheGet("employees");
  const employees = (empData && empData.value) || [];
  document.getElementById("reportEmployeeFilter").innerHTML = `<option value="">كل الموظفين</option>` + employees.map(e => `<option value="${e.name}">${e.name}</option>`).join("");
}

function currentReportRange() {
  const mode = document.getElementById("reportMode").value;
  if (mode === "day") {
    const d = document.getElementById("reportDayInput").value || todayStr();
    return { start: d, end: d };
  }
  if (mode === "month") {
    const m = document.getElementById("reportMonthInput").value || todayStr().slice(0, 7);
    return monthRange(m);
  }
  const start = document.getElementById("reportStartInput").value;
  const end = document.getElementById("reportEndInput").value;
  return { start: start || todayStr(), end: end || todayStr() };
}

async function runReport() {
  const view = document.getElementById("reportView");
  view.innerHTML = '<div class="loader">جاري تجميع التقرير…</div>';
  const { start, end } = currentReportRange();
  lastReportRange = { start, end };

  const cacheKey = "report:" + start + ":" + end;
  try {
    localStorage.removeItem("ph_cache:" + cacheKey);
    localStorage.removeItem("ph_cache:tabsense:" + start + ":" + end);
  } catch (e) {}

  const [data, salesData, tsDetails] = await Promise.all([
    Sync.get("getReport", { start, end }, cacheKey),
    Sync.get("getSalesByCategory", { start, end }, "tabsense:" + start + ":" + end),
    SupaEngine.getTabsenseDetails(start, end).catch(() => null)
  ]);

  const reportObj = data || { days: [], totals: [], flaggedCount: 0 };
  if (salesData && Array.isArray(salesData)) {
    reportObj.tabsenseSales = salesData;
  }
  reportObj.tsDetails = tsDetails;

  lastReportData = reportObj;
  renderReport(reportObj);
}

// يعيد بناء "الإجمالي حسب الصنف" من مجموعة أيام مفلترة (يطابق منطق السيرفر لكن على العميل)
function computeTotalsFromDays(days) {
  const returnThreshold = thresholdFrom("returnThresholdPct", RETURN_THRESHOLD_DEFAULT);
  const totalsMap = {};
  days.forEach(d => (d.items || []).forEach(it => {
    if (!totalsMap[it.itemId]) totalsMap[it.itemId] = { itemId: it.itemId, itemName: it.itemName, unit: it.unit, totalReceived: 0, totalReturned: 0, dayCount: 0 };
    const t = totalsMap[it.itemId];
    const rec = Number(it.received), ret = Number(it.returned);
    if (!isNaN(rec) && it.received !== "" && it.received != null) { t.totalReceived += rec; t.dayCount += 1; }
    if (!isNaN(ret) && it.returned !== "" && it.returned != null) { t.totalReturned += ret; }
  }));
  let flaggedCount = 0;
  const totals = Object.values(totalsMap).map(t => {
    t.avgDaily = t.dayCount > 0 ? t.totalReceived / t.dayCount : null;
    t.returnPct = t.totalReceived > 0 ? t.totalReturned / t.totalReceived : null;
    t.flagged = t.returnPct !== null && t.returnPct >= returnThreshold;
    if (t.flagged) flaggedCount++;
    return t;
  });
  return { totals, flaggedCount };
}

function applyReportFilters(data) {
  if (!data || !data.days) return { days: [], totals: [], flaggedCount: 0 };
  const branch = document.getElementById("reportBranchFilter").value;
  const category = document.getElementById("reportCategoryFilter").value;
  const employee = document.getElementById("reportEmployeeFilter").value;

  let days = data.days;
  if (branch) days = days.filter(d => d.branch === branch);
  if (employee) days = days.filter(d => d.meta && d.meta.employeeName === employee);

  if (category) {
    days = days.map(d => ({ ...d, items: (d.items || []).filter(it => { const item = Items.byId(it.itemId); return item && item.category === category; }) }));
  }

  const noFilters = !branch && !category && !employee;
  const { totals, flaggedCount } = noFilters ? { totals: data.totals, flaggedCount: data.flaggedCount } : computeTotalsFromDays(days);
  return { days, totals, flaggedCount };
}

function renderTabSenseSalesBlock(data) {
  const tabsenseSales = (data && data.tabsenseSales) || [];
  const juiceSales = (data && data.juiceSales) || [];

  const branchFilter = document.getElementById("reportBranchFilter").value;
  let filteredTabsense = tabsenseSales;
  let filteredJuice = juiceSales;

  if (branchFilter) {
    filteredTabsense = filteredTabsense.filter(r => r.branch === branchFilter);
    filteredJuice = filteredJuice.filter(r => r.branch === branchFilter);
  }

  if (!filteredTabsense.length && !filteredJuice.length) {
    return `<div class="empty-state">لا توجد بيانات مبيعات مسحوبة من تابسنس لهذه الفترة/الفلترة بعد.</div>`;
  }

  // 1) إجمالي حسب التصنيف
  const catTotals = {};
  filteredTabsense.forEach(r => {
    catTotals[r.category] = (catTotals[r.category] || 0) + Number(r.qty || 0);
  });

  // 2) تفاصيل حسب اليوم والفرع
  const byDateBranch = {};
  filteredTabsense.forEach(r => {
    const key = `${r.date} — ${r.branch}`;
    if (!byDateBranch[key]) byDateBranch[key] = {};
    byDateBranch[key][r.category] = (byDateBranch[key][r.category] || 0) + Number(r.qty || 0);
  });

  // 3) إجمالي العصيرات حسب المنتج
  const juiceTotals = {};
  filteredJuice.forEach(r => {
    juiceTotals[r.productName] = (juiceTotals[r.productName] || 0) + Number(r.qty || 0);
  });

  let html = `
    <div class="cat-title">📈 إجمالي كميات مبيعات تابسنس (حسب التصنيف)</div>
    <div class="dash-tile" style="margin-bottom:16px;">
  `;

  const cats = Object.keys(catTotals);
  if (cats.length) {
    cats.forEach(c => {
      html += `
        <div>
          <div class="lbl">${c}</div>
          <div class="big" style="color:var(--black);">${catTotals[c]}</div>
        </div>
      `;
    });
  } else {
    html += `<div><div class="lbl">المبيعات</div><div class="big">—</div></div>`;
  }
  html += `</div>`;

  const keys = Object.keys(byDateBranch).sort();
  if (keys.length) {
    html += `
      <div class="cat-title">تفاصيل المبيعات حسب اليوم والفرع</div>
      <div class="order-table-wrap" style="margin-bottom:20px;">
        <table class="order-table">
          <thead>
            <tr><th>اليوم والفرع</th>${cats.map(c => `<th>${c}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${keys.map(k => `
              <tr>
                <td class="cat-cell">${k}</td>
                ${cats.map(c => `<td>${byDateBranch[k][c] || 0}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  const juices = Object.keys(juiceTotals);
  if (juices.length) {
    html += `
      <div class="cat-title">🥤 إجمالي مبيعات العصيرات والمنتجات (من تابسنس)</div>
      <div class="order-table-wrap" style="margin-bottom:20px;">
        <table class="order-table">
          <thead><tr><th>اسم المنتج</th><th>الكمية المباعة</th></tr></thead>
          <tbody>
            ${juices.map(j => `
              <tr><td class="cat-cell">${j}</td><td><strong>${juiceTotals[j]}</strong></td></tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  return html;
}

function renderReport(data) {
  const view = document.getElementById("reportView");
  const reportType = document.getElementById("reportType").value;
  const filtered = applyReportFilters(data);
  lastFilteredDays = filtered.days;

  if (reportType === "tabsense") {
    view.innerHTML = renderTabSenseSalesBlock(data) + renderTabsenseDetailsBlock(data && data.tsDetails);
    return;
  }

  const hasSalesData = data && ((data.tabsenseSales && data.tabsenseSales.length) || (data.juiceSales && data.juiceSales.length));

  if (!filtered.days.length) {
    if (hasSalesData) {
      view.innerHTML = `
        <div class="summary-banner" style="background:#fff9c4;border-color:#fbc02d;color:#573b00;margin-bottom:16px;">
          <div class="lbl" style="color:#573b00;font-size:13.5px;font-weight:800;">
            💡 لم يتم تسجيل كميات استلام يومية بتاب "طلبية اليوم" لهذه الفترة بعد.<br>
            أدناه تقرير مبيعات تابسنس المسحوبة تلقائياً لهذه الفترة:
          </div>
        </div>
        ${renderTabSenseSalesBlock(data)}
      `;
    } else {
      view.innerHTML = '<div class="empty-state">ما فيه بيانات محفوظة لهذه الفترة/الفلترة بعد.<br>ابدأ بتعبئة تاب "طلبية اليوم".</div>';
    }
    return;
  }

  const flaggedOnly = document.getElementById("reportFlaggedOnly").checked;

  const summary = `
    <div class="summary-banner">
      <div class="lbl">عدد الأصناف بنسبة إرجاع مرتفعة بهذه الفترة/الفلترة (هدر محتمل)</div>
      <div class="big">${filtered.flaggedCount}</div>
    </div>
  `;

  const branchStats = branchList().map(b => {
    const branchDays = filtered.days.filter(d => d.branch === b);
    let recv = 0, ret = 0;
    branchDays.forEach(d => (d.items || []).forEach(it => {
      const r = Number(it.received), rt = Number(it.returned);
      if (!isNaN(r)) recv += r;
      if (!isNaN(rt)) ret += rt;
    }));
    return { branch: b, dayCount: branchDays.length, recv, ret };
  }).filter(s => s.dayCount > 0);

  const branchStatsBlock = branchStats.length ? `
    <div class="cat-title">ملخص حسب الفرع</div>
    ${branchStats.map(s => `
      <div class="report-card">
        <div class="top-row"><div class="name">${s.branch}</div></div>
        <div class="stat-grid">
          <div class="stat"><div class="v">${s.dayCount}</div><div class="l">أيام مسجلة</div></div>
          <div class="stat"><div class="v">${Math.round(s.recv)}</div><div class="l">إجمالي مستلم (جم)</div></div>
          <div class="stat"><div class="v">${Math.round(s.ret)}</div><div class="l">إجمالي مرتجع (جم)</div></div>
        </div>
      </div>
    `).join("")}
  ` : "";

  const dayLinks = filtered.days.map(d => {
    const links = [];
    const isUrl = (v) => typeof v === "string" && /^https?:\/\//.test(v); // الحقول هاي صارت فيها صور وقائمة الفحص، مو روابط
    if (d.meta && isUrl(d.meta.salesReportLink)) links.push(`<a href="${d.meta.salesReportLink}" target="_blank" rel="noopener">📈 مبيعات ${d.branch} — ${d.date}</a>`);
    if (d.meta && isUrl(d.meta.paymentsReportLink)) links.push(`<a href="${d.meta.paymentsReportLink}" target="_blank" rel="noopener">💳 مدفوعات ${d.branch} — ${d.date}</a>`);
    return links.join("");
  }).filter(Boolean).join("");

  const linksBlock = dayLinks ? `<div class="report-card"><div class="name">روابط تقارير الأيام</div><div class="day-links">${dayLinks}</div></div>` : "";

  const totalsCards = filtered.totals
    .filter(t => !flaggedOnly || t.flagged)
    .slice()
    .sort((a, b) => (a.itemName || "").localeCompare(b.itemName || ""))
    .map(t => `
      <div class="report-card">
        <div class="top-row">
          <div class="name">${t.itemName}</div>
          <div class="cat">${t.unit}</div>
        </div>
        <div class="stat-grid">
          <div class="stat"><div class="v">${Math.round(t.totalReceived)}</div><div class="l">إجمالي مستلم (جم)</div></div>
          <div class="stat"><div class="v">${Math.round(t.totalReturned)}</div><div class="l">إجمالي مرتجع (جم)</div></div>
          <div class="stat"><div class="v">${t.avgDaily ? Math.round(t.avgDaily) : "—"}</div><div class="l">متوسط يومي (جم)</div></div>
        </div>
        <div class="badges">
          ${t.returnPct !== null ? `<span class="badge ${t.flagged ? 'warn' : 'ok'}">${t.flagged ? '⚠ ' : ''}نسبة إرجاع ${Math.round(t.returnPct * 100)}%</span>` : ""}
        </div>
      </div>
    `).join("");

  const chartBlock = `<div class="chart-wrap"><canvas id="reportTrendChart"></canvas></div>`;

  view.innerHTML = summary + chartBlock + branchStatsBlock + linksBlock
    + '<div id="mealsSummaryBlock"></div>'
    + `<div class="cat-title">الإجمالي حسب الصنف</div>` + (totalsCards || '<div class="empty-state">ما فيه أصناف تطابق هالفلترة.</div>');

  renderTrendChart(filtered.days);
  renderMealsSummary(filtered.days);
}

// ==================== ملخص الوجبات: مستلم (من عندنا) مقابل مباع (من تابسنس) ====================

async function renderMealsSummary(days) {
  const container = document.getElementById("mealsSummaryBlock");
  if (!container) return;

  const branches = [...new Set(days.map(d => d.branch))];
  if (!branches.length) { container.innerHTML = ""; return; }
  const { start, end } = lastReportRange;

  const receivedGramsByCat = {};
  days.forEach(d => (d.items || []).forEach(it => {
    const item = Items.byId(it.itemId);
    if (!item || !isMealCategory(item.category)) return;
    const r = Number(it.received);
    if (!isNaN(r)) receivedGramsByCat[item.category] = (receivedGramsByCat[item.category] || 0) + r;
  }));

  function updateTable(salesArrays) {
    const soldByCat = {};
    let hasAnySalesData = false;
    (salesArrays || []).forEach(arr => (arr || []).forEach(r => {
      hasAnySalesData = true;
      soldByCat[r.category] = (soldByCat[r.category] || 0) + Number(r.qty || 0);
    }));

    const relevantCats = MEAL_CATEGORIES.filter(c => receivedGramsByCat[c] !== undefined || soldByCat[c] !== undefined);
    if (!relevantCats.length) { container.innerHTML = ""; return; }

    let totalReceivedMeals = 0, totalSoldMeals = 0, allHaveSales = true;
    const rows = relevantCats.map(cat => {
      const rawRec = receivedGramsByCat[cat] || 0;
      const isSandwichOrSalad = cat.includes("ساندويتش") || cat.includes("فطور") || cat.includes("سلط");
      const receivedMeals = isSandwichOrSalad ? Number(rawRec.toFixed(1)) : (Number(mealsCount(rawRec)) || 0);
      const hasSales = soldByCat[cat] !== undefined;
      const sold = hasSales ? soldByCat[cat] : 0;
      const remaining = receivedMeals - sold;
      totalReceivedMeals += receivedMeals;
      if (hasSales) totalSoldMeals += sold; else allHaveSales = false;
      return { cat, receivedMeals, sold, remaining, hasSales, matched: Math.abs(remaining) < 1 };
    });

    const totalRemaining = totalReceivedMeals - totalSoldMeals;

    container.innerHTML = `
      <div class="cat-title">ملخص الوجبات والساندويتشات (دجاج / لحم / بحري / ساندويتشات)</div>
      <div class="dash-tile" style="margin-bottom:10px;">
        <div>
          <div class="lbl">إجمالي الوجبات المستلمة</div>
          <div class="big">${totalReceivedMeals.toFixed(1)}</div>
        </div>
        <div>
          <div class="lbl">إجمالي الوجبات المباعة${allHaveSales ? "" : " (بيانات جزئية)"}</div>
          <div class="big">${allHaveSales || hasAnySalesData ? totalSoldMeals.toFixed(1) : "—"}</div>
        </div>
        <div>
          <div class="lbl">المتبقي</div>
          <div class="big">${allHaveSales ? totalRemaining.toFixed(1) : "—"}</div>
        </div>
      </div>
      <div class="order-table-wrap">
        <table class="order-table">
          <thead><tr><th>التصنيف</th><th>الوجبات المستلمة</th><th>الوجبات المباعة</th><th>المتبقي</th><th>الحالة</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr>
              <td class="cat-cell">${r.cat}</td>
              <td>${r.receivedMeals.toFixed(1)}</td>
              <td>${r.hasSales ? r.sold.toFixed(1) : "—"}</td>
              <td>${r.hasSales ? r.remaining.toFixed(1) : "—"}</td>
              <td>${!r.hasSales
                ? '<span class="badge neutral">لا يوجد بيانات مبيعات لهذا الفرع/اليوم</span>'
                : (r.matched ? '<span class="badge ok">✅ مطابق</span>' : '<span class="badge warn">⚠ فيه هدر/فرق محتمل</span>')}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // 1) رسم فوري بالبيانات المستلمة فوراً بالذاكرة (بدون أي تأخير 0ms)
  updateTable([]);

  // 2) جلب المبيعات بالخلفية وتحديث الأرقام فور الجاهزية
  const salesArrays = await Promise.all(
    branches.map(b => Sync.get("getSalesByCategory", { start, end, branch: b }, "sales:" + start + ":" + end + ":" + b, () => {
      Promise.all(branches.map(br => Sync.get("getSalesByCategory", { start, end, branch: br }, "sales:" + start + ":" + end + ":" + br))).then(updateTable);
    }))
  );
  updateTable(salesArrays);
}

let trendChartInstance = null;
let lastTrendDays = null; // نحتفظ بآخر بيانات اترسمت حتى نقدر نعيد الرسم لما توصل مكتبة Chart

// تُنادى بعد ما تخلص مكتبة Chart تحميل — بترسم الرسم البياني للتقرير المعروض أصلاً
function redrawTrendChartIfReady() {
  if (lastTrendDays && typeof Chart !== "undefined" && !trendChartInstance) renderTrendChart(lastTrendDays);
}

function renderTrendChart(days) {
  lastTrendDays = days;
  const canvas = document.getElementById("reportTrendChart");
  if (!canvas || typeof Chart === "undefined") return;

  const byDate = {};
  days.forEach(d => {
    if (!byDate[d.date]) byDate[d.date] = { received: 0, returned: 0 };
    (d.items || []).forEach(it => {
      const r = Number(it.received), rt = Number(it.returned);
      if (!isNaN(r)) byDate[d.date].received += r;
      if (!isNaN(rt)) byDate[d.date].returned += rt;
    });
  });
  const dates = Object.keys(byDate).sort();

  if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }
  trendChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        { label: "مستلم (جم)", data: dates.map(d => byDate[d].received), borderColor: "#000000", backgroundColor: "rgba(0,0,0,.08)", tension: .3, fill: true },
        { label: "مرتجع (جم)", data: dates.map(d => byDate[d].returned), borderColor: "#ff5151", backgroundColor: "rgba(255,81,81,.1)", tension: .3, fill: true }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { font: { family: "Tajawal" } } } },
      scales: {
        x: { ticks: { font: { family: "Tajawal" }, maxRotation: 0 } },
        y: { ticks: { font: { family: "Tajawal" } }, beginAtZero: true }
      }
    }
  });
}

// ==================== أدوات مشتركة لتصدير Excel (ExcelJS — بتدعم تلوين وارتفاع صفوف حقيقي) ====================

const EXCEL_ROW_HEIGHT = 22;
const EXCEL_HEADER_FILL = "FFF7DC4E"; // أصفر الهوية
const EXCEL_HEADER_FONT = { bold: true, color: { argb: "FF000000" } };

function styleExcelSheet(sheet, colWidths) {
  sheet.views = [{ rightToLeft: true }];
  if (colWidths) sheet.columns = colWidths.map(w => ({ width: w }));
  const headerRow = sheet.getRow(1);
  headerRow.height = EXCEL_ROW_HEIGHT;
  headerRow.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_HEADER_FILL } };
    cell.font = EXCEL_HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  sheet.eachRow(row => {
    row.height = EXCEL_ROW_HEIGHT;
    row.eachCell(cell => { cell.alignment = { horizontal: "center", vertical: "middle" }; });
  });
}

async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function exportExcel() {
  if (!lastFilteredDays.length) {
    showToast("ما فيه بيانات للتصدير بهذه الفترة/الفلترة");
    return;
  }
  await loadReportLibs();
  if (typeof ExcelJS === "undefined") {
    showToast("مكتبة Excel ما تحمّلت — تأكد من الاتصال بالنت");
    return;
  }

  const workbook = new ExcelJS.Workbook();

  const detailSheet = workbook.addWorksheet("التفاصيل اليومية");
  detailSheet.addRow(["التاريخ", "الفرع", "الموظف", "تم الاستلام", "الصنف", "الوحدة", "اسم الطبخة", "المستلم", "المرتجع", "ملاحظات"]);
  lastFilteredDays.forEach(d => {
    (d.items || []).forEach(it => {
      detailSheet.addRow([
        d.date, d.branch, d.meta ? d.meta.employeeName : "",
        it.confirmed === true || it.confirmed === "TRUE" ? "نعم" : "لا",
        it.itemName, it.unit, it.cookName || "", it.received, it.returned, it.notes || ""
      ]);
    });
  });
  styleExcelSheet(detailSheet, [12, 14, 14, 12, 20, 10, 16, 12, 12, 22]);

  const { totals } = computeTotalsFromDays(lastFilteredDays);
  const totalsSheet = workbook.addWorksheet("الإجمالي");
  totalsSheet.addRow(["الصنف", "الوحدة", "إجمالي مستلم", "إجمالي مرتجع", "متوسط يومي", "نسبة إرجاع %"]);
  totals.forEach(t => {
    totalsSheet.addRow([
      t.itemName, t.unit, Math.round(t.totalReceived), Math.round(t.totalReturned),
      t.avgDaily ? Math.round(t.avgDaily) : "", t.returnPct !== null ? Math.round(t.returnPct * 100) : ""
    ]);
  });
  styleExcelSheet(totalsSheet, [20, 10, 14, 14, 14, 14]);

  await downloadWorkbook(workbook, `تقرير_${lastReportRange.start}_${lastReportRange.end}.xlsx`);
}

// ==================== طلبية الغد (للشيف) — نفس "نموذج طلب الاكل" بالضبط ====================
// ورقة لكل فرع: اليوم / التاريخ / الفرع، وتحتها: الفئة | تسليم | اسم الصنف | حجم السفنديش | العدد | المستلمة | المتبقية | ملاحظات
// نفس عرض الأعمدة وارتفاع الصفوف والخطوط تبع ملف الإكسل، وتطلع Excel أو PDF جاهز للطباعة وينرسل واتساب.

let lastTomorrowReportSheets = []; // [{ branch, rows: [{category, name, size, qty, notes}] }]
let lastTomorrowReportDate = "";

// مقاسات ملف الإكسل الأصلي (عرض الأعمدة بوحدة الإكسل، ارتفاع الصفوف بالنقطة)
const CHEF_SHEET = {
  cols: [15.2, 15.2, 37.93, 23.68, 22.73, 24.35, 23.95, 70.63],
  headers: ["الفئة", "تسليم", "اسم الصنف", "حجم السفنديش", "العدد", "الكمية المستلمة", "الكمية المتبقية", "ملاحظات"],
  titleH: 69.75, headH: 92.25, rowH: 51.75,
  titleFont: 47, bodyFont: 26, boxFont: 42,
  headFill: "BFBFBF", border: "505050"
};
const chefColPx = (w) => Math.trunc(w * 7 + 5);  // عرض عمود الإكسل ← بكسل
const chefPtPx = (pt) => Math.round(pt * 4 / 3); // نقطة ← بكسل

function chefDayName(date) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "long", timeZone: "UTC" });
}
function chefDateText(date) { const [y, m, d] = date.split("-"); return `${d}-${m}-${y}`; }

// "دجاج الشيف 1" + "دجاج بيكانت" ← "دجاج الشيف (بيكانت)"، وبدون اسم ← "دجاج الشيف……" (متل النموذج)
function chefReportName(it, cookName) {
  const base = String(it.name || "").trim();
  if (!/الشيف/.test(base)) return base;
  const plain = base.replace(/\s*\d+\s*$/, "");
  const dish = String(cookName || "").trim().replace(new RegExp("^" + String(it.category || "").trim() + "\\s+"), "");
  return dish ? `${plain} (${dish})` : `${plain}……`;
}

function initTomorrowReportControls() {
  document.getElementById("tomorrowReportBranch").innerHTML =
    `<option value="">كل الفروع</option>` + branchList().map(b => `<option value="${b}">${b}</option>`).join("");
  document.getElementById("tomorrowReportDate").value = addDaysStr(todayStr(), 1);
  document.getElementById("tomorrowReportGoBtn").addEventListener("click", runTomorrowReport);
  document.getElementById("tomorrowReportExportBtn").addEventListener("click", exportTomorrowReportExcel);
  document.getElementById("tomorrowReportPdfBtn").addEventListener("click", shareTomorrowReportPdf);
}

async function runTomorrowReport() {
  const view = document.getElementById("tomorrowReportView");
  view.innerHTML = '<div class="loader">جاري تجميع طلبية الغد…</div>';
  await Items.load();

  const date = document.getElementById("tomorrowReportDate").value || addDaysStr(todayStr(), 1);
  const branchFilter = document.getElementById("tomorrowReportBranch").value;
  const branches = branchFilter ? [branchFilter] : branchList();
  lastTomorrowReportDate = date;

  const perBranch = await Promise.all(branches.map(b =>
    Sync.get("getTomorrowOrder", { date, branch: b }, "tomorrow:" + date + ":" + b)
  ));
  const order = new Map((Items.current || []).map((it, i) => [it.id, i]));
  lastTomorrowReportSheets = branches.map((branch, i) => {
    const rows = (perBranch[i] || [])
      .filter(e => e.qty !== "" && e.qty != null && Number(e.qty) > 0)
      .map(e => {
        const it = Items.byId(e.itemId) || { name: e.itemName, category: "-", unit: e.unit, sortOrder: 999 };
        return {
          category: it.category || "-", name: chefReportName(it, e.cookName),
          size: String(it.unit || e.unit || ""), qty: Number(e.qty), notes: e.notes || "",
          rank: categoryRank(it.category), sort: order.has(e.itemId) ? order.get(e.itemId) : 9999
        };
      })
      .sort((a, b) => a.rank - b.rank || a.sort - b.sort);
    return { branch, rows };
  }).filter(s => s.rows.length);

  renderTomorrowReport();
}

// ورقة HTML بنفس مقاسات الإكسل بالبكسل (تنعرض مصغّرة بالشاشة، وتتصوّر للـ PDF بحجمها الحقيقي)
function chefSheetHtml(sheet, date) {
  const S = CHEF_SHEET;
  const colW = S.cols.map(chefColPx);
  const totalW = colW.reduce((a, b) => a + b, 0);
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const bd = `1px solid #${S.border}`;
  const cell = (txt, extra = "") => `<td style="border:${bd};${extra}">${esc(txt)}</td>`;
  // تجميع الفئات عشان خلية الفئة تندمج عمودياً
  const groups = [];
  sheet.rows.forEach(r => { const g = groups[groups.length - 1]; if (g && g.category === r.category) g.rows.push(r); else groups.push({ category: r.category, rows: [r] }); });
  const body = groups.map(g => g.rows.map((r, i) => `<tr style="height:${chefPtPx(S.rowH)}px">
      ${i === 0 ? `<td rowspan="${g.rows.length}" style="border:${bd}">${esc(g.category)}</td>` : ""}
      ${cell("□", `font-size:${chefPtPx(S.boxFont)}px`)}${cell(r.name)}${cell(r.size)}${cell(r.qty)}${cell("")}${cell("")}${cell(r.notes)}
    </tr>`).join("")).join("");
  return `<div class="chef-sheet" style="width:${totalW}px">
    <table style="width:${totalW}px">
      <colgroup>${colW.map(w => `<col style="width:${w}px">`).join("")}</colgroup>
      <tr class="chef-title" style="height:${chefPtPx(S.titleH)}px">
        <td colspan="2" style="text-align:left">اليوم:</td><td style="text-align:right">${esc(chefDayName(date))}</td>
        <td style="text-align:right">التاريخ:</td><td colspan="2" style="text-align:right">${esc(chefDateText(date))}</td>
        <td colspan="2">فرع ${esc(sheet.branch)}</td>
      </tr>
      <tr class="chef-head" style="height:${chefPtPx(S.headH)}px">${S.headers.map(h => cell(h, `background:#${S.headFill}`)).join("")}</tr>
      ${body}
    </table>
  </div>`;
}

function renderTomorrowReport() {
  const view = document.getElementById("tomorrowReportView");
  if (!lastTomorrowReportSheets.length) {
    view.innerHTML = '<div class="empty-state">ما فيه طلبية محفوظة لهذا اليوم/الفرع بعد.<br>ابدأ بتعبئة تاب "طلبية الغد".</div>';
    return;
  }
  view.innerHTML = lastTomorrowReportSheets.map(s => `<div class="chef-sheet-frame">${chefSheetHtml(s, lastTomorrowReportDate)}</div>`).join("");
  fitChefSheets();
}
// النص الطويل يصغر لين يدخل بالخلية (متل "تصغير للاحتواء" بالإكسل) بدل ما ينكسر على سطرين
function fitChefCells(sheetEl) {
  sheetEl.querySelectorAll("td").forEach(td => {
    if (!td.textContent.trim()) return;
    let size = parseFloat(getComputedStyle(td).fontSize);
    while ((td.scrollWidth > td.clientWidth + 1 || td.scrollHeight > td.clientHeight + 1) && size > 14) {
      size -= 1;
      td.style.fontSize = size + "px";
    }
  });
}

// الورقة عرضها ~1600 بكسل: نصغّرها لعرض الشاشة
function fitChefSheets() {
  document.querySelectorAll("#tomorrowReportView .chef-sheet-frame").forEach(frame => {
    const sheet = frame.firstElementChild;
    sheet.style.transform = "";
    fitChefCells(sheet);
    const s = Math.min(1, frame.clientWidth / sheet.offsetWidth);
    sheet.style.transform = `scale(${s})`;
    frame.style.height = Math.ceil(sheet.offsetHeight * s) + "px";
  });
}
window.addEventListener("resize", () => { if (lastTomorrowReportSheets.length) fitChefSheets(); });

async function exportTomorrowReportExcel() {
  if (!lastTomorrowReportSheets.length) { showToast("اضغط «عرض» أول"); return; }
  await loadReportLibs();
  if (typeof ExcelJS === "undefined") { showToast("مكتبة Excel ما تحمّلت — تأكد من الاتصال بالنت"); return; }
  const S = CHEF_SHEET;
  const workbook = new ExcelJS.Workbook();
  const thin = { style: "thin", color: { argb: "FF" + S.border } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  const font = (sz) => ({ name: "Aptos Narrow", size: sz, color: { argb: "FF000000" } });
  const center = { horizontal: "center", vertical: "middle", wrapText: true, readingOrder: "rtl" };
  lastTomorrowReportSheets.forEach(sheetData => {
    const ws = workbook.addWorksheet(String(sheetData.branch).slice(0, 31));
    ws.views = [{ rightToLeft: true }];
    ws.columns = S.cols.map(w => ({ width: w }));
    ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } };
    // الصف 1: اليوم / التاريخ / الفرع
    ws.mergeCells("A1:B1"); ws.mergeCells("E1:F1"); ws.mergeCells("G1:H1");
    const [y, m, d] = lastTomorrowReportDate.split("-").map(Number);
    const title = [["A1", "اليوم:", "left"], ["C1", chefDayName(lastTomorrowReportDate), "right"], ["D1", "التاريخ:", "right"],
      ["E1", new Date(Date.UTC(y, m - 1, d)), "right"], ["G1", "فرع " + sheetData.branch, "center"]];
    title.forEach(([a, v, h]) => { const c = ws.getCell(a); c.value = v; c.font = font(S.titleFont); c.alignment = { horizontal: h, vertical: "middle" }; });
    ws.getCell("E1").numFmt = "dd-mm-yyyy";
    ws.getRow(1).height = S.titleH;
    // الصف 2: العناوين
    const head = ws.getRow(2);
    S.headers.forEach((h, i) => {
      const c = head.getCell(i + 1);
      c.value = h; c.font = font(S.bodyFont); c.alignment = center; c.border = border;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + S.headFill } };
    });
    head.height = S.headH;
    // الأصناف
    let r = 3;
    const groups = [];
    sheetData.rows.forEach(x => { const g = groups[groups.length - 1]; if (g && g.category === x.category) g.rows.push(x); else groups.push({ category: x.category, rows: [x] }); });
    groups.forEach(g => {
      const start = r;
      g.rows.forEach((x, i) => {
        const row = ws.getRow(r);
        [i === 0 ? g.category : null, "□", x.name, x.size, x.qty, null, null, x.notes || null].forEach((v, ci) => {
          const c = row.getCell(ci + 1);
          if (v !== null) c.value = v;
          c.font = font(ci === 1 ? S.boxFont : S.bodyFont); c.alignment = center; c.border = border;
        });
        row.getCell(4).numFmt = "@";
        row.height = S.rowH;
        r++;
      });
      if (g.rows.length > 1) ws.mergeCells(start, 1, r - 1, 1);
    });
  });
  const suffix = lastTomorrowReportSheets.length === 1 ? "_" + lastTomorrowReportSheets[0].branch : "";
  await downloadWorkbook(workbook, `طلبية_الغد_${lastTomorrowReportDate}${suffix}.xlsx`);
}

// ---- PDF جاهز للطباعة: صفحة A4 لكل فرع، وينرسل واتساب من زر المشاركة ----
function loadPdfLibs() {
  const load = (src) => new Promise((resolve) => {
    const s = document.createElement("script"); s.src = src;
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return Promise.all([
    window.html2canvas ? true : load("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"),
    window.jspdf ? true : load("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js")
  ]);
}

async function buildTomorrowReportPdf() {
  await loadPdfLibs();
  if (!window.html2canvas || !window.jspdf) throw new Error("مكتبة PDF ما تحمّلت — تأكد من النت");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageW = 210, pageH = 297;
  const mX = 0.7 * 25.4, mY = 0.75 * 25.4; // نفس هوامش الإكسل
  // نرسم الورقة بحجمها الحقيقي خارج الشاشة ونصوّرها
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-99999px;top:0;background:#fff;";
  document.body.appendChild(stage);
  try {
    for (let i = 0; i < lastTomorrowReportSheets.length; i++) {
      stage.innerHTML = chefSheetHtml(lastTomorrowReportSheets[i], lastTomorrowReportDate);
      const el = stage.firstElementChild;
      fitChefCells(el);
      const canvas = await html2canvas(el, { scale: 1.5, backgroundColor: "#ffffff", logging: false });
      const img = canvas.toDataURL("image/jpeg", 0.92);
      const maxW = pageW - 2 * mX, maxH = pageH - 2 * mY;
      const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
      const w = canvas.width * ratio, h = canvas.height * ratio;
      if (i) pdf.addPage();
      pdf.addImage(img, "JPEG", (pageW - w) / 2, mY, w, h);
    }
  } finally { stage.remove(); }
  return pdf.output("blob");
}

async function shareTomorrowReportPdf() {
  if (!lastTomorrowReportSheets.length) { showToast("اضغط «عرض» أول"); return; }
  const btn = document.getElementById("tomorrowReportPdfBtn");
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ جاري تجهيز PDF…";
  try {
    const blob = await buildTomorrowReportPdf();
    const suffix = lastTomorrowReportSheets.length === 1 ? "_" + lastTomorrowReportSheets[0].branch : "";
    const name = `طلبية_${chefDayName(lastTomorrowReportDate)}_${lastTomorrowReportDate}${suffix}.pdf`.replace(/\s+/g, "_");
    const file = new File([blob], name, { type: "application/pdf" });
    // بالجوال: نافذة المشاركة (واتساب ← الشيف). بالكمبيوتر: ينزل الملف
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "طلبية الغد", text: `طلبية ${chefDayName(lastTomorrowReportDate)} ${chefDateText(lastTomorrowReportDate)}` });
        return;
      } catch (e) { if (e && e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast("✅ نزل الـ PDF — أرسله للشيف بالواتساب");
  } catch (e) {
    showToast("⚠ " + (e.message || e));
  } finally { btn.disabled = false; btn.textContent = label; }
}


// ---- تفاصيل تابسنس: الكاش ومدى لكل يوم، الإضافات، ومبيعات كل منتج ----
function renderTabsenseDetailsBlock(d) {
  if (!d) return "";
  const branch = document.getElementById("reportBranchFilter").value;
  const inBranch = (r) => !branch || r.branch === branch;
  const fmt = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const dayLabel = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString(phLocale(), { weekday: "short", day: "numeric", month: "numeric" });
  let html = "";

  // 1) الكاش ومدى لكل يوم (للمالك)
  const pays = (d.payments || []).filter(inBranch);
  if (pays.length) {
    const byDay = {};
    pays.forEach(p => {
      const row = byDay[p.date] || (byDay[p.date] = { cash: 0, card: 0 });
      if (CASH_CHANNEL.test(p.channel)) row.cash += Number(p.amount || 0);
      else row.card += Number(p.amount || 0);
    });
    const days = Object.keys(byDay).sort();
    const tot = days.reduce((a, k) => ({ cash: a.cash + byDay[k].cash, card: a.card + byDay[k].card }), { cash: 0, card: 0 });
    html += `
      <div class="cat-title">💳 المبيعات حسب طريقة الدفع (ر.س)</div>
      <div class="order-table-wrap" style="margin-bottom:20px;">
        <table class="order-table">
          <thead><tr><th>اليوم</th><th>كاش</th><th>شبكة/مدى</th><th>المجموع</th></tr></thead>
          <tbody>
            ${days.map(k => `<tr><td class="cat-cell">${dayLabel(k)}</td><td>${fmt(byDay[k].cash)}</td><td>${fmt(byDay[k].card)}</td><td><strong>${fmt(byDay[k].cash + byDay[k].card)}</strong></td></tr>`).join("")}
            <tr class="total-row"><td class="cat-cell"><strong>المجموع (${days.length} يوم)</strong></td><td><strong>${fmt(tot.cash)}</strong></td><td><strong>${fmt(tot.card)}</strong></td><td><strong>${fmt(tot.cash + tot.card)}</strong></td></tr>
          </tbody>
        </table>
      </div>`;
  }

  // 2) الإضافات (+50 جم …)
  const mods = (d.modifiers || []).filter(inBranch);
  if (mods.length) {
    const byName = {};
    mods.forEach(m => { const k = m.option || m.modifier; byName[k] = (byName[k] || 0) + Number(m.qty || 0); });
    const names = Object.keys(byName).sort((a, b) => byName[b] - byName[a]);
    const grams = (name) => { const m = String(name).match(/(\d+)/); if (!m) return null; const n = Number(m[1]); return /^\s*\+/.test(name) ? n : (n > MEAL_WEIGHT_G ? n - MEAL_WEIGHT_G : null); };
    html += `
      <div class="cat-title">➕ الإضافات (محسوبة ضمن استهلاك التصنيف)</div>
      <div class="order-table-wrap" style="margin-bottom:20px;">
        <table class="order-table">
          <thead><tr><th>الإضافة</th><th>العدد</th><th>الوزن الزيادة</th></tr></thead>
          <tbody>
            ${names.map(n => { const g = grams(n); return `<tr><td class="cat-cell">${n}</td><td><strong>${fmt(byName[n])}</strong></td><td>${g ? fmt(g * byName[n]) + " جم" : "—"}</td></tr>`; }).join("")}
          </tbody>
        </table>
      </div>`;
  }

  // 3) مبيعات كل منتج
  const prods = (d.products || []).filter(inBranch);
  if (prods.length) {
    const byProd = {};
    prods.forEach(p => {
      const r = byProd[p.product] || (byProd[p.product] = { qty: 0, days: new Set() });
      r.qty += Number(p.qty || 0); r.days.add(p.date);
    });
    const names = Object.keys(byProd).sort((a, b) => byProd[b].qty - byProd[a].qty);
    const totalDays = new Set(prods.map(p => p.date)).size || 1;
    html += `
      <div class="cat-title">🧾 مبيعات كل منتج (${names.length} منتج · ${totalDays} يوم)</div>
      <input type="search" class="ts-prod-search" placeholder="🔎 دوّر على منتج…" oninput="filterTsProducts(this.value)">
      <div class="order-table-wrap" style="margin-bottom:20px;">
        <table class="order-table" id="tsProductsTable">
          <thead><tr><th>المنتج</th><th>الكمية</th><th>متوسط/يوم</th></tr></thead>
          <tbody>
            ${names.map(n => `<tr data-name="${n.replace(/"/g, "&quot;")}"><td class="cat-cell">${n}</td><td><strong>${fmt(byProd[n].qty)}</strong></td><td>${fmt(byProd[n].qty / totalDays)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }
  return html;
}

function filterTsProducts(q) {
  const needle = String(q || "").trim();
  document.querySelectorAll("#tsProductsTable tbody tr").forEach(tr => {
    tr.style.display = !needle || tr.dataset.name.includes(needle) ? "" : "none";
  });
}
