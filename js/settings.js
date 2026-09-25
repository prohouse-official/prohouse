// ==================== الإعدادات (اسم الفرع/المطعم، الشعار، نسخ احتياطي/استعادة) ====================

let currentSettings = {};
let categoryOrderState = [];

async function loadSettings() {
  const data = await Sync.get("getSettings", {}, "settings", (val) => { currentSettings = val || {}; applyBrandingFromSettings(); });
  currentSettings = data || currentSettings;
  applyBrandingFromSettings();
  return currentSettings;
}

function applyBrandingFromSettings() {
  if (currentSettings.restaurantName) {
    document.querySelectorAll(".brand-name").forEach(el => el.textContent = currentSettings.restaurantName);
  }
  if (currentSettings.logoUrl) {
    const img = document.getElementById("headerLogoImg");
    if (img) { img.src = currentSettings.logoUrl; img.classList.remove("hidden"); }
    const textLogo = document.getElementById("headerLogoText");
    if (textLogo) textLogo.classList.add("hidden");
  }
}

function initCategoryOrderState() {
  const saved = (currentSettings.categoryOrder || DEFAULT_CATEGORY_ORDER_FALLBACK)
    .split(",").map(s => s.trim()).filter(Boolean);
  const fromItems = (typeof Items !== "undefined" ? Items.current : [])
    .map(it => it.category).filter(Boolean);
  const extra = [...new Set(fromItems)].filter(c => !saved.includes(c));
  categoryOrderState = [...saved, ...extra];
}

function categoryOrderListHtml() {
  return categoryOrderState.map((cat, i) => `
    <div class="cat-order-row">
      <span class="cat-order-num">${i + 1}</span>
      <span class="cat-order-name">${cat}</span>
      <div class="cat-order-btns">
        <button type="button" class="cat-order-btn" data-dir="up" data-idx="${i}" ${i === 0 ? "disabled" : ""}>▲</button>
        <button type="button" class="cat-order-btn" data-dir="down" data-idx="${i}" ${i === categoryOrderState.length - 1 ? "disabled" : ""}>▼</button>
      </div>
    </div>
  `).join("");
}

function renderCategoryOrderList() {
  const wrap = document.getElementById("categoryOrderList");
  if (!wrap) return;
  wrap.innerHTML = categoryOrderListHtml();
  wrap.querySelectorAll(".cat-order-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.idx);
      const j = btn.dataset.dir === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= categoryOrderState.length) return;
      [categoryOrderState[i], categoryOrderState[j]] = [categoryOrderState[j], categoryOrderState[i]];
      renderCategoryOrderList();
    });
  });
}

