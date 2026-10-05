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
  const DB_KEY = "ph_demo_db_v3";
  const riyadh = (offset) => {
    const d = new Date(Date.now() + offset * 86400000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d);
  };
  const EMPLOYEES = {
    "1111": { id: "emp_2", name: "حسن", role: "owner", branches: "الروضة,الشاطئ," + AJL, token: "demo-owner" },
    "2222": { id: "emp_6", name: "محمد البلول", role: "employee", branches: AJL, token: "demo-staff" },
    "3333": { id: "emp_5", name: "العامودي", role: "manager", branches: "الشاطئ", token: "demo-manager" },
    "4444": { id: "emp_8", name: "محمد الشرقاوي", role: "accountant", branches: "", token: "demo-accountant" },
    "5555": { id: "emp_9", name: "شكيل", role: "employee", branches: "الروضة", token: "demo-rawdah-staff" }
  };

  function seed() {
    // [id, تصنيف، اسم، وحدة، اختياري]
    const cat = [
      ["d1", "دجاج", "دجاج تندر", "جرام"], ["d2", "دجاج", "دجاج باربكيو", "جرام"], ["d3", "دجاج", "دجاج بينك صوص", "جرام"],
      ["d11", "دجاج", "دجاج الشيف 1", "جرام", 1], ["d12", "دجاج", "دجاج الشيف 2", "جرام", 1], ["d13", "دجاج", "دجاج الشيف 3", "جرام", 1],
      ["d21", "دجاج", "دجاج بيكانت", "جرام", 1], ["d22", "دجاج", "دجاج بالكريمة", "جرام", 1], ["d23", "دجاج", "دجاج تكا", "جرام", 1],
      ["l1", "لحم", "لحم الشيف 1", "جرام"], ["l2", "لحم", "لحم الشيف 2", "جرام", 1], ["l3", "لحم", "لحم الشيف 3", "جرام", 1],
      ["s1", "بحري", "سالمون", "جرام"], ["s3", "بحري", "سمك الشيف 1", "جرام"], ["s4", "بحري", "جمبري داينمت", "جرام"],
      ["s6", "بحري", "سمك الشيف 2", "جرام", 1], ["s7", "بحري", "سمك الشيف 3", "جرام", 1], ["s2", "بحري", "جمبري بروفنسال", "جرام", 1],
      ["f1", "فطور", "ساندويتش روستيد", "ساندويتش"], ["f2", "فطور", "ساندويتش تونا", "ساندويتش"], ["f3", "فطور", "بيض مسلوق", "حبة"],
      ["sl1", "السلطات", "سلطة سيزر", "طاسة"], ["sl2", "السلطات", "سلطة فتوش", "طاسة"],
      ["k1", "كارب", "رز أبيض", "1/2"], ["h1", "الحلويات", "كوكيز", "حبة"]
    ];
    const items = cat.map(([id, category, name, unit, opt], i) => ({ id, category, name, unit, has_custom_name: /الشيف \d/.test(name), optional: !!opt, branches: "", active: true, sort_order: i, unit_factor: 1 }));
    const daily_entries = [];
    const tabsense_sales = [];
    [-1, -2].forEach(off => {
      const date = riyadh(off);
      items.filter(it => !it.optional).forEach((it, i) => {
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
      settings: [{ key: "branches", value: "الروضة,الشاطئ," + AJL }, { key: "chef_report_employees", value: "emp_5" }],
      employees: Object.values(EMPLOYEES).map(({ token, ...e }) => ({ ...e, active: true })),
      tabsense_payments: [
        { date: riyadh(-1), branch: AJL, channel: "Cash", transactions: 6, amount: 212.4 },
        { date: riyadh(-1), branch: AJL, channel: "Mada", transactions: 79, amount: 1498.5 }
      ],
      custody_closings: [
        { date: riyadh(-1), branch: "الشاطئ", opening_float: 500, opened_by: "العامودي", cash_counted: 640, card_total: 1200, closed_at: new Date().toISOString(),
          expenses: [{ id: "e1", amount: 46, note: "خبز من البقالة", receipt: "", by: "العامودي", at: new Date().toISOString() },
            { id: "e2", amount: 18.5, note: "أكياس نايلون", receipt: "", by: "العامودي", at: new Date().toISOString() }] },
        { date: riyadh(-2), branch: AJL, opening_float: 300, opened_by: "محمد البلول", expenses: [{ id: "e3", amount: 35, note: "ليمون ونعناع", receipt: "", by: "محمد البلول", at: new Date().toISOString() }] }
      ],
      purchase_invoices: demoPurchases(),
      push_subscriptions: [], reminder_settings: []
    };
  }
  // فواتير مشتريات وهمية بأخطاء متعمدة (وحدة ناقصة، ضريبة غلط، مكررة) عشان نجرّب فحوصات المحاسب
  function demoPurchases() {
    const L = (name, qty, unit, unit_price, category) => ({ name, qty, unit, unit_price, total: Math.round(qty * unit_price * 100) / 100, category });
    const inv = (id, off, supplier, no, lines, extra) => {
      const sub = Math.round(lines.reduce((a, l) => a + l.total, 0) * 100) / 100;
      const vat = Math.round(sub * 0.15 * 100) / 100;
      return { id, source: "google_form", source_ref: "form_" + id, kind: "invoice", invoice_date: riyadh(off), invoice_no: no, supplier, branch: "الروضة",
        subtotal: sub, vat, total: Math.round((sub + vat) * 100) / 100, lines, receipt: "", status: "pending", created_by: "يزيد", created_at: new Date().toISOString(), ...(extra || {}) };
    };
    return [
      inv("p1", -1, "مؤسسة اللحوم الطازجة", "4471", [L("صدور دجاج", 40, "كيلو", 21.5, "لحوم"), L("لحم بقري مفروم", 12, "كيلو", 48, "لحوم")]),
      inv("p2", -1, "سوق الخضار المركزي", "A-982", [L("طماطم", 3, "كرتون", 38, "خضراوات"), L("خس", 20, "حبة", 3.5, "خضراوات"), L("بصل", 10, "", 4, "خضراوات")]),
      inv("p3", -2, "مستودع البهارات", "311", [L("بابريكا", 2, "كيلو", 55, "بهارات"), L("كمون", 1, "كيلو", 42, "بهارات")], { vat: 20 }),
      inv("p4", -2, "شركة التغليف الحديثة", "7720", [L("علب بلاستيك ٧٥٠ مل", 4, "كرتون", 95, "بلاستيك وتغليف"), L("أكياس توصيل", 2, "كرتون", 60, "")]),
      inv("p5", -3, "مؤسسة اللحوم الطازجة", "4471", [L("صدور دجاج", 40, "كيلو", 21.5, "لحوم")], { status: "approved", reviewed_by: "محمد الشرقاوي", reviewed_at: new Date().toISOString() }),
      inv("p6", -3, "النظافة المثالية", "C-55", [L("معقم أسطح", 6, "علبة", 22, "منظفات"), L("كلور", 4, "لتر", 9.5, "منظفات")], { status: "approved", reviewed_by: "محمد الشرقاوي", reviewed_at: new Date().toISOString() }),
      inv("p7", -4, "بقالة الحي", "", [L("سكر", 2, "كيس", 18, "بقالة"), L("زيت دوار الشمس", 3, "لتر", 14, "بقالة")], { status: "rejected", review_note: "رقم الفاتورة مو واضح بالصورة — صوّرها مرة ثانية" })
    ];
  }
  let db;
  try { db = JSON.parse(sessionStorage.getItem(DB_KEY)); } catch (e) { db = null; }
  if (!db) db = seed();
  const persist = () => { try { sessionStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} };

  const KEYS = {
    daily_entries: ["date", "branch", "item_id"], day_meta: ["date", "branch"], items: ["id"], settings: ["key"], juices: ["id"],
    juice_counts: ["date", "branch", "juice_id"], employees: ["id"], tomorrow_orders: ["date", "branch", "item_id"], custody_closings: ["date", "branch"], purchase_invoices: ["id"],
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
      if (op === "not" && v.startsWith("in.") && parseList(v).includes(String(cell))) return false;
      if (op === "is" && !((v === "null" && cell == null) || String(cell) === v)) return false;
    }
    return true;
  }
  function pick(row, select) {
    if (!select || select === "*") return row;
    const photosCount = () => { try { const a = JSON.parse(row.sales_report_link || "[]"); return Array.isArray(a) ? a.length : 0; } catch (e) { return 0; } };
    return Object.fromEntries(select.split(",").map(c => c.trim()).filter(Boolean).map(c => [c, c === "photos_count" ? photosCount() : row[c]]));
  }

  function handle(method, url, body) {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/rest\/v1\//, "");
    const params = [...u.searchParams.entries()];
    if (path.startsWith("rpc/")) {
      const fn = path.slice(4);
      if (fn === "login") {
        const e = EMPLOYEES[String((body && body.p_pin) || "").trim()];
        if (!e) return [200, { error: "رقم سري غير صحيح — في المعاينة جرّب 1111 أو 2222" }];
        const { token, ...employee } = e;
        return [200, { token, employee }];
      }
      // الأرقام السرية بالمعاينة: أرقام المعاينة نفسها
      if (fn === "owner_list_pins") return [200, Object.entries(EMPLOYEES).map(([pin, e]) => ({ id: e.id, pin }))];
      if (fn === "owner_set_pin") return [200, { ok: true }];
      if (fn === "purchase_save") {
        const row = (body && body.p_row) || {};
        const list = db.purchase_invoices = db.purchase_invoices || [];
        const i = list.findIndex(x => x.id === row.id);
        if (i >= 0) list[i] = { ...list[i], ...row }; else list.push(row);
        persist();
        return [200, row];
      }
      if (fn === "verify_session") {
        const e = Object.values(EMPLOYEES).find(x => x.token === (body && body.p_token));
        if (!e) return [200, null];
        const { token, ...employee } = e;
        return [200, employee];
      }
      // نسخة مبسطة من الدوال الذرّية تبع الصور وقائمة الفحص
      if (fn === "upsert_inspection_photo" || fn === "delete_inspection_photo" || fn === "save_checklist_shift") {
        const { p_date, p_branch } = body || {};
        let row = db.day_meta.find(m => m.date === p_date && m.branch === p_branch);
        if (!row) { row = { date: p_date, branch: p_branch }; db.day_meta.push(row); }
        if (fn === "save_checklist_shift") {
          let cur = {}; try { cur = JSON.parse(row.payments_report_link || "{}"); } catch (e) {}
          cur[body.p_shift || "morning"] = body.p_data || {};
          row.payments_report_link = JSON.stringify(cur); persist(); return [200, cur];
        }
        let photos = []; try { photos = JSON.parse(row.sales_report_link || "[]"); } catch (e) {}
        if (fn === "delete_inspection_photo") photos = photos.filter(x => String(x.id) !== String(body.p_id));
        else { const ph = body.p_photo; photos = photos.filter(x => !(x.id === ph.id || (ph.sessionId && x.sessionId === ph.sessionId && x.checkpointId === ph.checkpointId))); photos.push(ph); }
        row.sales_report_link = JSON.stringify(photos); persist();
        return [200, fn === "delete_inspection_photo" ? photos : body.p_photo];
      }
      return [200, {}];
    }
    if (!db[path]) db[path] = [];
    const table = db[path];
    if (method === "GET") {
      const select = u.searchParams.get("select");
      const offset = Number(u.searchParams.get("offset")) || 0;
      const limit = u.searchParams.has("limit") ? Number(u.searchParams.get("limit")) : Infinity;
      let rows = table.filter(r => matches(r, params));
      const ord = (u.searchParams.get("order") || "").split(",")[0].split(".");
      if (ord[0] && ord[1] === "desc") rows = rows.slice().sort((a, b) => String(b[ord[0]]).localeCompare(String(a[ord[0]])));
      return [200, rows.slice(offset, offset + limit).map(r => pick(r, select))];
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
    if (/supabase\.co\/functions\/v1\/photos/.test(url)) {
      // تخزين الصور بالمعاينة: الصورة بتضل dataUrl بس منحطها كـ url متل النظام الحقيقي
      let body = {}; try { body = JSON.parse(init.body || "{}"); } catch (e) {}
      let out;
      if (body.action === "upload") {
        const { dataUrl, ...rest } = body.photo || {};
        const photo = { ...rest, url: rest.url || dataUrl, path: "demo/" + rest.id };
        handle("POST", "https://demo.supabase.co/rest/v1/rpc/upsert_inspection_photo", { p_date: body.date, p_branch: body.branch, p_photo: photo });
        out = { photo };
      } else if (body.action === "delete") {
        out = { photos: handle("POST", "https://demo.supabase.co/rest/v1/rpc/delete_inspection_photo", { p_date: body.date, p_branch: body.branch, p_id: body.id })[1] };
      } else if (body.action === "receipt") {
        // الفاتورة بالمعاينة: بتنحفظ بالذاكرة بس
        const path = body.date + "/demo" + Date.now() + ".jpg";
        db.receipts = db.receipts || {}; db.receipts[path] = body.dataUrl; persist();
        out = { path };
      } else if (body.action === "receipt_url") {
        out = { url: (db.receipts || {})[body.path] || "about:blank" };
      } else out = { moved: 0 };
      return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (/supabase\.co\/functions\/v1\/forms/.test(url)) {
      let body = {}; try { body = JSON.parse(init.body || "{}"); } catch (e) {}
      const { form, date, branch, ...payload } = body;
      db.form_submissions = db.form_submissions || [];
      db.form_submissions.push({ form, date, branch, payload, ok: true, sent_at: new Date().toISOString() }); persist();
      return new Response(JSON.stringify({ ok: true, payload }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (/supabase\.co\/functions\//.test(url)) {
      return new Response('{"sent":1,"gone":0,"failed":0}', { status: 200, headers: { "Content-Type": "application/json" } });
    }
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
    bar.innerHTML = '🧪 نسخة معاينة — بيانات وهمية ولا تُحفظ في النظام الحقيقي · دخول: <b>1111</b> مالك · <b>2222</b> موظف · <b>4444</b> محاسب <button type="button">إعادة البيانات</button>';
    bar.querySelector("button").addEventListener("click", () => window.PH_DEMO_RESET());
    document.body.prepend(bar);
    document.body.classList.add("is-demo");
  });
})();
