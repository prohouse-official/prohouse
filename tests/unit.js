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

// 3) رقم نسخة الملفات لازم يكون نفسه بكل مكان (وإلا الجوال يضل على نسخة قديمة من ملف)
const html = fs.readFileSync("index.html", "utf8");
const versions = new Set([...html.matchAll(/\?v=([\d.]+)/g)].map(m => m[1]));
const i18n = fs.readFileSync("js/i18n.js", "utf8").match(/\?v=([\d.]+)/);
if (i18n) versions.add(i18n[1]);
assert.strictEqual(versions.size, 1, "أرقام النسخ مختلفة: " + [...versions].join(", "));

console.log("✓ unit tests passed");