function renderSettingsView() {
  const view = document.getElementById("settingsView");
  if (!view) return;
  initCategoryOrderState();
  view.innerHTML = `
    <div class="settings-card">
      <h3>هوية المطعم</h3>
      <div class="field"><label>اسم النظام/المطعم</label><input type="text" id="setRestaurantName" value="${currentSettings.restaurantName || "Pro House"}"></div>
      <div class="field"><label>رابط صورة الشعار (اختياري)</label><input type="url" id="setLogoUrl" value="${currentSettings.logoUrl || ""}"></div>
      <button class="btn gold" id="saveBrandBtn">حفظ</button>
    </div>

    <div class="settings-card">
      <h3>الفروع</h3>
      <div class="field">
        <label>أسماء الفروع (افصل بينها بفاصلة ,)</label>
        <input type="text" id="setBranches" value="${currentSettings.branches || DEFAULT_BRANCHES_FALLBACK}">
      </div>
      <button class="btn gold" id="saveBranchesBtn">حفظ الفروع</button>
    </div>

    <div class="settings-card">
      <h3>ترتيب التصنيفات</h3>
      <div class="field">
        <label>رتّب التصنيفات بالأسهم (بنفس الترتيب اللي تبيه يظهر بكل الشاشات والتقارير)</label>
        <div id="categoryOrderList" class="cat-order-list">${categoryOrderListHtml()}</div>
      </div>
      <button class="btn gold" id="saveCategoryOrderBtn">حفظ الترتيب</button>
    </div>

    <div class="settings-card">
      <h3>أعتاب التنبيهات</h3>
      <div class="inputs-row">
        <div class="field"><label>نسبة النقص</label><input type="number" step="0.01" id="setShortage" value="${currentSettings.shortageThresholdPct ?? -0.20}"></div>
        <div class="field"><label>نسبة الزيادة</label><input type="number" step="0.01" id="setSurplus" value="${currentSettings.surplusThresholdPct ?? 0.25}"></div>
        <div class="field"><label>نسبة الإرجاع</label><input type="number" step="0.01" id="setReturn" value="${currentSettings.returnThresholdPct ?? 0.30}"></div>
      </div>
      <button class="btn gold" id="saveThresholdsBtn" style="margin-top:8px;">حفظ الأعتاب</button>
    </div>

    ${typeof reminderSettingsCardHtml === "function" ? reminderSettingsCardHtml() : ""}

    <div class="settings-card">
      <h3>إشعارات وتنبيهات الواتساب 💬📱</h3>
      <div class="field">
        <label>أرقام الإدارة/صاحب المطعم (افصل بين الأرقام بفاصلة لإرسالها لأكثر من شخص)</label>
        <input type="tel" id="setAdminPhone" value="${currentSettings.adminPhone || currentSettings.whatsappPhone || ""}" placeholder="9665xxxxxxxx">
      </div>
      <div class="field">
        <label>رقم واتساب الشيف (لتلقي طلبية الغد تلقائياً)</label>
        <input type="tel" id="setChefPhone" value="${currentSettings.chefPhone || ""}" placeholder="966522222222">
      </div>
      <div class="field">
        <label>رابط البوابة (apiUrl — انسخه من صفحة الـ instance، لكل حساب رابط خاص فيه)</label>
        <input type="url" id="setWhatsappApiUrl" value="${currentSettings.whatsappApiUrl || ""}" placeholder="https://7107.api.greenapi.com">
      </div>
      <div class="field">
        <label>رقم الحساب (Instance ID)</label>
        <input type="text" id="setWhatsappInstanceId" value="${currentSettings.whatsappInstanceId || ""}" placeholder="مثال: 1101812345">
      </div>
      <div class="field">
        <label>مفتاح API (Token)</label>
        <input type="text" id="setWhatsappToken" value="${currentSettings.whatsappToken || ""}" placeholder="رمز API">
      </div>
      <div class="pin-note" style="margin-bottom:8px;">
        الثلاثة تاخذهم من لوحة تحكم Green API بعد ما تربط رقم المطعم بمسح QR.
        الباقة المجانية تسمح بـ <b>٣ أرقام مستقبِلة</b> بس — اختارهم بعناية.
      </div>
      <div class="toolbar" style="margin-top:10px;">
        <button class="btn gold" id="saveWhatsappBtn">حفظ إعدادات الواتساب</button>
        <button class="btn primary" id="testWhatsappBtn">🧪 تجربة إرسال رسالة</button>
        <button class="btn" id="enableDailySummaryBtn">⏰ تفعيل التقرير اليومي (11 م)</button>
      </div>
    </div>

    <div class="settings-card">
      <h3>إدارة الأصناف</h3>
      <button class="btn primary" id="gotoItemsBtn">فتح شاشة إدارة الأصناف</button>
    </div>

    <div class="settings-card">
      <h3>نسخ احتياطي / استعادة</h3>
      <div class="toolbar">
        <button class="btn" id="backupBtn">⬇ تصدير نسخة احتياطية</button>
        <label class="btn" style="cursor:pointer;">
          ⬆ استيراد نسخة احتياطية
          <input type="file" id="restoreFile" accept="application/json" style="display:none;">
        </label>
      </div>
      <div class="save-status" id="backupStatus"></div>
    </div>

    <div class="settings-card" style="border-color:var(--red);">
      <h3 style="color:var(--red);">🗑 مسح كافة البيانات السابقة والبدء من جديد</h3>
      <div class="pin-note" style="margin-bottom:12px;">
        سيؤدي هذا الإجراء لمسح كافة إدخالات الاستلام، المرتجعات، طلبات الغد، وجرد العصيرات السابقة للبدء بإدخال جديد.
      </div>
      <button class="btn" id="clearAllDataBtn" style="background:var(--red);color:#fff;border-color:var(--red);width:100%;">
        🗑 مسح جميع الإدخالات السابقة والبدء من جديد
      </button>
    </div>
  `;

  document.getElementById("saveBrandBtn").addEventListener("click", () => {
    const payload = {
      restaurantName: document.getElementById("setRestaurantName").value.trim(),
      logoUrl: document.getElementById("setLogoUrl").value.trim()
    };
    currentSettings = { ...currentSettings, ...payload };
    Sync.cacheSet("settings", currentSettings);
    Sync.enqueue("saveSettings:brand", "saveSettings", payload);
    applyBrandingFromSettings();
    showToast("تم حفظ الهوية");
  });

  document.getElementById("saveBranchesBtn").addEventListener("click", () => {
    const payload = { branches: document.getElementById("setBranches").value.trim() };
    currentSettings = { ...currentSettings, ...payload };
    Sync.cacheSet("settings", currentSettings);
    Sync.enqueue("saveSettings:branches", "saveSettings", payload);
    showToast("تم حفظ الفروع");
  });

  renderCategoryOrderList();

  document.getElementById("saveCategoryOrderBtn").addEventListener("click", () => {
    const payload = { categoryOrder: categoryOrderState.join(",") };
    currentSettings = { ...currentSettings, ...payload };
    Sync.cacheSet("settings", currentSettings);
    Sync.enqueue("saveSettings:categoryOrder", "saveSettings", payload);
    showToast("تم حفظ ترتيب التصنيفات");
  });

  if (typeof bindReminderSettings === "function") bindReminderSettings();

  document.getElementById("saveThresholdsBtn").addEventListener("click", () => {
    const payload = {
      shortageThresholdPct: document.getElementById("setShortage").value,
      surplusThresholdPct: document.getElementById("setSurplus").value,
      returnThresholdPct: document.getElementById("setReturn").value
    };
    currentSettings = { ...currentSettings, ...payload };
    Sync.cacheSet("settings", currentSettings);
    Sync.enqueue("saveSettings:thresholds", "saveSettings", payload);
    showToast("تم حفظ الأعتاب");
  });

  const saveWaBtn = document.getElementById("saveWhatsappBtn");
  if (saveWaBtn) {
    saveWaBtn.addEventListener("click", () => {
      const adminPhone = document.getElementById("setAdminPhone").value.trim();
      const chefPhone = document.getElementById("setChefPhone").value.trim();
      const whatsappApiUrl = document.getElementById("setWhatsappApiUrl").value.trim();
      const whatsappToken = document.getElementById("setWhatsappToken").value.trim();
      const whatsappInstanceId = document.getElementById("setWhatsappInstanceId").value.trim();
      const payload = { adminPhone, whatsappPhone: adminPhone, chefPhone, whatsappApiUrl, whatsappToken, whatsappInstanceId };
      currentSettings = { ...currentSettings, ...payload };
      Sync.cacheSet("settings", currentSettings);
      Sync.enqueue("saveSettings:whatsapp", "saveSettings", payload);
      showToast("تم حفظ إعدادات الواتساب");
    });
  }

  const testWaBtn = document.getElementById("testWhatsappBtn");
  if (testWaBtn) {
    testWaBtn.addEventListener("click", async () => {
      const adminPhone = document.getElementById("setAdminPhone").value.trim();
      if (!adminPhone) {
        showToast("ادخل رقم واتساب الإدارة أولاً");
        return;
      }
      showToast("جاري إرسال الرسالة التجريبية...");
      try {
        const res = await Sync.call("testWhatsApp", { phone: adminPhone, message: "🚀 رسالة تجريبية من Pro House! تم تفعيل نظام التنبيهات بنجاح." });
        if (res && res.ok) showToast("🎉 تم إرسال رسالة الواتساب بنجاح!");
        else showToast("تم الإرسال — تحقق من وصول الرسالة على واتساب");
      } catch (err) {
        showToast("تعذر إرسال الرسالة — تأكد من صحة رقم الرقم والتوكن");
      }
    });
  }

  const enableSummaryBtn = document.getElementById("enableDailySummaryBtn");
  if (enableSummaryBtn) {
    enableSummaryBtn.addEventListener("click", async () => {
      try {
        const res = await Sync.call("createDailySummaryTrigger", {});
        showToast("✅ تم تفعيل التقرير اليومي التلقائي الساعة 11 مساءً");
      } catch (err) {
        showToast("تعذر تفعيل المشغّل المجدول");
      }
    });
  }

  document.getElementById("gotoItemsBtn").addEventListener("click", () => {
    document.querySelector('.tab-btn[data-tab="items"]').click();
  });

  document.getElementById("backupBtn").addEventListener("click", doBackup);
  document.getElementById("restoreFile").addEventListener("change", doRestore);

  const clearDataBtn = document.getElementById("clearAllDataBtn");
  if (clearDataBtn) {
    clearDataBtn.addEventListener("click", async () => {
      if (!(await phConfirm("⚠️ هل أنت متأكد من مسح جميع بيانات وإدخالات الاستلام والمرتجعات والجرد السابقة كلياً للبدء من جديد؟", { ok: "امسح", danger: true }))) return;

      clearDataBtn.disabled = true;
      clearDataBtn.textContent = "جاري مسح البيانات...";

      clearAllLocalEntries();

      try {
        if (typeof Sync !== "undefined" && Sync.request) {
          await Sync.request("clearAllEntriesData", {});
        }
      } catch (e) {
        console.warn("تنبيه أثناء مسح بيانات الباك اند:", e);
      }

      await phAlert("🎉 تم مسح كافة البيانات والإدخالات السابقة بنجاح! يمكنك الآن البدء من جديد اعتبارا من الأحد إن شاء الله.");
      location.reload();
    });
  }
}

