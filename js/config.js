// ---- حماية ذاكرة المتصفح (localStorage ~5MB) ----
// إذا امتلت، أي حفظ (تسجيل الدخول، طابور الحفظ، الأصناف) كان يفشل ويوقف الشاشة.
// هون: إذا ما في مكان، منمسح الكاش القديم (نسخ قراءة بس، بترجع من السيرفر) ومنعيد المحاولة.
(function guardLocalStorage() {
  try {
    const proto = Storage.prototype, orig = proto.setItem;
    const disposable = (k) => k.startsWith("ph_cache:") || k === "ph_local_photos";
    proto.setItem = function (key, value) {
      try { return orig.call(this, key, value); }
      catch (e) {
        if (this !== window.localStorage) throw e;
        const keys = [];
        for (let i = 0; i < this.length; i++) { const k = this.key(i); if (k && k !== key && disposable(k)) keys.push(k); }
        const at = (k) => { try { return (JSON.parse(this.getItem(k)) || {}).fetchedAt || 0; } catch (x) { return 0; } };
        keys.sort((a, b) => at(a) - at(b));
        for (const k of keys) {
          this.removeItem(k);
          try { return orig.call(this, key, value); } catch (x) { /* لسا ما في مكان — منمسح كمان */ }
        }
        throw e;
      }
    };
  } catch (e) { /* متصفح قديم */ }
})();

// إعدادات الاتصال بنظام Pro House فائق السرعة (Supabase)
const SUPABASE_URL = "https://sadtinfdwucwrxlmwxov.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZHRpbmZkd3Vjd3J4bG13eG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTM4MDgsImV4cCI6MjEwNTEyOTgwOH0.jMtjOIBQIuv0N0Q4ms9LJ5ys3h3lfakND4pVQXNbU2w";

// الرابط الاحتياطي للباك اند القديم (Google Apps Script)
const API_URL = "https://script.google.com/macros/s/AKfycbykhtn0VUleuPkNYAKutt6AFrpl-atN5dmruiRGTSkK8ejYZxzbsZ71AZyDQD_LMbe_/exec";

const APP_VERSION = "3.0.0-supabase";

// ---- دوال التاريخ المشتركة ----
// تاريخ اليوم بتوقيت الرياض دايماً — حتى لو منطقة الجوال الزمنية غلط (مسافر أو ضابطها يدوي)
function todayStr() {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch (e) {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
}
function addDaysStr(dateStr, delta) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// قائمة افتراضية للفروع
const DEFAULT_BRANCHES_FALLBACK = "الروضة,الشاطئ,عبداللطيف جميل";

// ترتيب افتراضي للتصنيفات
const DEFAULT_CATEGORY_ORDER_FALLBACK = "دجاج,لحم,بحري,ساندويتشات,كارب,السلطات,الحلويات,فطور,معدات";
function categoryOrderList() {
  const raw = (typeof currentSettings !== "undefined" && currentSettings.categoryOrder) || DEFAULT_CATEGORY_ORDER_FALLBACK;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}
function categoryRank(cat) {
  const list = categoryOrderList();
  const i = list.indexOf(cat);
  return i === -1 ? list.length : i;
}
