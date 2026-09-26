// ==================== التنقل بين التابات + الإقلاع + تسجيل الدخول ====================

const TAB_ROLE_ACCESS = {
  dashboard: ["owner", "manager", "chef", "branch_staff", "employee"],
  help: ["owner", "manager", "chef", "branch_staff", "employee"],
  branches: ["owner", "manager", "chef"],
  opening: ["owner", "manager", "chef", "branch_staff", "employee"],
  closing: ["owner", "manager", "chef", "branch_staff", "employee"],
  inspection: ["owner"], // المراقبة الميدانية للمالك بس
  receiving: ["owner", "manager", "chef", "branch_staff", "employee"],
  remaining: ["owner", "manager", "chef", "branch_staff", "employee"],
  custody: ["owner", "manager", "branch_staff", "employee"],
  tomorrow: ["owner", "manager", "chef"],
  // العصيرات وقائمة الفحص ما حدا عم يعبّيهم، فمخفيين عن موظفي الفروع لحتى القائمة تضل بسيطة
  juices: ["owner", "manager"],
  checklist: ["owner", "manager", "chef"],
  waste: ["owner", "manager", "chef"],
  report: ["owner"],
  items: ["owner"],
  users: ["owner"],
  audit: ["owner"],
  settings: ["owner"]
};

function tabAllowed(tab) {
  const role = Auth.role();
  return !!(role && TAB_ROLE_ACCESS[tab] && TAB_ROLE_ACCESS[tab].includes(role));
}

function openMobileSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (sidebar) sidebar.classList.add("mobile-open");
  if (backdrop) backdrop.classList.add("active");
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (sidebar) sidebar.classList.remove("mobile-open");
  if (backdrop) backdrop.classList.remove("active");
}

function setActiveSubTab(subTab) {
  setActiveTab(subTab);
}

