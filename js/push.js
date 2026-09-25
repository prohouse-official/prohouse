// ==================== تنبيهات الجوال (Web Push) ====================
// كل جوال بيشغّل التنبيهات مرة وحدة. السيرفر (دالة push-reminders + pg_cron كل 5 دقايق) بيبعت تذكير
// إذا إجا الوقت اللي حدده المالك بالإعدادات وما حدا بلّش الخطوة لهاليوم.
const VAPID_PUBLIC_KEY = "BHU1VIfVy4PYbagp0bGxq9_y5TIXThikYoorSBwD7vFYwrnJIm5nXONBeeMBBQ5NTwman88Ad4QOQXuzs2nGdh4";
const PUSH_FUNCTION_URL = SUPABASE_URL + "/functions/v1/push-reminders";

const Push = (() => {
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  function keyBytes(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function registration() {
    return navigator.serviceWorker.register("push-sw.js", { scope: "./" });
  }

  async function currentSubscription() {
    if (!supported()) return null;
    const reg = await navigator.serviceWorker.getRegistration("./");
    return reg ? reg.pushManager.getSubscription() : null;
  }

  // "on" | "off" | "denied" | "needs-home-screen" | "unsupported"
  async function state() {
    if (isIos() && !isStandalone()) return "needs-home-screen";
    if (!supported()) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    if (Notification.permission !== "granted") return "off";
    return (await currentSubscription()) ? "on" : "off";
  }

  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error(perm === "denied" ? "رفضت الإشعارات — فعّلها من إعدادات المتصفح" : "ما انعطى إذن");
    const reg = await registration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    const res = await SupaEngine.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    if (res && res.error) throw new Error(res.error);
    return sub;
  }

  async function disable() {
    const sub = await currentSubscription();
    if (!sub) return;
    await SupaEngine.rpc("delete_push_subscription", { p_endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }

  async function sendTest() {
    const sub = await currentSubscription();
    if (!sub) throw new Error("التنبيهات مو شغّالة على هالجوال");
    const res = await fetch(PUSH_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SUPABASE_ANON_KEY, "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ test: sub.endpoint })
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.sent) throw new Error(out.error || "ما وصل التنبيه");
  }

  // بعد تسجيل الدخول: إذا الجوال مشترك من قبل، منجدد ربطه بالموظف الحالي (بلا أي سؤال)
  async function refreshLink() {
    try {
      if (!supported() || Notification.permission !== "granted") return;
      const sub = await currentSubscription();
      if (!sub) return;
      const j = sub.toJSON();
      await SupaEngine.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    } catch (e) { /* مو مهم */ }
  }

  return { state, enable, disable, sendTest, refreshLink, isIos };
})();

// ---- كرت "شغّل التنبيهات" (بالرئيسية وبالإعدادات) ----
const PUSH_HINTS = {
  "needs-home-screen": "على الآيفون: افتح الموقع بـ Safari ← زر المشاركة ⬆️ ← «إضافة إلى الشاشة الرئيسية»، وافتحه من الأيقونة وبعدين شغّل التنبيهات.",
  "denied": "الإشعارات مسكّرة لهالموقع. من إعدادات المتصفح ← الإشعارات ← اسمح للموقع، وبعدين ارجع هون.",
  "unsupported": "هالمتصفح ما بيدعم التنبيهات. جرّب Chrome على أندرويد، أو أضف الموقع للشاشة الرئيسية على الآيفون."
};

async function pushCardHtml({ compact } = {}) {
  let st;
  try { st = await Push.state(); } catch (e) { st = "unsupported"; }
  if (compact && (st === "on" || st === "unsupported")) return "";
  if (st === "on") {
    return `<div class="push-card on"><div class="push-card-text"><b>🔔 التنبيهات شغّالة على هالجوال</b></div>
      <div class="push-card-actions"><button type="button" class="btn ghost" data-push="test">جرّب تنبيه</button>
      <button type="button" class="btn ghost" data-push="off">وقّفها</button></div></div>`;
  }
  if (st === "off") {
    return `<div class="push-card"><div class="push-card-text"><b>🔔 شغّل التنبيهات</b><span>بيجيك تذكير عالجوال إذا نسيت الاستلام أو الجرد أو العهدة.</span></div>
      <div class="push-card-actions"><button type="button" class="btn gold" data-push="on">تشغيل</button></div></div>`;
  }
  return `<div class="push-card muted"><div class="push-card-text"><b>🔔 التنبيهات</b><span>${PUSH_HINTS[st]}</span></div></div>`;
}

async function mountPushCard(el, opts) {
  if (!el) return;
  el.innerHTML = await pushCardHtml(opts);
  el.querySelectorAll("[data-push]").forEach(btn => btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const act = btn.dataset.push;
      if (act === "on") { await Push.enable(); showToast("✅ انشغلت التنبيهات"); }
      if (act === "off") { await Push.disable(); showToast("انطفت التنبيهات على هالجوال"); }
      if (act === "test") { await Push.sendTest(); showToast("📨 انبعت — لازم يوصلك هلأ"); }
    } catch (e) {
      showToast("⚠ " + (e.message || e));
    }
    mountPushCard(el, opts);
  }));
}

