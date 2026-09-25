// ==================== وضع المعاينة التجريبي ====================
// بيشتغل بس مع ?demo=1 بالرابط (وبيضل شغّال لآخر الجلسة). كل طلبات Supabase بتروح لقاعدة
// بيانات وهمية جوّا المتصفح، فما في ولا طلب بيوصل للنظام الحقيقي.
// أرقام الدخول: 1111 = حسن (مالك) · 2222 = محمد البلول (موظف فرع)
(function () {
  let on = false;
  try {
    if (new URLSearchParams(location.search).get("demo") === "1") sessionStorage.setItem("ph_demo", "1");
    on = sessionStorage.getItem("ph_demo") === "1";
  } catch (e) { /* بلا sessionStorage: بلا وضع تجريبي */ }
  window.PH_DEMO = on;
  if (!on) return;

  const AJL = "عبداللطيف جميل";
  const DB_KEY = "ph_demo_db_v1";
  const riyadh = (offset) => {
    const d = new Date(Date.now() + offset * 86400000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d);
  };
  const EMPLOYEES = {
    "1111": { id: "emp_2", name: "حسن", role: "owner", branches: "الروضة,الشاطئ," + AJL, token: "demo-owner" },
    "2222": { id: "emp_6", name: "محمد البلول", role: "employee", branches: AJL, token: "demo-staff" }
  };

  function seed() {
    const cat = [
      ["d1", "دجاج", "دجاج بالكريمة", "جرام"], ["d2", "دجاج", "دجاج زعفران", "جرام"], ["d3", "دجاج", "دجاج تكا", "جرام"],
      ["d4", "دجاج", "دجاج الشيف", "جرام"], ["d5", "دجاج", "دجاج باربكيو", "جرام"],
      ["l1", "لحم", "لحم الشيف 1", "جرام"], ["l2", "لحم", "لحم الشيف 2", "جرام"],
      ["s1", "بحري", "سالمون", "جرام"], ["s2", "بحري", "جمبري بروفنسال", "جرام"],
      ["f1", "فطور", "ساندويتش روستيد", "ساندويتش"], ["f2", "فطور", "ساندويتش تونا", "ساندويتش"], ["f3", "فطور", "بيض مسلوق", "حبة"],
      ["sl1", "السلطات", "سلطة سيزر", "طاسة"], ["sl2", "السلطات", "سلطة فتوش", "طاسة"],
      ["k1", "كارب", "رز أبيض", "1/2"], ["h1", "الحلويات", "كوكيز", "حبة"]
    ];
    const items = cat.map(([id, category, name, unit], i) => ({ id, category, name, unit, has_custom_name: false, branches: "", active: true, sort_order: i, unit_factor: 1 }));
    const daily_entries = [];
    const tabsense_sales = [];
    [-1, -2].forEach(off => {
      const date = riyadh(off);
      items.forEach((it, i) => {
        const grams = it.unit === "جرام";
        const rec = grams ? 1400 + ((i * 233) % 1500) : 3 + (i % 6);
        daily_entries.push({ id: daily_entries.length + 1, date, branch: AJL, item_id: it.id, item_name: it.name, unit: it.unit, confirmed: true,
          received: rec, returned: 0, remaining: grams ? 150 + ((i * 97) % 400) : i % 2, remaining_weight: grams ? 150 + ((i * 97) % 400) : i % 2,
          remaining_sauce: null, is_sauce: false, notes: "", cook_name: "", saved_at: new Date().toISOString() });
      });
      [["دجاج", 38], ["لحم", 9], ["بحري", 15], ["ساندويتشات", 26], ["السلطات", 6]].forEach(([category, qty], i) =>
        tabsense_sales.push({ id: tabsense_sales.length + 1, date, branch: AJL, category, qty: qty + (off === -1 ? 2 : 0), imported_at: new Date().toISOString() }));
    });
    return {
      items, daily_entries, tabsense_sales,
      day_meta: [], tomorrow_orders: [], waste_log: [], juices: [], juice_counts: [], juice_sales: [],
      settings: [{ key: "branches", value: "الروضة,الشاطئ," + AJL }],
      employees: Object.values(EMPLOYEES).map(({ token, ...e }) => ({ ...e, active: true })),
      tabsense_payments: [
        { date: riyadh(-1), branch: AJL, channel: "Cash", transactions: 6, amount: 212.4 },
        { date: riyadh(-1), branch: AJL, channel: "Mada", transactions: 79, amount: 1498.5 }
      ],
      custody_closings: [], push_subscriptions: [], reminder_settings: []
    };
  }
  let db;
  try { db = JSON.parse(sessionStorage.getItem(DB_KEY)); } catch (e) { db = null; }
  if (!db) db = seed();
  const persist = () => { try { sessionStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} };

  const KEYS = {
    daily_entries: ["date", "branch", "item_id"], day_meta: ["date", "branch"], items: ["id"], settings: ["key"], juices: ["id"],
    juice_counts: ["date", "branch", "juice_id"], employees: ["id"], custody_closings: ["date", "branch"],
    push_subscriptions: ["endpoint"], reminder_settings: ["key"], waste_log: ["id"], tabsense_payments: ["date", "branch", "channel"]
  };

  function parseList(v) { return v.slice(v.indexOf("(") + 1, v.lastIndexOf(")")).split(",").map(s => decodeURIComponent(s.replace(/^"|"$/g, ""))); }
  function matches(row, params) {
    for (const [col, raw] of params) {
      if (["select", "order", "on_conflict", "limit", "offset"].includes(col)) continue;
      const i = raw.indexOf(".");
      const op = raw.slice(0, i), v = raw.slice(i + 1), cell = row[col];
      const num = (x) => (isNaN(Number(x)) ? x : Number(x));
      if (op === "eq" && String(cell) !== v) return false;
      if (op === "neq" && String(cell) === v) return false;
      if (op === "gte" && !(num(cell) >= num(v))) return false;
      if (op === "lte" && !(num(cell) <= num(v))) return false;
      if (op === "gt" && !(num(cell) > num(v))) return false;
      if (op === "lt" && !(num(cell) < num(v))) return false;
      if (op === "in" && !parseList(v).includes(String(cell))) return false;
      if (op === "is" && !((v === "null" && cell == null) || String(cell) === v)) return false;
    }
    return true;
  }
  function pick(row, select) {
    if (!select || select === "*") return row;
    return Object.fromEntries(select.split(",").map(c => c.trim()).filter(Boolean).map(c => [c, row[c]]));
  }

  function handle(method, url, body) {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/rest\/v1\//, "");
    const params = [...u.searchParams.entries()];
    if (path.startsWith("rpc/")) {
      const fn = path.slice(4);
      if (fn === "login") {
        const e = EMPLOYEES[String((body && body.p_pin) || "").trim()];
        if (!e) return [200, { error: "رقم سري غير صحيح — بالمعاينة جرّب 1111 أو 2222" }];
        const { token, ...employee } = e;
        return [200, { token, employee }];
      }
      if (fn === "verify_session") {
        const e = Object.values(EMPLOYEES).find(x => x.token === (body && body.p_token));
        if (!e) return [200, null];
        const { token, ...employee } = e;
        return [200, employee];
      }
      return [200, {}];
    }
    if (!db[path]) db[path] = [];
    const table = db[path];
    if (method === "GET") {
      const select = u.searchParams.get("select");
      return [200, table.filter(r => matches(r, params)).map(r => pick(r, select))];
    }
    if (method === "DELETE") {
      db[path] = table.filter(r => !matches(r, params));
      persist();
      return [200, []];
    }
    if (method === "PATCH") {
      table.forEach((r, i) => { if (matches(r, params)) table[i] = { ...r, ...body }; });
      persist();
      return [200, []];
    }
    const conflict = (u.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
    const keys = conflict.length ? conflict : KEYS[path];
    const rows = Array.isArray(body) ? body : [body];
    rows.forEach(r => {
      const i = keys ? table.findIndex(x => keys.every(k => String(x[k]) === String(r[k]))) : -1;
      if (i >= 0) table[i] = { ...table[i], ...r };
      else table.push({ id: r.id != null ? r.id : Date.now() + Math.floor(Math.random() * 1000), ...r });
    });
    persist();
    return [201, rows];
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (/supabase\.co\//.test(url)) {
      let body = null;
      try { body = init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
      const [status, json] = handle((init.method || "GET").toUpperCase(), url, body);
      await new Promise(r => setTimeout(r, 120));
      return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
    }
    if (/script\.google\.com|callmebot/.test(url)) {
      return new Response('{"ok":true,"data":null}', { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return realFetch(input, init);
  };

  window.PH_DEMO_RESET = () => { sessionStorage.removeItem(DB_KEY); location.reload(); };
  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.className = "demo-banner";
    bar.innerHTML = '🧪 نسخة معاينة — بيانات وهمية وما بتنحفظ بالنظام الحقيقي · دخول: <b>1111</b> مالك · <b>2222</b> موظف <button type="button">إعادة البيانات</button>';
    bar.querySelector("button").addEventListener("click", () => window.PH_DEMO_RESET());
    document.body.prepend(bar);
    document.body.classList.add("is-demo");
  });
})();