function setActiveTab(tab) {
  if (!tabAllowed(tab)) tab = "dashboard";
  lastActiveTab = tab;
  closeMobileSidebar();

  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));

  const views = ["dashboardView", "helpView", "branchesView", "openingView", "closingView", "inspectionView", "receivingView", "remainingView", "custodyView", "tomorrowView", "juicesView", "checklistView", "wasteView", "reportContainer", "itemsView", "usersView", "auditView", "settingsView"];
  views.forEach(vId => {
    const el = document.getElementById(vId);
    if (el) el.classList.add("hidden");
  });

  const activeViewId = tab === "report" ? "reportContainer" : (tab + "View");
  const activeEl = document.getElementById(activeViewId);
  if (activeEl) activeEl.classList.remove("hidden");

  const recDateBar = document.getElementById("receivingDateBar");
  const remDateBar = document.getElementById("remainingDateBar");
  if (recDateBar) recDateBar.classList.toggle("hidden", tab !== "receiving");
  if (remDateBar) remDateBar.classList.toggle("hidden", tab !== "remaining");

  document.getElementById("custodyDateBar").classList.toggle("hidden", tab !== "custody");
  document.getElementById("openingDateBar").classList.toggle("hidden", tab !== "opening");
  document.getElementById("tomorrowDateBar").classList.toggle("hidden", tab !== "tomorrow");
  document.getElementById("juiceDateBar").classList.toggle("hidden", tab !== "juices");
  document.getElementById("checklistDateBar").classList.toggle("hidden", tab !== "checklist");

  const saveBarReceiving = document.getElementById("saveBarReceiving");
  const saveBarRemaining = document.getElementById("saveBarRemaining");
  if (saveBarReceiving) saveBarReceiving.classList.toggle("hidden", tab !== "receiving" || Auth.isViewOnlyEntry());
  if (saveBarRemaining) saveBarRemaining.classList.toggle("hidden", tab !== "remaining" || Auth.isViewOnlyEntry());

  document.getElementById("saveBarTomorrow").classList.toggle("hidden", tab !== "tomorrow" || Auth.isViewOnlyTomorrow());
  document.getElementById("saveBarJuices").classList.toggle("hidden", tab !== "juices" || Auth.isViewOnlyEntry());
  document.getElementById("saveBarChecklist").classList.toggle("hidden", tab !== "checklist" || Auth.isViewOnlyEntry());

  // تبويبات الشاشات المدموجة (قائمة الفحص جوّا التوثيق، إغلاق الفرع جوّا العهدة)
  document.querySelectorAll(".sub-tabs").forEach(bar => {
    const btns = Array.from(bar.querySelectorAll("[data-go]")).filter(b => tabAllowed(b.dataset.go));
    bar.querySelectorAll("[data-go]").forEach(b => { b.classList.toggle("hidden", !tabAllowed(b.dataset.go)); b.classList.toggle("active", b.dataset.go === tab); });
    bar.classList.toggle("hidden", !btns.some(b => b.dataset.go === tab) || btns.length < 2);
  });

  if (tab === "dashboard") { renderDashboard(); }
  if (tab === "help") { renderHelpView(); window.scrollTo(0, 0); }
  if (tab === "branches") { renderBranchesHubView(); }
  if (tab === "opening") { renderOpeningView(); }
  if (tab === "closing") { renderClosingView(); }
  if (tab === "inspection") { renderInspectionGalleryView(); }
  if (tab === "receiving") { 
    if (currentRemainingDate && currentReceivingDate !== currentRemainingDate) {
      currentReceivingDate = currentRemainingDate;
      const recDateInp = document.getElementById("receivingDateInput");
      if (recDateInp) recDateInp.value = currentReceivingDate;
    }
    loadReceivingData(currentReceivingDate, Branch.get() || currentReceivingBranch); 
  }
  if (tab === "remaining") { 
    if (typeof flushReceivingSave === "function") flushReceivingSave();
    if (currentReceivingDate && currentRemainingDate !== currentReceivingDate) {
      currentRemainingDate = currentReceivingDate;
      const remDateInp = document.getElementById("remainingDateInput");
      if (remDateInp) remDateInp.value = currentRemainingDate;
    }
    loadRemainingData(currentRemainingDate, Branch.get() || currentRemainingBranch); 
  }
  if (tab === "custody") { loadCustody(currentCustodyDate, Branch.get()); }
  if (tab === "waste") { loadWasteData(currentWasteDate, currentWasteBranch); }
  if (tab === "users") { renderUsersView(); }
  if (tab === "audit") { renderAuditView(); }
  if (tab === "checklist") { renderChecklistView(); }
  if (tab === "report") {
    loadReportLibs().then(() => {
      if (!document.getElementById("reportContainer").classList.contains("hidden")) redrawTrendChartIfReady();
    });
  }
  if (tab === "juices" && currentJuiceBranch !== Branch.get()) { loadJuiceDay(currentJuiceDate); }
  if (tab === "items") { Items.load().then(renderItemsAdminView); }
  if (tab === "settings") { Promise.all([loadSettings(), Items.load()]).then(renderSettingsView); }
}

document.querySelectorAll(".sub-tabs [data-go]").forEach(btn => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.go));
});

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("mobileToggleBtn")?.addEventListener("click", openMobileSidebar);
  document.getElementById("sidebarCloseBtn")?.addEventListener("click", closeMobileSidebar);
  document.getElementById("sidebarBackdrop")?.addEventListener("click", closeMobileSidebar);
});

// شاشات مخفية من القائمة (الكود موجود — لترجيع أي وحدة شيلها من هون)
// المستخدمون والصلاحيات صارت زر جوّا الإعدادات
const NAV_HIDDEN_TABS = ["branches", "items", "users", "waste", "checklist", "closing"]; // الهدر صار جوّا تقرير المتبقي (زر 🗑 بكل صنف)

