// سحب سجل المشتريات من شيت يزيد إلى موقع برو هاوس — كل ساعة تلقائي.
// التركيب (مرة وحدة، من حساب عنده وصول للشيت: يزيد أو حسن أو cs.prohouse):
//   1) script.google.com → مشروع جديد → الصق هذا الملف كامل.
//   2) ⚙️ إعدادات المشروع → فعّل «إظهار ملف appsscript.json» → الصق محتوى المانيفست اللي تحت.
//   3) شغّل installHourly مرة وحدة ووافق على الصلاحيات. بعدها يشتغل لحاله كل ساعة.
// ما فيه أي كلمة سر: الموقع يتأكد من هوية حساب قوقل نفسه.
//
// appsscript.json:
// {
//   "timeZone": "Asia/Riyadh",
//   "exceptionLogging": "STACKDRIVER",
//   "runtimeVersion": "V8",
//   "oauthScopes": [
//     "openid",
//     "https://www.googleapis.com/auth/userinfo.email",
//     "https://www.googleapis.com/auth/spreadsheets.readonly",
//     "https://www.googleapis.com/auth/script.external_request",
//     "https://www.googleapis.com/auth/script.scriptapp"
//   ]
// }

var SHEET_ID = "1Anl5fUR4r_KjX0ZfjP00LaCyJ3K_nrNzcuHTRObBQw0";
var SYNC_URL = "https://sadtinfdwucwrxlmwxov.supabase.co/functions/v1/purchases-sync";

function installHourly() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("syncPurchases").timeBased().everyHours(1).create();
  syncPurchases();
}

function table_(ss, name) {
  var v = ss.getSheetByName(name).getDataRange().getValues();
  var h = -1;
  for (var i = 0; i < Math.min(v.length, 10); i++) if (v[i][0] === "رقم العملية") { h = i; break; }
  if (h < 0) throw new Error("ما لقيت عناوين ورقة " + name);
  var head = v[h];
  return v.slice(h + 1).filter(function (r) { return /^PUR-/.test(String(r[0])); }).map(function (r) {
    var o = {}; head.forEach(function (k, j) { o[k] = r[j]; }); return o;
  });
}

function d_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "Asia/Riyadh", "yyyy-MM-dd");
  var s = String(v || "").trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}
function n_(v) { return v === "" || v === null || isNaN(Number(v)) ? "" : Number(v); }
function s_(v) { return String(v === null || v === undefined ? "" : v).trim(); }

function syncPurchases() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var lines = {};
  table_(ss, "تفاصيل الأصناف").forEach(function (l) {
    var k = s_(l["رقم العملية"]);
    (lines[k] = lines[k] || []).push({ name: s_(l["الصنف"]), qty: n_(l["الكمية"]), unit: s_(l["الوحدة"]),
      unit_price: n_(l["سعر وحدة الشراء"]), total: n_(l["إجمالي السطر"]), category: s_(l["تصنيف الصنف"]) });
  });
  var rows = table_(ss, "سجل المشتريات").map(function (r) {
    var ref = s_(r["رقم العملية"]);
    return { ref: ref, date: d_(r["تاريخ الشراء"]), invoice_no: s_(r["رقم الفاتورة"]), supplier: s_(r["المورد"]),
      cost_center: s_(r["مركز التكلفة"]), subtotal: n_(r["الصافي قبل الضريبة"]), vat: n_(r["الضريبة الموثقة"]),
      total: n_(r["الإجمالي شامل الضريبة"]), uploader: s_(r["رافع المستند"]), doc_type: s_(r["نوع المستند"]),
      category: s_(r["التصنيف"]), payment_method: s_(r["طريقة الدفع"]), paid: n_(r["المبلغ المدفوع"]),
      remaining: n_(r["المتبقي"]), pay_status: s_(r["حالة السداد"]), form_review: s_(r["حالة المراجعة"]),
      doc_link: s_(r["رابط/مرجع المستند"]), lines: lines[ref] || [] };
  });
  var token = ScriptApp.getIdentityToken();
  var sum = { inserted: 0, updated: 0, skipped_reviewed: 0 };
  for (var i = 0; i < rows.length; i += 100) {
    var res = UrlFetchApp.fetch(SYNC_URL, {
      method: "post", contentType: "application/json", muteHttpExceptions: true,
      headers: { "x-google-id-token": token }, payload: JSON.stringify({ rows: rows.slice(i, i + 100) })
    });
    if (res.getResponseCode() !== 200) throw new Error("السحب فشل: " + res.getResponseCode() + " " + res.getContentText().slice(0, 200));
    var r = JSON.parse(res.getContentText()).result || {};
    sum.inserted += r.inserted || 0; sum.updated += r.updated || 0; sum.skipped_reviewed += r.skipped_reviewed || 0;
  }
  Logger.log("تم: " + rows.length + " فاتورة — جديدة " + sum.inserted + "، محدّثة " + sum.updated + "، مراجَعة ما تغيّرت " + sum.skipped_reviewed);
}
