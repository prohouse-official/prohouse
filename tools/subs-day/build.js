// أوراق الاشتراكات + بيانات تقرير الشيف — من كود التطبيق نفسه (js/subs-sheets.js)
// الاستعمال: node tools/subs-day/build.js <مجلد الشغل>   (MERGE=1 لدمج الأيام بمربع واحد لكل زبون)
// بالمجلد: subs.json {تاريخ: [زباين بشكل takrar_suborders_slim]} · standing.json (إعداد takrar_standing_orders)
//   اختياري: order.json [أرقام الاشتراكات بترتيب ملصقات تكرار] · boq.json {تاريخ: takrar_boq.items} · orders.json · items.json
// الناتج: sheets.pdf (تغليف ع/ب، فاتورة ع/ب، ورقة الطلبات الثابتة، ملصقات احتياطية) + chef-data.json لـ chef.js
const fs = require("fs"), path = require("path");
const SS = require(path.join(__dirname, "../../js/subs-sheets.js"));
const W = path.resolve(process.argv[2] || "."), H = process.env.SUBS_HOME || "/tmp/subs-day";
const rd = (f, d) => fs.existsSync(path.join(W, f)) ? JSON.parse(fs.readFileSync(path.join(W, f), "utf8")) : d;
const subs = rd("subs.json"), standing = rd("standing.json", {});
let order = rd("order.json", null);
if (Array.isArray(order)) { const o = order; order = {}; Object.keys(subs).forEach(d => order[d] = o); }
const days = Object.keys(subs).sort().map(d => ({ date: d, subs: subs[d].map(s => ({ ...s, status: s.status || "confirmed", service: s.service || "other_delivery" })) }));
const F = (f) => "file://" + path.join(H, "fonts", f);
const fontCss = `<style>@font-face{font-family:"Noto Sans Arabic";src:url(${F("NotoSansArabic.ttf")})}@font-face{font-family:"Noto Sans Bengali";src:url(${F("NotoSansBengali-Regular.ttf")})}@font-face{font-family:"Noto Sans Bengali";src:url(${F("NotoSansBengali-Bold.ttf")});font-weight:700}</style>`;
fs.writeFileSync(path.join(W, "sheets.html"), SS.buildDocument(days, standing, { fontCss, noBar: true, merge: process.env.MERGE === "1", ...(order ? { order } : {}) }));
days.forEach(d => console.log(d.date, SS.buildDay(d.date, d.subs, standing).map(r => r.name + ":" + r.items.length).join(", ")));

// تقرير الشيف: توصيل تكرار بس (بدون الاستلام) لكل الأيام مجموع + وجبات الطلبات الثابتة (add) بنفس الأيام
const boqByDay = rd("boq.json", null);
if (boqByDay) {
  const n = (x) => Number(x) || 0, byDay = {};
  let m = new Map();
  const all = new Map();
  const add = (r) => { add1(all, r); add1(m, r); };
  const add1 = (m, r) => {
    const q = r.delivery != null ? n(r.delivery) : n(r.qty); if (!q) return;
    const vs = (r.variants || []).map(v => ({ name: v.name, q: v.delivery != null ? n(v.delivery) : n(v.qty) })).filter(v => v.q);
    const k = r.name + "|" + (r.size || "");
    if (!m.has(k)) m.set(k, { qty: 0, name: r.name, size: r.size || "", pickup: 0, category: r.category || "", delivery: 0, variants: [] });
    const x = m.get(k); x.qty += q; x.delivery += q;
    vs.forEach(v => { let y = x.variants.find(z => z.name === v.name); if (!y) x.variants.push(y = { qty: 0, name: v.name, pickup: 0, delivery: 0 }); y.qty += v.q; y.delivery += v.q; });
  };
  Object.keys(boqByDay).sort().forEach(d => {
    m = byDay[d] = new Map();
    (boqByDay[d] || []).forEach(add);
    Object.keys(standing).forEach(sid => {
      const st = standing[sid];
      if (!st.add || (st.from && st.from > d) || (st.to && st.to < d)) return;
      const day = (st.days && st.days[d]) || {};
      (day.meals || st.meals || []).forEach(ml => add({ qty: 1, delivery: 1, name: `${ml.ar.split(" — ")[0]} (${st.name})`, size: `${ml.protein || 0}P - ${ml.carb ? ml.carb_g || 0 : 0}C`, category: "الوجبات الرئيسية الجديدة", variants: ml.carb ? [{ name: ml.carb, qty: 1, delivery: 1 }] : [] }));
      (day.extras || st.extras || []).forEach(x => add({ qty: 1, delivery: 1, name: `${x.ar.replace(/\s*\(.*\)$/, "")} (${st.name})`, size: "", category: "السناك", variants: [] }));
    });
  });
  fs.writeFileSync(path.join(W, "chef-data.json"), JSON.stringify({ items: rd("items.json", []), orders: rd("orders.json", []), boq: [...all.values()], byDay: Object.fromEntries(Object.entries(byDay).map(([d, x]) => [d, [...x.values()]])) }));
  console.log("chef boq rows", all.size);
}
(async () => {
  const b = await require("playwright").chromium.launch(); const p = await b.newPage();
  await p.goto("file://" + path.join(W, "sheets.html")); await p.waitForTimeout(1200);
  await p.pdf({ path: path.join(W, "sheets.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  await b.close();
})();