function applyRoleUiGating() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("hidden", !tabAllowed(btn.dataset.tab) || NAV_HIDDEN_TABS.includes(btn.dataset.tab));
  });

  // إخفاء عناوين الأقسام الفارغة بالقائمة الجانبية تلقائياً
  document.querySelectorAll(".nav-group-title").forEach(title => {
    let next = title.nextElementSibling;
    let hasVisibleChild = false;
    while (next && !next.classList.contains("nav-group-title") && !next.classList.contains("sidebar-user")) {
      if (next.classList.contains("tab-btn") && !next.classList.contains("hidden")) {
        hasVisibleChild = true;
        break;
      }
      next = next.nextElementSibling;
    }
    title.style.display = hasVisibleChild ? "" : "none";
  });

  const emp = Auth.getEmployee();
  const ROSTER_NAMES = {
    emp_1: "أ.يزيد",
    emp_2: "حسن",
    emp_3: "الشيف عصام",
    emp_4: "أبو يونس",
    emp_5: "العامودي",
    emp_6: "محمد البلول",
    emp_7: "غالب"
  };
  const displayName = emp ? (ROSTER_NAMES[emp.id] || (emp.name && !emp.name.includes("?") ? emp.name : "موظف")) : "";
  document.getElementById("userBarName").textContent = displayName;
  const roleEl = document.getElementById("userBarRole");
  if (roleEl) roleEl.textContent = "";
  document.getElementById("userBar").classList.remove("hidden");
}

// ---- شارة حالة المزامنة ----
function updateSyncBadge({ pending, readError }) {
  const el = document.getElementById("syncBadge");
  if (!API_URL) {
    el.textContent = "⚙ الباك اند غير مربوط بعد";
    el.classList.remove("ok");
    return;
  }
  el.classList.toggle("error", !!readError);
  if (readError) {
    el.textContent = "⚠ تعذّر الاتصال بالسيرفر";
    el.classList.remove("ok", "pending");
  } else if (pending > 0) {
    el.textContent = `🔄 ${pending} بانتظار المزامنة`;
    el.classList.remove("ok");
    el.classList.add("pending");
  } else {
    el.textContent = "";
    el.classList.add("ok");
    el.classList.remove("pending");
  }
  // كل شي محفوظ؟ منخفي الشارة. بتطلع بس إذا في شي ناطر حفظ أو في مشكلة اتصال
  el.classList.toggle("hidden", !readError && !(pending > 0));
}
Sync.onStatusChange(updateSyncBadge);
// ضغطة عادية: تدفع الحفظ المعلّق. ضغطة مطوّلة: تمسح الكاش وتعيد التحميل من السيرفر —
// لازمة لما تتغيّر البيانات على الشيت من برا التطبيق، لأن القراءة cache-first فبيضل
// الجهاز عارض نسخته القديمة بلا أي مؤشر إنها بطلت صحيحة.
(function wireSyncBadge() {
  const badge = document.getElementById("syncBadge");
  let held = false, timer = null;

  const startHold = () => {
    held = false;
    timer = setTimeout(async () => {
      held = true;
      if (!(await phConfirm("تحديث كامل للتطبيق من السيرفر؟\nسيتم مسح الكاش وتحميل أحدث إصدار."))) return;
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        } catch(e) {}
      }
      const n = Sync.clearReadCache();
      showToast("جاري التحديث لأحدث نسخة…");
      setTimeout(() => location.reload(true), 600);
    }, 900);
  };
  const endHold = () => { clearTimeout(timer); };

  badge.addEventListener("mousedown", startHold);
  badge.addEventListener("touchstart", startHold, { passive: true });
  ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach(ev => badge.addEventListener(ev, endHold));

  badge.addEventListener("click", () => { if (!held) Sync.flushQueue(); });
})();

// ---- بانر أوفلاين ----
function updateOfflineBanner() {
  document.getElementById("offlineBanner").classList.toggle("hidden", navigator.onLine);
}
window.addEventListener("online", updateOfflineBanner);
window.addEventListener("offline", updateOfflineBanner);

