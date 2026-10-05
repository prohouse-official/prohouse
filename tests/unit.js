// اختبارات سريعة بدون متصفح — تشتغل تلقائياً على كل تعديل (GitHub Actions: checks.yml)
// node tests/unit.js
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

// 1) كل ملفات الجافاسكربت لازم تنقرأ بدون خطأ صياغة
for (const f of fs.readdirSync("js").filter(f => f.endsWith(".js"))) {
  new vm.Script(fs.readFileSync("js/" + f, "utf8"), { filename: f });
}

// 2) دوال التاريخ والهروب من config.js
const store = {};
const ctx = {
  console, Intl,
  Storage: function () {},
  window: {},
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, key: () => null, length: 0 },
};
ctx.Date = class extends Date {
  constructor(...a) { super(...(a.length ? a : [ctx.__now])); }
  static now() { return ctx.__now; }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/config.js", "utf8"), ctx);
const at = (iso) => { ctx.__now = Date.parse(iso); return vm.runInContext("todayStr()", ctx); };

// يوم الشغل يخلص ٤ الفجر بتوقيت الرياض
assert.strictEqual(at("2026-09-28T20:59:00Z"), "2026-09-28"); // 11:59 مساءً
assert.strictEqual(at("2026-09-28T22:41:00Z"), "2026-09-28"); // 1:41 بعد نص الليل = نفس يوم الشغل
assert.strictEqual(at("2026-09-29T00:59:00Z"), "2026-09-28"); // 3:59 الفجر
assert.strictEqual(at("2026-09-29T01:00:00Z"), "2026-09-29"); // 4:00 الفجر = يوم جديد
assert.strictEqual(at("2026-09-29T05:00:00Z"), "2026-09-29"); // 8 الصبح

const add = (d, n) => vm.runInContext(`addDaysStr(${JSON.stringify(d)}, ${n})`, ctx);
assert.strictEqual(add("2026-09-30", 1), "2026-10-01");
assert.strictEqual(add("2026-03-01", -1), "2026-02-28");
assert.strictEqual(add("2028-02-28", 1), "2028-02-29");
assert.strictEqual(add("2026-12-31", 1), "2027-01-01");
assert.strictEqual(add("2026-09-29", -7), "2026-09-22");

const esc = vm.runInContext(`escHtml('a"b<c>&\\'')`, ctx);
assert.strictEqual(esc, "a&quot;b&lt;c&gt;&amp;&#39;");

// 2b) المشتريات: فحوصات المحاسب والملخص
vm.runInContext(fs.readFileSync("js/purchases.js", "utf8"), ctx);
const pur = (code) => vm.runInContext(code, ctx);
ctx.__inv = { id: "a", kind: "invoice", source: "google_form", invoice_date: "2026-10-01", invoice_no: "1", supplier: "س",
  subtotal: 100, vat: 15, total: 115, lines: [{ name: "دجاج", qty: 2, unit: "كيلو", unit_price: 50, total: 100, category: "لحوم" }] };
assert.strictEqual(JSON.stringify(pur("purchaseChecks(__inv, [])")), "[]");
assert.ok(pur("purchaseChecks({ ...__inv, vat: 20 }, [])").some(w => w.includes("١٥٪")));
assert.ok(pur("purchaseChecks({ ...__inv, lines: [{ ...__inv.lines[0], unit: '' }] }, [])").some(w => w.includes("الوحدة")));
assert.ok(pur("purchaseChecks({ ...__inv, lines: [{ ...__inv.lines[0], total: 90 }] }, [])").some(w => w.includes("الكمية × السعر")));
assert.ok(pur("purchaseChecks(__inv, [{ ...__inv, id: 'b', status: 'approved' }])").some(w => w.includes("مكررة")));
assert.strictEqual(JSON.stringify(pur("purchaseChecks(__inv, [{ ...__inv, id: 'b', status: 'rejected' }])")), "[]");
// أسعار الأصناف شاملة الضريبة: مقبولة
assert.strictEqual(JSON.stringify(pur("purchaseChecks({ ...__inv, lines: [{ ...__inv.lines[0], unit_price: 57.5, total: 115 }] }, [])")), "[]");
const sum = pur(`purchaseSummary([__inv, { ...__inv, id: "r", kind: "return", subtotal: 50, vat: 7.5, total: 57.5, lines: [{ ...__inv.lines[0], qty: 1, total: 50 }] },
  { ...__inv, id: "x", status: "rejected" }, { ...__inv, id: "p", status: "pending" }])`);
assert.strictEqual(sum.total, 172.5);          // 115 − 57.5 + 115 (المرجّعة ما تنحسب)
assert.strictEqual(sum.vat, 22.5);
assert.strictEqual(sum.byCategory["لحوم"], 150);
assert.strictEqual(sum.pendingCount, 1);
// مصروف عهدة → فاتورة بانتظار التصنيف بمرجع ثابت (ما يتكرر)
const ci = pur(`custodyExpenseToInvoice({ date: "2026-10-01", branch: "الشاطئ" }, { id: "e1", amount: 46, note: "خبز" })`);
assert.strictEqual(ci.source_ref, "2026-10-01|الشاطئ|e1");
assert.strictEqual(ci.total, 46);

// 3) رقم نسخة الملفات لازم يكون نفسه بكل مكان (وإلا الجوال يضل على نسخة قديمة من ملف)
const html = fs.readFileSync("index.html", "utf8");
const versions = new Set([...html.matchAll(/\?v=([\d.]+)/g)].map(m => m[1]));
const i18n = fs.readFileSync("js/i18n.js", "utf8").match(/\?v=([\d.]+)/);
if (i18n) versions.add(i18n[1]);
assert.strictEqual(versions.size, 1, "أرقام النسخ مختلفة: " + [...versions].join(", "));

console.log("✓ unit tests passed");
