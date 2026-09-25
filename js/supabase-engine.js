// ==================== محرك Supabase فائق السرعة لـ Pro House ====================
// الإصدار المقوّى v3.1 — يشتغل مع supabase_hardening.sql
// كل طلب بيرسل هيدر x-session-token (جلسة الموظف)، والمصادقة صارت داخل الداتابيس.
// ما في أي وصول بدون جلسة صالحة — لا قراءة ولا كتابة ولا حذف.

const SupaEngine = (() => {
  const PIN_SALT = "prohouse-2026-salt";

  async function sha256(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(PIN_SALT + str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // توكن الجلسة الحالي — الداتابيس بيتحقق منه بكل طلب عبر هيدر x-session-token
  function sessionToken() {
    try {
      if (typeof Auth !== "undefined" && Auth.getToken) return Auth.getToken();
      return localStorage.getItem("ph_token") || "";
    } catch (e) {
      return "";
    }
  }

  function getHeaders(extraHeaders) {
    return {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      "x-session-token": sessionToken(),
      "Prefer": "return=representation",
      ...(extraHeaders || {})
    };
  }

  async function query(endpoint, options = {}) {
    const url = SUPABASE_URL + "/rest/v1/" + endpoint;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let res;
    try {
      res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: getHeaders(options.headers)
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) {
      // رسائل الخطأ العربية اللي بترجع من الداتابيس (raise exception) بينعرضوا زي ما هني
      let msg = "";
      try {
        const errJson = await res.json();
        msg = errJson.message || errJson.error || errJson.hint || "";
      } catch (e) { /* مو JSON */ }
      throw new Error(msg || `Supabase error [${res.status}]`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // أرقام بتترجع من الداتابيس: فاضي = null (بلا قيمة)، عدا هيك رقم
  function numOrNull(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  // --- تسجيل الدخول والمصادقة ---
  // الشيك الفعلي للرقم السري صار داخل دالة login بالداتابيس (ما حد يقدر يقرأ جدول
  // الموظفين ولا يشوف الهاشات من المتصفح)
  async function login(pin) {
    const data = await query("rpc/login", {
      method: "POST",
      body: JSON.stringify({ p_pin: String(pin == null ? "" : pin) })
    });
    if (!data || !data.token) throw new Error("تعذر تسجيل الدخول");
    const emp = data.employee || {};
    const ROSTER_NAMES = {
      emp_1: "أ.يزيد",
      emp_2: "حسن",
      emp_3: "الشيف عصام",
      emp_4: "أبو يونس",
      emp_5: "العامودي",
      emp_6: "محمد البلول",
      emp_7: "غالب"
    };
    const finalName = ROSTER_NAMES[emp.id] || (emp.name && !emp.name.includes("?") ? emp.name : "موظف");
    const isBranchUser = emp.id === "emp_6" || emp.id === "emp_7" || emp.role === "employee" || emp.role === "branch_staff";
    const finalRole = isBranchUser ? "branch_staff" : emp.role;
    return {
      token: data.token,
      employee: {
        id: emp.id,
        name: finalName,
        role: finalRole,
        branches: isBranchUser ? ["عبداللطيف جميل"] : (emp.branches || "").split(",").map(s => s.trim()).filter(Boolean)
      }
    };
  }

  async function changePin(employee, { currentPin, newPin }) {
    await query("rpc/change_pin", {
      method: "POST",
      body: JSON.stringify({ p_current: String(currentPin || ""), p_new: String(newPin || "") })
    });
    return { ok: true };
  }

  // --- قراءة الأصناف ---
  async function getItems(all) {
    const filter = all ? "" : "&active=eq.true";
    const res = await query(`items?select=*${filter}&order=sort_order.asc`);
    return (res || []).map(r => ({
      id: r.id,
      category: r.category,
      name: r.name,
      unit: r.unit,
      hasCustomName: r.has_custom_name,
      branches: r.branches,
      active: r.active,
      sortOrder: r.sort_order,
      updatedAt: r.updated_at
    }));
  }

  async function saveItem(payload) {
    const id = payload.id || (crypto.randomUUID ? crypto.randomUUID() : "it_" + Date.now());
    const body = {
      id,
      category: payload.category,
      name: payload.name,
      unit: payload.unit,
      has_custom_name: !!payload.hasCustomName,
      branches: payload.branches || "",
      active: payload.active !== false,
      sort_order: payload.sortOrder || 0,
      updated_at: new Date().toISOString()
    };
    await query("items", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(body)
    });
    return { id };
  }

  async function deleteItem(payload) {
    await query(`items?id=eq.${payload.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false, updated_at: new Date().toISOString() })
    });
    return { id: payload.id };
  }

  // --- العصائر: إدارة القائمة (كانت ناقصة — الحفظ كان بيرجع للباك اند القديم) ---
  async function saveJuice(payload) {
    const id = payload.id || (crypto.randomUUID ? crypto.randomUUID() : "ju_" + Date.now());
    const body = {
      id,
      name: payload.name,
      unit: payload.unit || "",
      tabsense_name: payload.tabsenseName || payload.tabsense_name || "",
      branches: payload.branches || "",
      active: payload.active !== false,
      sort_order: payload.sortOrder || 0,
      updated_at: new Date().toISOString()
    };
    await query("juices", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(body)
    });
    return { id };
  }

  async function deleteJuice(payload) {
    await query(`juices?id=eq.${payload.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false, updated_at: new Date().toISOString() })
    });
    return { id: payload.id };
  }

  // ضمان وجود كل الأصناف في جدول items لتفادي رفض الحفظ بسبب قيود المفتاح الأجنبي (Foreign Key)
  async function ensureItemsExist(items, branch) {
    if (!items || !items.length) return;
    try {
      const dbItems = await query("items?select=id");
      const existingIds = new Set((dbItems || []).map(i => i.id));
      const missing = [];
      const seen = new Set();
      items.forEach(it => {
        const id = it.itemId || it.id;
        if (!id || existingIds.has(id) || seen.has(id)) return;
        seen.add(id);
        missing.push({
          id: id,
          category: it.category || "عام",
          name: it.itemName || it.name || id,
          unit: it.unit || "جرام",
          has_custom_name: true,
          branches: branch || "",
          active: true,
          sort_order: 99,
          updated_at: new Date().toISOString()
        });
      });

      if (missing.length > 0) {
        await query("items", {
          method: "POST",
          headers: { "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify(missing)
        });
      }
    } catch (e) {
      console.warn("ensureItemsExist note:", e.message || e);
    }
  }

  // --- مخطّطات مشتركة بين القراءات ---
  function mapEntry(e) {
    return {
      date: e.date,
      branch: e.branch,
      itemId: e.item_id,
      itemName: e.item_name,
      unit: e.unit,
      confirmed: e.confirmed,
      received: e.received,
      returned: e.returned,
      cookName: e.cook_name,
      notes: e.notes,
      remaining: e.remaining,
      remainingWeight: e.remaining_weight,
      remainingSauce: e.remaining_sauce,
      savedAt: e.saved_at
    };
  }

  function mapMeta(m) {
    if (!m) return null;
    let removedItemIds = [];
    if (m.removed_item_ids) {
      if (Array.isArray(m.removed_item_ids)) {
        removedItemIds = m.removed_item_ids;
      } else if (typeof m.removed_item_ids === "string") {
        try { removedItemIds = JSON.parse(m.removed_item_ids); } catch(e){}
      }
    }
    if ((!removedItemIds || !removedItemIds.length) && m.payments_report_link && typeof m.payments_report_link === "string" && m.payments_report_link.startsWith("{")) {
      try {
        const parsed = JSON.parse(m.payments_report_link);
        if (parsed && Array.isArray(parsed._removedItemIds)) {
          removedItemIds = parsed._removedItemIds;
        }
      } catch(e){}
    }
    return {
      date: m.date,
      branch: m.branch,
      employeeName: m.employee_name,
      salesReportLink: m.sales_report_link,
      paymentsReportLink: m.payments_report_link,
      removedItemIds: Array.isArray(removedItemIds) ? removedItemIds : [],
      savedAt: m.saved_at,
      updatedAt: m.updated_at
    };
  }

  // --- تقرير الاستلام وميتا اليوم (DailyEntries & DayMeta) ---
  async function getDay(date, branch) {
    const [entries, meta] = await Promise.all([
      query(`daily_entries?select=*&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`),
      query(`day_meta?select=*&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`)
    ]);

    const mappedMeta = meta && meta[0] ? mapMeta(meta[0]) : null;
    const removedItemIds = (mappedMeta && Array.isArray(mappedMeta.removedItemIds)) ? mappedMeta.removedItemIds : [];

    return {
      date,
      branch,
      meta: mappedMeta,
      items: (entries || []).map(mapEntry),
      removedItemIds: removedItemIds
    };
  }

  async function saveDay(payload) {
    const { date, branch, items, employeeName, salesReportLink, paymentsReportLink, removedItemIds } = payload;
    const remIds = Array.isArray(removedItemIds) ? removedItemIds : [];

    // حفظ أو تحديث الميتا وقائمة الأصناف المستبعدة
    let existingMetaRes = null;
    try {
      existingMetaRes = await query(`day_meta?select=*&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`);
    } catch(e) {}

    const existingMetaRow = (existingMetaRes && existingMetaRes[0]) || {};
    let currentChecklist = {};
    let paymentsLink = paymentsReportLink !== undefined ? paymentsReportLink : (existingMetaRow.payments_report_link || "");
    if (paymentsLink && paymentsLink.startsWith("{")) {
      try { currentChecklist = JSON.parse(paymentsLink); } catch(e){}
    }

    if (remIds.length > 0 || currentChecklist._removedItemIds) {
      currentChecklist._removedItemIds = remIds;
      paymentsLink = JSON.stringify(currentChecklist);
    }

    const metaBody = {
      date,
      branch,
      employee_name: employeeName !== undefined ? employeeName : (existingMetaRow.employee_name || ""),
      sales_report_link: salesReportLink !== undefined ? salesReportLink : (existingMetaRow.sales_report_link || ""),
      payments_report_link: paymentsLink,
      updated_at: new Date().toISOString()
    };

    if (existingMetaRow.hasOwnProperty("removed_item_ids") || remIds.length >= 0) {
      metaBody.removed_item_ids = remIds;
    }

    try {
      await query("day_meta", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify(metaBody)
      });
    } catch (err) {
      if (metaBody.removed_item_ids !== undefined) {
        delete metaBody.removed_item_ids;
        await query("day_meta", {
          method: "POST",
          headers: { "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify(metaBody)
        }).catch(e => console.warn("day_meta save retry error:", e));
      }
    }

    // إزالة الأصناف المستبعدة نهائياً من daily_entries لهذا اليوم والفرع
    if (remIds.length > 0) {
      const idList = remIds.map(id => `"${encodeURIComponent(id)}"`).join(",");
      await query(`daily_entries?date=eq.${date}&branch=eq.${encodeURIComponent(branch)}&item_id=in.(${idList})`, {
        method: "DELETE"
      }).catch(e => console.warn("delete removed daily_entries error:", e));
    }

    if (items && items.length) {
      await ensureItemsExist(items, branch);
      const rows = items.map(it => ({
        date,
        branch,
        item_id: it.itemId,
        item_name: it.itemName || "",
        unit: it.unit || "",
        confirmed: !!it.confirmed,
        received: it.received === "" || it.received == null ? 0 : Number(it.received),
        returned: it.returned === "" || it.returned == null ? 0 : Number(it.returned),
        cook_name: it.cookName || "",
        notes: it.notes || "",
        saved_at: new Date().toISOString()
      }));

      // on_conflict: التحديث يصير على مفتاح (اليوم + الفرع + الصنف)
      await query("daily_entries?on_conflict=date,branch,item_id", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify(rows)
      });
    }

    return { date, branch, savedAt: new Date().toISOString() };
  }

  // حفظ تقرير المتبقي: بيحدّث أعمدة المتبقي فقط على نفس صف اليوم
  async function saveRemainingReport(payload) {
    const { date, branch, items, removedItemIds } = payload;
    const remIds = Array.isArray(removedItemIds) ? removedItemIds : [];

    if (remIds.length > 0) {
      // إزالة الأصناف المستبعدة من daily_entries لهذا اليوم والفرع
      const idList = remIds.map(id => `"${encodeURIComponent(id)}"`).join(",");
      await query(`daily_entries?date=eq.${date}&branch=eq.${encodeURIComponent(branch)}&item_id=in.(${idList})`, {
        method: "DELETE"
      }).catch(e => console.warn("delete remaining daily_entries error:", e));

      // حفظ قائمة الاستبعاد في day_meta
      try {
        let existingMetaRes = await query(`day_meta?select=*&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`);
        const existingMetaRow = (existingMetaRes && existingMetaRes[0]) || {};
        let currentChecklist = {};
        let paymentsLink = existingMetaRow.payments_report_link || "";
        if (paymentsLink && paymentsLink.startsWith("{")) {
          try { currentChecklist = JSON.parse(paymentsLink); } catch(e){}
        }
        currentChecklist._removedItemIds = remIds;

        const metaBody = {
          date,
          branch,
          employee_name: existingMetaRow.employee_name || "",
          sales_report_link: existingMetaRow.sales_report_link || "",
          payments_report_link: JSON.stringify(currentChecklist),
          updated_at: new Date().toISOString()
        };
        if (existingMetaRow.hasOwnProperty("removed_item_ids") || remIds.length >= 0) {
          metaBody.removed_item_ids = remIds;
        }

        try {
          await query("day_meta", {
            method: "POST",
            headers: { "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify(metaBody)
          });
        } catch(err) {
          delete metaBody.removed_item_ids;
          await query("day_meta", {
            method: "POST",
            headers: { "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify(metaBody)
          }).catch(e => console.warn("saveRemainingReport day_meta retry error:", e));
        }
      } catch(e) {
        console.warn("saveRemainingReport day_meta error:", e);
      }
    }

    if (items && items.length) {
      await ensureItemsExist(items, branch);
      const rows = items.map(it => ({
        date,
        branch,
        item_id: it.itemId,
        item_name: it.itemName || "",
        unit: it.unit || "",
        remaining: numOrNull(it.remainingWeight || it.remaining),
        remaining_weight: numOrNull(it.remainingWeight),
        remaining_sauce: numOrNull(it.remainingSauce),
        notes: it.notes || "",
        saved_at: new Date().toISOString()
      }));

      await query("daily_entries?on_conflict=date,branch,item_id", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify(rows)
      });
    }
    return { date, branch, savedAt: new Date().toISOString() };
  }

  // --- طلبيات الغد (TomorrowOrders) ---
  async function getTomorrowOrder(date, branch) {
    const res = await query(`tomorrow_orders?select=*&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`);
    return (res || []).map(r => ({
      date: r.date,
      branch: r.branch,
      itemId: r.item_id,
      itemName: r.item_name,
      unit: r.unit,
      qty: r.qty,
      notes: r.notes,
      employeeName: r.employee_name
    }));
  }

  async function saveTomorrowOrder(payload) {
    const { date, branch, items, employeeName } = payload;

    // استبدال كامل لطلبية نفس اليوم والفرع (نفس سلوك النظام القديم) — عشان لو
    // الموظف شال صنف من الطلبية، ما يضل صف قديم إله بيرجع يبيّن بالمقارنة
    await query(`tomorrow_orders?date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`, { method: "DELETE" });

    if (items && items.length) {
      await ensureItemsExist(items, branch);
      const rows = items.map(it => ({
        date,
        branch,
        item_id: it.itemId,
        item_name: it.itemName || "",
        unit: it.unit || "",
        qty: it.qty === "" || it.qty == null ? 0 : Number(it.qty),
        notes: it.notes || "",
        employee_name: employeeName || "",
        saved_at: new Date().toISOString()
      }));

      await query("tomorrow_orders", {
        method: "POST",
        body: JSON.stringify(rows)
      });
    }
    return { date, branch, savedAt: new Date().toISOString() };
  }

  // --- سجل الهدر (WasteLog) ---
  async function getWasteReport(date, branch) {
    const res = await query(`waste_log?select=*&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`);
    return {
      date,
      branch,
      items: (res || []).map(r => ({
        id: r.id,
        date: r.date,
        branch: r.branch,
        itemId: r.item_id,
        itemName: r.item_name,
        unit: r.unit,
        qty: r.qty,
        reason: r.reason,
        notes: r.notes,
        employeeName: r.employee_name,
        timestamp: r.timestamp
      }))
    };
  }

  async function saveWasteReport(payload) {
    const { date, branch, items } = payload;
    if (items && items.length) {
      const rows = items.map(it => ({
        id: it.id || (crypto.randomUUID ? crypto.randomUUID() : "wst_" + Date.now() + Math.random()),
        date,
        branch,
        item_id: it.itemId || "",
        item_name: it.itemName || "",
        unit: it.unit || "",
        qty: it.qty === "" || it.qty == null ? 0 : Number(it.qty),
        reason: it.reason || "",
        notes: it.notes || "",
        employee_name: it.employeeName || "",
        timestamp: it.timestamp || "",
        saved_at: new Date().toISOString()
      }));

      await query(`waste_log?date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`, { method: "DELETE" });
      await query("waste_log", {
        method: "POST",
        body: JSON.stringify(rows)
      });
    }
    return { date, branch, count: (items || []).length };
  }

  // --- جرد العصيرات (Juices & Counts) ---
  async function getJuices(all) {
    const filter = all ? "" : "&active=eq.true";
    const res = await query(`juices?select=*${filter}&order=sort_order.asc`);
    return (res || []).map(r => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      tabsenseName: r.tabsense_name,
      branches: r.branches,
      active: r.active,
      sortOrder: r.sort_order
    }));
  }

  async function getJuiceDay(date, branch) {
    const prevDate = addDaysStr(date, -1);
    const [todayItems, prevItems, sales] = await Promise.all([
      query(`juice_counts?select=*&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`),
      query(`juice_counts?select=*&date=eq.${prevDate}&branch=eq.${encodeURIComponent(branch)}`),
      query(`juice_sales?select=*&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`)
    ]);

    const prevCounted = {};
    (prevItems || []).forEach(r => { prevCounted[r.juice_id] = r.counted; });

    return {
      date,
      branch,
      items: (todayItems || []).map(r => ({
        juiceId: r.juice_id,
        juiceName: r.juice_name,
        unit: r.unit,
        opening: r.opening,
        added: r.added,
        sold: r.sold,
        counted: r.counted,
        notes: r.notes,
        employeeName: r.employee_name
      })),
      prevCounted,
      sales: (sales || []).map(r => ({ productName: r.product_name, qty: r.qty }))
    };
  }

  async function saveJuiceDay(payload) {
    const { date, branch, items, employeeName } = payload;
    if (items && items.length) {
      const rows = items.map(it => ({
        date,
        branch,
        juice_id: it.juiceId,
        juice_name: it.juiceName || "",
        unit: it.unit || "",
        opening: Number(it.opening) || 0,
        added: Number(it.added) || 0,
        sold: Number(it.sold) || 0,
        counted: Number(it.counted) || 0,
        notes: it.notes || "",
        employee_name: employeeName || "",
        saved_at: new Date().toISOString()
      }));

      await query("juice_counts?on_conflict=date,branch,juice_id", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify(rows)
      });
    }
    return { date, branch, savedAt: new Date().toISOString() };
  }

  // --- الإعدادات والموظفين ---
  async function getSettings() {
    const res = await query("settings?select=*");
    const out = {};
    (res || []).forEach(r => { out[r.key] = r.value; });
    return out;
  }

  async function saveSettings(payload) {
    const entries = Object.keys(payload).map(k => ({
      key: k,
      value: String(payload[k]),
      updated_at: new Date().toISOString()
    }));
    await query("settings", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(entries)
    });
    return getSettings();
  }

  // ملاحظة: عمود الرقم السري (pin) ما عاد قابل للقراءة من المتصفح نهائياً —
  // حتى لو حاول حد، الداتابيس بترفض الطلب
  async function getEmployees() {
    const res = await query("employees?select=id,name,role,branches,active&active=eq.true");
    return (res || []).map(r => ({
      id: r.id,
      name: r.name,
      pin: "••••",
      role: r.role,
      branches: r.branches,
      active: r.active
    }));
  }

  // --- المبيعات والتقارير الشاملة ---
  async function getSalesByCategory(start, end, branch) {
    const branchFilter = branch ? `&branch=eq.${encodeURIComponent(branch)}` : "";
    const res = await query(`tabsense_sales?select=*&date=gte.${start}&date=lte.${end}${branchFilter}`);
    return (res || []).map(r => ({
      date: r.date,
      branch: r.branch,
      category: r.category,
      qty: r.qty
    }));
  }

  async function getReport(start, end, branchFilter) {
    let bf = "";
    if (branchFilter && branchFilter.length) {
      const branchesArr = Array.isArray(branchFilter) ? branchFilter : branchFilter.split(",");
      bf = `&branch=in.(${branchesArr.map(b => `"${b.trim()}"`).join(",")})`;
    }

    const [entries, metaRows, tabsense, juices] = await Promise.all([
      query(`daily_entries?select=*&date=gte.${start}&date=lte.${end}${bf}`),
      query(`day_meta?select=*&date=gte.${start}&date=lte.${end}${bf}`),
      query(`tabsense_sales?select=*&date=gte.${start}&date=lte.${end}${bf}`),
      query(`juice_sales?select=*&date=gte.${start}&date=lte.${end}${bf}`)
    ]);

    const byDateBranch = {};
    (entries || []).forEach(r => {
      const k = r.date + "||" + r.branch;
      if (!byDateBranch[k]) byDateBranch[k] = [];
      byDateBranch[k].push(mapEntry(r));
    });

    const days = Object.keys(byDateBranch).sort().map(k => {
      const [date, branch] = k.split("||");
      const m = (metaRows || []).find(x => x.date === date && x.branch === branch) || null;
      return {
        date,
        branch,
        meta: m ? { employeeName: m.employee_name, salesReportLink: m.sales_report_link } : null,
        items: byDateBranch[k]
      };
    });

    // حساب الإجماليات
    const totalsMap = {};
    (entries || []).forEach(r => {
      if (!totalsMap[r.item_id]) {
        totalsMap[r.item_id] = { itemId: r.item_id, itemName: r.item_name, unit: r.unit, totalReceived: 0, totalReturned: 0, dayCount: 0 };
      }
      const t = totalsMap[r.item_id];
      const rec = Number(r.received) || 0;
      const ret = Number(r.returned) || 0;
      t.totalReceived += rec;
      t.totalReturned += ret;
      if (rec > 0) t.dayCount++;
    });

    const totals = Object.keys(totalsMap).map(id => {
      const t = totalsMap[id];
      t.avgDaily = t.dayCount > 0 ? t.totalReceived / t.dayCount : null;
      t.returnPct = t.totalReceived > 0 ? t.totalReturned / t.totalReceived : null;
      t.flagged = t.returnPct !== null && t.returnPct >= 0.30;
      return t;
    });

    return {
      days,
      totals,
      flaggedCount: totals.filter(t => t.flagged).length,
      tabsenseSales: tabsense || [],
      juiceSales: juices || []
    };
  }

  // أعلى نسب الإرجاع — نسخة خفيفة (بس جدول الإدخالات + الإعدادات)
  async function getFlaggedItems(start, end, branchFilter) {
    let bf = "";
    if (branchFilter && branchFilter.length) {
      const branchesArr = Array.isArray(branchFilter) ? branchFilter : branchFilter.split(",");
      bf = `&branch=in.(${branchesArr.map(b => `"${b.trim()}"`).join(",")})`;
    }

    const [entries, settings] = await Promise.all([
      query(`daily_entries?select=item_id,item_name,unit,received,returned&date=gte.${start}&date=lte.${end}${bf}`),
      getSettings()
    ]);

    const returnThreshold = settings && settings.returnThresholdPct !== undefined && settings.returnThresholdPct !== ""
      ? Number(settings.returnThresholdPct) : 0.30;

    const totalsMap = {};
    (entries || []).forEach(r => {
      if (!totalsMap[r.item_id]) {
        totalsMap[r.item_id] = { itemId: r.item_id, itemName: r.item_name, unit: r.unit, totalReceived: 0, totalReturned: 0, dayCount: 0 };
      }
      const t = totalsMap[r.item_id];
      const rec = Number(r.received) || 0;
      const ret = Number(r.returned) || 0;
      t.totalReceived += rec;
      t.totalReturned += ret;
      if (rec > 0) t.dayCount++;
    });

    const flagged = [];
    Object.keys(totalsMap).forEach(id => {
      const t = totalsMap[id];
      t.avgDaily = t.dayCount > 0 ? t.totalReceived / t.dayCount : null;
      t.returnPct = t.totalReceived > 0 ? t.totalReturned / t.totalReceived : null;
      t.flagged = t.returnPct !== null && t.returnPct >= returnThreshold;
      if (t.flagged) flagged.push(t);
    });
    return flagged;
  }

  // --- الداشبورد المجمّع: كل الفروع بنداء واحد ---
  // نفس شكل البيانات اللي الواجهة بتتوقعها من الباك اند القديم، فالداشبورد بيضل
  // سريع بعد الهجرة وما بيلزمه يلمس الشيت.
  async function getDashboard(date) {
    const prevDate = addDaysStr(date, -1);
    const nextDate = addDaysStr(date, 1);

    const [todayRows, yestRows, metaRows, tomorrowRows, jCounts, jSales, settings] = await Promise.all([
      query(`daily_entries?select=*&date=eq.${date}`),
      query(`daily_entries?select=*&date=eq.${prevDate}`),
      query(`day_meta?select=*&date=in.(${date},${prevDate})`),
      query(`tomorrow_orders?select=*&date=eq.${nextDate}`),
      query(`juice_counts?select=*&date=in.(${date},${prevDate})`),
      query(`juice_sales?select=*&date=eq.${date}`),
      getSettings()
    ]);

    // الفروع من الإعدادات + أي فرع ظهر بالبيانات
    const branches = [];
    const addBranch = (b) => { if (b && branches.indexOf(b) === -1) branches.push(b); };
    ((settings && settings.branches) || DEFAULT_BRANCHES_FALLBACK).split(",").forEach(b => addBranch(b.trim()));
    [].concat(todayRows || [], tomorrowRows || []).forEach(r => addBranch(r.branch));

    function dayShape(rowSource, d, b) {
      const meta = (metaRows || []).find(m => m.date === d && m.branch === b) || null;
      return {
        date: d,
        branch: b,
        meta: mapMeta(meta),
        items: (rowSource || []).filter(r => r.date === d && r.branch === b).map(mapEntry)
      };
    }

    const out = {};
    branches.forEach(b => {
      const prevCounted = {};
      (jCounts || []).filter(r => r.date === prevDate && r.branch === b)
        .forEach(r => { prevCounted[r.juice_id] = r.counted; });

      out[b] = {
        today: dayShape(todayRows, date, b),
        yesterday: dayShape(yestRows, prevDate, b),
        tomorrow: (tomorrowRows || []).filter(r => r.date === nextDate && r.branch === b).map(r => ({
          date: r.date,
          branch: r.branch,
          itemId: r.item_id,
          itemName: r.item_name,
          unit: r.unit,
          qty: r.qty,
          notes: r.notes,
          employeeName: r.employee_name
        })),
        juiceDay: {
          date,
          branch: b,
          items: (jCounts || []).filter(r => r.date === date && r.branch === b).map(r => ({
            juiceId: r.juice_id,
            juiceName: r.juice_name,
            unit: r.unit,
            opening: r.opening,
            added: r.added,
            sold: r.sold,
            counted: r.counted,
            notes: r.notes,
            employeeName: r.employee_name
          })),
          prevCounted,
          sales: (jSales || []).filter(r => r.date === date && r.branch === b).map(r => ({ productName: r.product_name, qty: r.qty }))
        }
      };
    });

    return { date, branches: out };
  }

  // --- صور الفحص البصري والمعاينة الميدانية (Inspection Photos) ---
  async function getInspectionPhotos(date, branch) {
    try {
      const res = await query(`day_meta?select=sales_report_link&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`);
      if (!res || !res.length || !res[0].sales_report_link) return [];
      const raw = res[0].sales_report_link;
      if (raw.startsWith("[") || raw.startsWith("{")) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.photos)) return parsed.photos;
      }
      return [];
    } catch (e) {
      console.warn("getInspectionPhotos error:", e);
      return [];
    }
  }

  async function saveInspectionPhoto(photoObj) {
    const { date, branch } = photoObj;
    if (!date || !branch) return photoObj;
    let existingPhotos = await getInspectionPhotos(date, branch);
    const idx = existingPhotos.findIndex(p => p.id === photoObj.id || (photoObj.sessionId && p.sessionId === photoObj.sessionId && p.checkpointId === photoObj.checkpointId));
    if (idx >= 0) {
      existingPhotos[idx] = photoObj;
    } else {
      existingPhotos.push(photoObj);
    }
    if (existingPhotos.length > 50) {
      existingPhotos = existingPhotos.slice(-50);
    }
    await query("day_meta", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({
        date,
        branch,
        sales_report_link: JSON.stringify(existingPhotos),
        employee_name: photoObj.employeeName || "",
        updated_at: new Date().toISOString()
      })
    });
    return photoObj;
  }

  async function deleteInspectionPhoto(photoId, date, branch) {
    if (!date || !branch) return [];
    let existingPhotos = await getInspectionPhotos(date, branch);
    existingPhotos = existingPhotos.filter(p => p.id !== photoId);

    await query("day_meta", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({
        date,
        branch,
        sales_report_link: JSON.stringify(existingPhotos),
        updated_at: new Date().toISOString()
      })
    });
    return existingPhotos;
  }

  // --- إغلاق العهدة ---
  async function getCustody(date, branch) {
    const rows = await query(`custody_closings?select=*&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`);
    return (rows && rows[0]) || null;
  }

  async function saveCustody(row) {
    await query("custody_closings?on_conflict=date,branch", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(row)
    });
  }

  // مبيعات تابسنس حسب طريقة الدفع — الداتابيس بترجّعها للمالك بس
  async function getPayments(date, branch) {
    return (await query(`tabsense_payments?select=*&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`)) || [];
  }

  // نسخة من صف صنف بيوم معيّن قبل ما ينشال — لزر التراجع
  async function getEntryRows(date, branch, itemId) {
    return (await query(`daily_entries?select=*&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}&item_id=eq.${encodeURIComponent(itemId)}`)) || [];
  }

  async function restoreEntryRows(rows) {
    if (!rows || !rows.length) return;
    await query("daily_entries?on_conflict=date,branch,item_id", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(rows.map(({ id, ...row }) => row))
    });
  }

  // الفروع اللي سجّلت استلام فعلي من تاريخ معيّن — لنعرف مين شغّال عالنظام
  async function getActiveBranches(since) {
    const rows = await query(`daily_entries?select=branch&date=gte.${since}&received=gt.0`);
    return [...new Set((rows || []).map(r => r.branch).filter(Boolean))];
  }

  // --- قائمة الفحص والافتتاح اليومي (Daily Shift Checklist) ---
  async function getChecklist(date, branch) {
    try {
      const res = await query(`day_meta?select=payments_report_link&date=eq.${date}&branch=eq.${encodeURIComponent(branch)}`);
      if (!res || !res.length || !res[0].payments_report_link) return {};
      const raw = res[0].payments_report_link;
      if (raw.startsWith("{")) {
        return JSON.parse(raw);
      }
      return {};
    } catch (e) {
      console.warn("getChecklist error:", e);
      return {};
    }
  }

  async function saveChecklist(payload) {
    const { date, branch, shift, data } = payload;
    if (!date || !branch) return;
    let existing = await getChecklist(date, branch) || {};
    existing[shift || "morning"] = data;
    await query("day_meta", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({
        date,
        branch,
        payments_report_link: JSON.stringify(existing),
        employee_name: (data && data.updatedBy) || "",
        updated_at: new Date().toISOString()
      })
    });
    return existing;
  }

  return {
    login,
    changePin,
    getItems,
    saveItem,
    deleteItem,
    saveJuice,
    deleteJuice,
    getDay,
    getActiveBranches,
    getEntryRows,
    getCustody,
    saveCustody,
    getPayments,
    restoreEntryRows,
    saveDay,
    saveRemainingReport,
    getTomorrowOrder,
    saveTomorrowOrder,
    getWasteReport,
    saveWasteReport,
    getJuices,
    getJuiceDay,
    saveJuiceDay,
    getSettings,
    saveSettings,
    getEmployees,
    getSalesByCategory,
    getReport,
    getFlaggedItems,
    getDashboard,
    getInspectionPhotos,
    saveInspectionPhoto,
    deleteInspectionPhoto,
    getChecklist,
    saveChecklist
  };
})();