// ---- تسجيل Service Worker و Manifest (فقط عند النشر على سيرفر HTTP/HTTPS لتجنب أخطاء CORS عند الفتح المباشر) ----
if (location.protocol !== "file:") {
  const manifestLink = document.createElement("link");
  manifestLink.rel = "manifest";
  manifestLink.href = "manifest.json";
  document.head.appendChild(manifestLink);
}

// ---- تسجيل الدخول ----
function showLoginView() {
  document.getElementById("loginView").classList.remove("hidden");
  document.querySelector("header").classList.add("hidden");
  document.querySelector("main").classList.add("hidden");
}
function hideLoginView() {
  document.getElementById("loginView").classList.add("hidden");
  document.querySelector("header").classList.remove("hidden");
  document.querySelector("main").classList.remove("hidden");
}

function initChecklistTab() {
  const el = document.getElementById("checklistDateInput");
  if (el) {
    el.value = currentChecklistDate;
    el.addEventListener("change", (e) => {
      currentChecklistDate = e.target.value;
      renderChecklistView();
    });
  }
}

function initReceivingTab() {
  initReceivingModule();
  const dateEl = document.getElementById("receivingDateInput");
  if (dateEl) {
    dateEl.value = currentReceivingDate;
    dateEl.addEventListener("change", () => {
      currentReceivingDate = dateEl.value;
      currentRemainingDate = dateEl.value;
      const remDateEl = document.getElementById("remainingDateInput");
      if (remDateEl) remDateEl.value = dateEl.value;
      loadReceivingData(currentReceivingDate, currentReceivingBranch);
    });
  }
}

function initRemainingTab() {
  initRemainingModule();
  const dateEl = document.getElementById("remainingDateInput");
  if (dateEl) {
    dateEl.value = currentRemainingDate;
    dateEl.addEventListener("change", () => {
      currentRemainingDate = dateEl.value;
      currentReceivingDate = dateEl.value;
      const recDateEl = document.getElementById("receivingDateInput");
      if (recDateEl) recDateEl.value = dateEl.value;
      loadRemainingData(currentRemainingDate, currentRemainingBranch);
    });
  }
}