function clearAllLocalEntries() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith("prohouse_") ||
      key.startsWith("ph_cache:") ||
      key.startsWith("day:") ||
      key.startsWith("tomorrow:") ||
      key.startsWith("juiceday:") ||
      key.startsWith("report:")
    )) {
      if (key !== "ph_token" && key !== "ph_employee_v2") {
        keysToRemove.push(key);
      }
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

async function doBackup() {
  const status = document.getElementById("backupStatus");
  if (!API_URL) { status.textContent = "⚠ رابط الباك اند ما انربط للحين (API_URL)"; return; }
  status.textContent = "جاري التصدير…";
  try {
    const qs = new URLSearchParams({ action: "backupAll" }).toString();
    const res = await fetch(API_URL + "?" + qs);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `prohouse-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    status.textContent = "✅ تم التصدير";
  } catch (e) {
    status.textContent = "⚠ فشل التصدير: " + e;
  }
}

async function doRestore(e) {
  const file = e.target.files[0];
  if (!file) return;
  const status = document.getElementById("backupStatus");
  if (!API_URL) { status.textContent = "⚠ رابط الباك اند ما انربط للحين (API_URL)"; return; }
  if (!(await phConfirm("استعادة النسخة الاحتياطية بتستبدل كل البيانات الحالية باللي في الشيت. متأكد؟"))) { e.target.value = ""; return; }
  status.textContent = "جاري الاستعادة…";
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "restoreAll", payload })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    status.textContent = "✅ تمت الاستعادة — أعد فتح الصفحة";
    showToast("تمت الاستعادة بنجاح");
  } catch (err) {
    status.textContent = "⚠ فشلت الاستعادة: " + err;
  } finally {
    e.target.value = "";
  }
}