// ---- أوقات التذكير (للمالك بالإعدادات) ----
function reminderSettings() {
  try { return JSON.parse(currentSettings.reminders || "{}") || {}; } catch (e) { return {}; }
}

function reminderSettingsCardHtml() {
  const r = reminderSettings();
  const row = (key, label, hint) => `
    <label class="rem-time-row">
      <span><b>${label}</b><small>${hint}</small></span>
      <input type="time" id="remTime-${key}" value="${r[key] || ""}">
    </label>`;
  return `
    <div class="settings-card">
      <h3>⏰ تذكيرات الجوال</h3>
      <p class="settings-hint">بوقت كل تذكير، إذا الفرع لسا ما بلّش هالخطوة لهاليوم، بيوصل تنبيه لموظفين الفرع. فضّي الوقت لتلغي التذكير.</p>
      <label class="rem-switch"><input type="checkbox" id="remEnabled" ${r.enabled ? "checked" : ""}> التذكيرات شغّالة</label>
      ${row("receiving", "📦 استلام الصبح", "إذا ما انسجل ولا صنف مستلم")}
      ${row("remaining", "📊 جرد المتبقي", "إذا ما انسجل ولا متبقي")}
      ${row("custody", "💰 إغلاق العهدة", "إذا ما انسكرت العهدة (بعد نص الليل بيحسب لليوم اللي قبل)")}
      <label class="rem-switch"><input type="checkbox" id="remOwners" ${r.owners === false ? "" : "checked"}> ابعت نسخة للمالكين كمان</label>
      <button class="btn gold" id="saveRemindersBtn">حفظ التذكيرات</button>
      <div id="pushCardSettings" class="push-card-slot"></div>
    </div>`;
}

function bindReminderSettings() {
  mountPushCard(document.getElementById("pushCardSettings"));
  const btn = document.getElementById("saveRemindersBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const val = (k) => document.getElementById("remTime-" + k).value || "";
    const reminders = {
      enabled: document.getElementById("remEnabled").checked,
      owners: document.getElementById("remOwners").checked,
      receiving: val("receiving"), remaining: val("remaining"), custody: val("custody")
    };
    if (reminders.enabled && !reminders.receiving && !reminders.remaining && !reminders.custody) {
      showToast("⚠ حط وقت لتذكير واحد عالأقل");
      return;
    }
    const payload = { reminders: JSON.stringify(reminders) };
    currentSettings = { ...currentSettings, ...payload };
    Sync.cacheSet("settings", currentSettings);
    Sync.enqueue("saveSettings:reminders", "saveSettings", payload);
    showToast(reminders.enabled ? "✅ انحفظت أوقات التذكير" : "انحفظ — التذكيرات موقّفة");
  });
}