// أزرار التنقل السريع بين الأيام جنب التاريخ: بتغيّر قيمة الحقل وبتطلق نفس حدث التغيير
// اللي بيستعمله كل تبويب، فالتحميل بيصير بنفس الطريقة. "التالي" ما بيتعدّى اليوم.
function initDayJumpButtons() {
  document.querySelectorAll(".datebar [data-day]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = btn.closest(".datebar").querySelector('input[type="date"]');
      if (!input) return;
      const today = todayStr();
      const current = input.value || today;
      let next = current;
      if (btn.dataset.day === "today") next = today;
      else if (btn.dataset.day === "yesterday") next = addDaysStr(today, -1);
      else if (btn.dataset.day === "prev") next = addDaysStr(current, -1);
      else if (btn.dataset.day === "next") next = current < today ? addDaysStr(current, 1) : today;
      if (next === input.value) return;
      input.value = next;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

// ---- الرجوع لنفس المكان بعد التحديث: الشاشة واليوم ومكان السكرول ----
// بينحفظ لنص ساعة بس، لحتى فتح التطبيق تاني يوم يبدأ من الرئيسية وتاريخ اليوم
const PLACE_KEY = "ph_last_place";
let lastActiveTab = "dashboard";
function savePlace() {
  try {
    sessionStorage.setItem(PLACE_KEY, JSON.stringify({
      at: Date.now(), tab: lastActiveTab, scroll: window.scrollY,
      rec: currentReceivingDate, rem: currentRemainingDate,
      cust: typeof currentCustodyDate !== "undefined" ? currentCustodyDate : null
    }));
  } catch (e) { /* بلا تخزين: بيرجع للرئيسية */ }
}
function takeSavedPlace() {
  try {
    const p = JSON.parse(sessionStorage.getItem(PLACE_KEY) || "null");
    sessionStorage.removeItem(PLACE_KEY);
    return p && Date.now() - p.at < 30 * 60 * 1000 ? p : null;
  } catch (e) { return null; }
}
window.addEventListener("pagehide", savePlace);

// التطبيق مفتوح بالخلفية من امبارح: لما يرجع الموظف الصبح كانت الشاشات تضل على تاريخ امبارح
// ويسجّل استلام اليوم على امبارح. إذا الجوال كان مسكّر أكتر من ساعتين وتغيّر اليوم،
// كل شاشة كانت على "اليوم" بتنقل لليوم الجديد. (ما منغيّر شي والموظف شغّال عالشاشة قبل/بعد ١٢ بالليل)
let hiddenAt = 0, screensDay = todayStr(); // screensDay = اليوم اللي الشاشات فتحت عليه كـ"اليوم"
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
  const now = todayStr();
  if (!hiddenAt || now === screensDay || Date.now() - hiddenAt < 2 * 3600 * 1000) return;
  const old = screensDay;
  screensDay = now;
  rollScreensToToday(old, now);
});
function rollScreensToToday(oldDay, newDay) {
  const setInput = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; if (el._phRefresh) el._phRefresh(); } };
  if (currentReceivingDate === oldDay) { currentReceivingDate = newDay; setInput("receivingDateInput", newDay); }
  if (currentRemainingDate === oldDay) { currentRemainingDate = newDay; setInput("remainingDateInput", newDay); }
  if (typeof currentCustodyDate !== "undefined" && currentCustodyDate === oldDay) { currentCustodyDate = newDay; setInput("custodyDateInput", newDay); }
  if (typeof currentOpeningDate !== "undefined" && currentOpeningDate === oldDay) { currentOpeningDate = newDay; setInput("openingDateInput", newDay); }
  if (typeof currentJuiceDate !== "undefined" && currentJuiceDate === oldDay) { currentJuiceDate = newDay; setInput("juiceDateInput", newDay); }
  if (typeof currentWasteDate !== "undefined" && currentWasteDate === oldDay) currentWasteDate = newDay;
  if (typeof currentTomorrowDate !== "undefined" && currentTomorrowDate === addDaysStr(oldDay, 1)) {
    currentTomorrowDate = addDaysStr(newDay, 1); setInput("tomorrowDateInput", currentTomorrowDate);
  }
  if (!(Auth.getEmployee && Auth.getEmployee())) return;
  setActiveTab(lastActiveTab);
  if (lastActiveTab === "juices" && typeof loadJuiceDay === "function") loadJuiceDay(currentJuiceDate);
  if (lastActiveTab === "tomorrow" && typeof loadTomorrowOrder === "function") loadTomorrowOrder(currentTomorrowDate);
}
// الشاشات بتبدأ على تاريخ اليوم وقت التشغيل، فمنرجّع اليوم اللي كان مفتوح بعدها
function restorePlaceDates(place) {
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  // الاستلام والمتبقي بيتزامنوا على نفس اليوم، فمناخد يوم الشاشة اللي كان مفتوح
  const shared = place.tab === "remaining" ? place.rem : place.rec;
  const setInput = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  if (isDate(shared)) {
    currentReceivingDate = shared; currentRemainingDate = shared;
    setInput("receivingDateInput", shared); setInput("remainingDateInput", shared);
  }
  if (isDate(place.cust) && typeof currentCustodyDate !== "undefined") {
    currentCustodyDate = place.cust; setInput("custodyDateInput", place.cust);
  }
}

