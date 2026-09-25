// الإضافات (Sales By Modifiers): مثل "+ 50 دجاج مع كارب". الإضافة جزء من الوزن المستلم،
// فمنحوّل جراماتها لعدد وجبات (÷ وزن الوجبة) ومنضيفها لتصنيفها — متل ما أم علي بتنضاف للساندويتشات.
const MODIFIER_REPORT_URL = "https://app.tabsense.ai/prohouse/dashboard/reports/sales-by-modifier";
const MEAL_WEIGHT_G = 150;

async function extractModifierRows(page) {
  await page.evaluate(() => {
    const sel = document.querySelector('select[name*="length"]');
    if (sel) { sel.value = "100"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const table = document.querySelector("table");
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll("thead th, thead td")).map(th => th.innerText.trim().toLowerCase());
    const find = (re, fallback) => { const i = headers.findIndex(h => re.test(h)); return i >= 0 ? i : fallback; };
    const modIdx = find(/^modifier$|^الإضافة$|^الاضافة$|^المعدّل$|^المعدل$/, 0);
    const optIdx = find(/^option$|خيار/, 1);
    const qtyIdx = find(/quantity|الكمية/, 2);
    const netIdx = find(/net|صافي/, 4);
    const num = (t) => parseFloat(String(t || "").replace(/[^0-9.\-]/g, "")) || 0;
    return Array.from(table.querySelectorAll("tbody tr")).map(tr => {
      const td = Array.from(tr.querySelectorAll("td")).map(x => x.innerText.trim());
      return { modifier: td[modIdx] || "", option: td[optIdx] || "", qty: num(td[qtyIdx]), net: td[netIdx] ? num(td[netIdx]) : null };
    }).filter(r => r.modifier && r.qty > 0 && td0ok(r.modifier));
    function td0ok(t) { return !/no data|لا توجد/i.test(t); }
  });
}

function modifierCategory(text) {
  const t = String(text || "").toLowerCase();
  if (/دجاج|chicken/.test(t)) return "دجاج";
  if (/لحم|meat|beef|steak/.test(t)) return "لحم";
  if (/سمك|جمبري|روبيان|سالمون|fish|shrimp|salmon/.test(t)) return "بحري";
  return null;
}

// كم جرام زيادة بتضيف الإضافة: "+ 50 ..." = 50، و"200 chicken" = 200 − 150 = 50
function modifierExtraGrams(text) {
  const t = String(text || "");
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (/^\s*\+/.test(t)) return n;
  return n > MEAL_WEIGHT_G ? n - MEAL_WEIGHT_G : 0;
}

// { دجاج: جرامات، لحم: ...، بحري: ... }
function modifierGramsByCategory(rows) {
  const out = {};
  rows.forEach(r => {
    const label = r.option || r.modifier;
    const cat = modifierCategory(label) || modifierCategory(r.modifier);
    const g = modifierExtraGrams(label) || modifierExtraGrams(r.modifier);
    if (cat && g) out[cat] = (out[cat] || 0) + g * r.qty;
  });
  return out;
}

module.exports = { MODIFIER_REPORT_URL, MEAL_WEIGHT_G, extractModifierRows, modifierGramsByCategory };
