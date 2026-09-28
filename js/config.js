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
// "اليوم" = يوم الشغل بتوقيت الرياض — حتى لو منطقة الجوال الزمنية غلط (مسافر أو ضابطها يدوي).
// يوم الشغل يخلص الساعة ٤ الفجر مو ١٢ الليل: جرد وطلبية بعد نص الليل تنحسب على نفس اليوم،
// و"بكرة" ما تنقلب لبعد بكرة أول ما تصير الساعة ١٢.
const WORKDAY_CUTOFF_HOUR = 4;
function todayStr() {
  const at = new Date(Date.now() - WORKDAY_CUTOFF_HOUR * 3600000);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch (e) {
    return at.getFullYear() + "-" + String(at.getMonth() + 1).padStart(2, "0") + "-" + String(at.getDate()).padStart(2, "0");
  }
}
// نص آمن داخل HTML وقيم الخانات (اسم فيه " أو < كان يكسر الخانة ويقص الملاحظة عند الحفظ)
function escHtml(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// بحساب UTC عشان التوقيت الصيفي بمنطقة الجوال ما يطلّع نفس اليوم مرتين أو يقفز يوم
function addDaysStr(dateStr, delta) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

// قائمة افتراضية للفروع
const DEFAULT_BRANCHES_FALLBACK = "الروضة,الشاطئ,عبداللطيف جميل";

// ترتيب افتراضي للتصنيفات
const DEFAULT_CATEGORY_ORDER_FALLBACK = "دجاج,لحم,بحري,ساندويتشات,كارب,أطباق جانبية,السلطات,الحلويات,فطور,معدات";
function categoryOrderList() {
  const raw = (typeof currentSettings !== "undefined" && currentSettings.categoryOrder) || DEFAULT_CATEGORY_ORDER_FALLBACK;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}
function categoryRank(cat) {
  const list = categoryOrderList();
  const i = list.indexOf(cat);
  return i === -1 ? list.length : i;
}