async function startApp() {
  hideLoginView();
  const place = takeSavedPlace();
  applyRoleUiGating();
  updateOfflineBanner();
  updateSyncBadge({ pending: Sync.getQueue().length });
  loadSettings();
  await Promise.all([Items.load(), ActiveBranches.refresh()]);
  initReceivingTab();
  initRemainingTab();
  if (tabAllowed("custody")) initCustodyTab();
  initDashboardTab();
  initTomorrowTab();
  if (tabAllowed("juices")) initJuicesTab();
  initChecklistTab();
  initReportTab();
  initDayJumpButtons();
  if (place) restorePlaceDates(place);
  // فتح شاشة معيّنة من رابط التنبيه (?tab=receiving)
  const params = new URLSearchParams(location.search);
  const wantedTab = params.get("tab");
  if (wantedTab) {
    params.delete("tab");
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
  }
  const startTab = wantedTab || (place && place.tab) || "dashboard";
  setActiveTab(tabAllowed(startTab) ? startTab : "dashboard");
  if (place && !wantedTab && place.scroll > 0) {
    // منستنى الشاشة تتعبّى قبل ما نرجع لنفس مكان السكرول
    setTimeout(() => window.scrollTo({ top: place.scroll, behavior: "instant" }), 1200);
  }
  if (typeof Push !== "undefined") Push.refreshLink();
}

async function doLoginSubmit() {
  const pin = document.getElementById("loginPinInput").value.trim();
  const errEl = document.getElementById("loginError");
  errEl.classList.add("hidden");
  if (!pin) return;
  const btn = document.getElementById("loginSubmitBtn");
  btn.disabled = true;
  try {
    await Auth.login(pin);
    startApp();
  } catch (e) {
    errEl.textContent = String(e).replace(/^(Error:\s*)+/, "");
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
}
document.getElementById("loginSubmitBtn").addEventListener("click", doLoginSubmit);
document.getElementById("loginPinInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doLoginSubmit(); });

// ---- تغيير الرقم السري ----
function togglePinDialog(show) {
  document.getElementById("pinDialog").classList.toggle("hidden", !show);
  document.getElementById("pinError").classList.add("hidden");
  if (show) {
    ["pinCurrent", "pinNew", "pinConfirm"].forEach(id => { document.getElementById(id).value = ""; });
    document.getElementById("pinCurrent").focus();
  }
}
document.getElementById("changePinBtn").addEventListener("click", () => togglePinDialog(true));
document.getElementById("pinCancelBtn").addEventListener("click", () => togglePinDialog(false));

document.getElementById("pinSaveBtn").addEventListener("click", async () => {
  const currentPin = document.getElementById("pinCurrent").value.trim();
  const newPin = document.getElementById("pinNew").value.trim();
  const confirmPin = document.getElementById("pinConfirm").value.trim();
  const errEl = document.getElementById("pinError");
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove("hidden"); };

  if (!currentPin || !newPin) return showErr("عبّ كل الخانات");
  if (newPin !== confirmPin) return showErr("الرقم الجديد غير متطابق في الخانتين");
  if (!/^\d{4,8}$/.test(newPin)) return showErr("الرقم الجديد لازم يكون من ٤ إلى ٨ أرقام");

  const btn = document.getElementById("pinSaveBtn");
  btn.disabled = true;
  try {
    await Auth.changePin(currentPin, newPin);
    await phAlert("تم تغيير رقمك. سجّل دخول بالرقم الجديد.");
    location.reload(); // الجلسات القديمة انلغت عالسيرفر — لازم دخول جديد
  } catch (e) {
    showErr(String(e).replace(/^(Error:\s*)+/, ""));
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (!(await phConfirm("متأكد تبي تطلع من حسابك؟", { title: "تسجيل الخروج", ok: "خروج", cancel: "إلغاء", danger: true }))) return;
  await Auth.logout();
  location.reload();
});

// ---- الإقلاع ----
(async function boot() {
  if (!Auth.isLoggedIn()) { showLoginView(); return; }
  await Auth.verify(); // يحدّث الدور/الفروع لو تغيّرت، وبيرجع لتسجيل الدخول لو الجلسة انتهت
  if (!Auth.isLoggedIn()) { showLoginView(); return; }
  startApp();
})();
