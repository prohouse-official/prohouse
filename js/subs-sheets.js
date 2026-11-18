// أوراق اشتراكات التوصيل (تكرار) لليوم/الأيام المختارة — تنطبع من المتصفح بحبر خفيف:
//   ١) تقرير التغليف بالمربعات (عربي)   ٢) نفسه بالبنقالي
//   ٣) فاتورة الكمية مفصّلة (كل صنف: البروتين والكارب وكم وجبة) عربي   ٤) نفسها بالبنقالي
//   ٥) ورقة ابو يزيد (طلب ثابت مو بتكرار)
// البيانات: takrar_suborders_slim(date) + إعداد takrar_standing_orders (طلبات ثابتة / تعديلات زباين / إلغاء).
// نفس الملف بيشتغل بالتطبيق وبـ Node (لتجهيز الأوراق من برا).
(function (root) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // البنقالي العامي اللي بيفهمه عمال المطبخ — وتحته الاسم الإنجليزي من تكرار
  const BN = {
    "دجاج مشوي": "গ্রিল চিকেন", "دجاج باربكيو": "বিবিকিউ চিকেন", "دجاج برياني": "বিরিয়ানি চিকেন", "دجاج زبدة": "বাটার চিকেন",
    "دجاج بالزبدة": "বাটার চিকেন", "دجاج مسخن": "মুসাখান চিকেন", "دجاج ملوخية": "মুলুখিয়া চিকেন", "دجاج داينمت": "ডায়নামাইট চিকেন",
    "دجاج ديناميت": "ডায়নামাইট চিকেন", "دجاج تندوري": "তান্দুরি চিকেন", "دجاج كاري أمريكي": "আমেরিকান কারি চিকেন", "دجاج كاجون": "কাজুন চিকেন",
    "دجاج فلورنتينا": "চিকেন ফ্লোরেন্টিনা", "دجاج تندر": "চিকেন টেন্ডার", "دجاج تيرياكي": "তেরিয়াকি চিকেন", "دجاج بيستو": "পেস্তো চিকেন",
    "دجاج 65": "চিকেন ৬৫", "شيش طاووق": "শিশ তাউক চিকেন", "تورتيلا روستد تشيكن": "রোস্টেড চিকেন টর্টিলা র‍্যাপ",
    "سمك فيليه كلاسيك": "ক্লাসিক ফিশ ফিলে", "سمك فيليه سبيشال": "স্পেশাল ফিশ ফিলে", "سالمون مشوي": "গ্রিল স্যামন মাছ",
    "جمبري تبنياكي": "টেপানিয়াকি চিংড়ি", "باربكيو ستيك": "বিবিকিউ স্টেক (গরুর মাংস)", "ستيك مشوي بدون صوص": "গ্রিল স্টেক — সস ছাড়া",
    "كاساديا لحم": "বিফ কেসাডিয়া", "سلطة سيزر": "সিজার সালাদ", "سلطة فتوش": "ফাত্তুশ সালাদ", "سلطة روكا": "রোকা সালাদ",
    "سلطة خضراء": "গ্রিন সালাদ", "سلطة ملفوف": "বাঁধাকপির সালাদ", "سلطة كينوا": "কিনোয়া সালাদ", "سلطة كيل بالدجاج": "চিকেন কেল সালাদ",
    "قلابة مع مربى وجبنة": "কাল্লাবা — জ্যাম আর পনির", "ساندويتش تونا": "টুনা স্যান্ডউইচ", "شوربة القرع": "কুমড়ার সুপ",
    "كوكيز": "কুকিজ", "ماتيلدا كيك": "মাটিল্ডা কেক", "رز بالحليب": "রাইস পুডিং (দুধ-ভাত)", "تشيز كيك": "চিজ কেক", "براوني": "ব্রাউনি",
    "براونيز": "ব্রাউনি", "وجبة يحددها الشيف": "শেফের পছন্দের খাবার", "دقوس (سلطة حمراء شبه حارة)": "দাকুস — লাল ঝাল সালাদ",
    "سلطة بروكلي مع زهرة وفلفل رومي ملون": "ব্রকলি, ফুলকপি আর রঙিন ক্যাপসিকামের সালাদ",
    "دجاج بالبامية — صوص طماطم خفيف، والبامية تتبدل بالفلفل الحلو": "চিকেন — হালকা টমেটো সস, ঢেঁড়সের বদলে মিষ্টি ক্যাপসিকাম",
    "دجاج مع فلفل حلو وزهرة وبروكلي وباذنجان وكوسا — بدون رز": "চিকেন + মিষ্টি ক্যাপসিকাম, ফুলকপি, ব্রকলি, বেগুন আর জুকিনি — ভাত ছাড়া"
  };
  const BN_CARB = { "رز أبيض": "সাদা ভাত", "رز برياني": "বিরিয়ানি ভাত", "بطاطس ودجز": "আলুর ওয়েজেস", "بطاطا حلوة": "মিষ্টি আলু", "بطاطس مهروسة": "আলু ভর্তা" };
  const EN_CARB = { "رز أبيض": "White rice", "رز برياني": "Biryani rice", "بطاطس ودجز": "Potato wedges", "بطاطا حلوة": "Sweet potato", "بطاطس مهروسة": "Mashed potato" };
  const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const DAYS_BN = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
  const dayIdx = (d) => new Date(d + "T12:00:00Z").getUTCDay();
  const dmy = (d) => d.split("-").reverse().join("-");

  function normCarb(s) {
    s = String(s || "").trim().replace(/^ال/, "");
    if (!s) return "";
    if (/برياني/.test(s)) return "رز برياني";
    if (/أرز|رز/.test(s)) return "رز أبيض";
    if (/ويدجز|ودجز/.test(s)) return "بطاطس ودجز";
    if (/حلوة/.test(s)) return "بطاطا حلوة";
    if (/مهروس/.test(s)) return "بطاطس مهروسة";
    return s;
  }
  // "دجاج مشوي مع رز أبيض" → الصنف "دجاج مشوي" + الكارب "رز أبيض" (بس إذا اللي بعد «مع» كارب)
  function splitDish(ar, en) {
    const m = String(ar || "").match(/^(.*?)\s+مع\s+((?:ال)?(?:أرز|رز|بطاطس|بطاطا|ويدجز|الويدجز).*)$/);
    const e = String(en || "").replace(/\.$/, "").split(/\s+with\s+(?=.*(rice|wedges|potato))/i)[0];
    return m ? { dish: m[1].trim(), carb: normCarb(m[2]), en: e } : { dish: String(ar || "").trim(), carb: "", en: e };
  }
  const NO_GRAMS = /سلطة|تورتيلا|قلابة|ساندويتش|كاساديا|شوربة|بيض|شكشوكة|توست|حلوم|كروك|كلوب/;
  const kindOf = (cat) => /سناك/.test(cat || "") ? "snack" : /جانبي/.test(cat || "") ? "side" : "main";
  function planNums(plan) {
    const m = String(plan || "").match(/\((\d+)\s*بروتين\s*-\s*(\d+)\s*كارب/);
    return m ? { p: +m[1], c: +m[2] } : { p: null, c: null };
  }
  const active = (st, date) => st && (!st.from || st.from <= date) && (!st.to || st.to >= date);

  // يرجّع زباين التوصيل المؤكدين لليوم، مع تطبيق الطلبات الثابتة
  function buildDay(date, subs, standing) {
    standing = standing || {};
    const list = (subs || []).filter(s => s.status === "confirmed" && s.service !== "pickup")
      .filter(s => !(standing[s.sid] && standing[s.sid].cancel && active(standing[s.sid], date)));
    const out = list.map(s => {
      const st = active(standing[s.sid], date) ? standing[s.sid] : null;
      const { p, c } = planNums(s.plan);
      const items = (s.meals || []).map(m => {
        const sp = splitDish(m.ar, m.en);
        const kind = kindOf(m.cat);
        const protein = kind === "main" && !NO_GRAMS.test(sp.dish);
        let carb = normCarb(m.variant) || sp.carb;
        if (protein && st && st.carb) carb = st.carb;
        return {
          dish: sp.dish, en: sp.en, kind,
          grams: protein ? ((st && st.protein) || p) : null,
          carb: protein || carb ? carb : "", carbG: carb ? ((st && st.carb_g) || c) : null
        };
      });
      return { sid: s.sid, name: s.name, nick: (st && st.nick) || "", plan: s.plan, notes: s.notes || "", items, special: st && st.note ? st.note : "" };
    });
    Object.keys(standing).forEach(sid => {
      const st = standing[sid];
      if (!st.add || !active(st, date)) return;
      const items = (st.meals || []).map(m => ({ dish: m.ar, en: m.en, kind: "main", grams: m.protein || null, carb: m.carb || "", carbG: m.carb_g || null }))
        .concat((st.extras || []).map(x => ({ dish: x.ar, en: x.en, kind: "side", grams: null, carb: "", carbG: null })));
      out.push({ sid, name: st.name, nick: st.nick || "", plan: st.plan || "", notes: "", items, special: "طلب ثابت — مو بتكرار", standing: st });
    });
    return out;
  }

  // ---------- تقرير التغليف (مربعات) ----------
  function itemLineAr(it) {
    const parts = [];
    if (it.grams) parts.push(`بروتين <b>${it.grams}</b> جم`);
    if (it.carb) parts.push(`${esc(it.carb)}${it.carbG ? ` <b>${it.carbG}</b> جم` : ""}`);
    const tag = it.kind === "snack" ? '<span class="tag">(سناك)</span>' : it.kind === "side" ? '<span class="tag">(جانبي)</span>' : "";
    return `<div class="it"><span class="bx"></span><div><b class="dn">${esc(it.dish)}</b> ${tag}${parts.length ? `<div class="sp">${parts.join(" + ")}</div>` : ""}</div></div>`;
  }
  function itemLineBn(it) {
    const parts = [];
    if (it.grams) parts.push(`মাংস <b>${it.grams}</b> গ্রাম`);
    if (it.carb) parts.push(`${esc(BN_CARB[it.carb] || it.carb)}${it.carbG ? ` <b>${it.carbG}</b> গ্রাম` : ""}`);
    const tag = it.kind === "snack" ? '<span class="tag">(স্ন্যাক্স)</span>' : it.kind === "side" ? '<span class="tag">(সাইড)</span>' : "";
    const carbEn = it.carb ? (EN_CARB[it.carb] || "") : "";
    return `<div class="it"><span class="bx"></span><div><b class="dn">${esc(BN[it.dish] || it.en || it.dish)}</b> ${tag}<div class="en">${esc(it.en || "")}${carbEn ? " + " + carbEn : ""}</div>${parts.length ? `<div class="sp">${parts.join(" + ")}</div>` : ""}</div></div>`;
  }
  function planBn(plan) {
    const { p, c } = planNums(plan);
    const n = (String(plan).match(/^(\d+)\s/) || [])[1] || (/وجبتين/.test(plan) ? "2" : "1");
    const sn = /سناكين/.test(plan) ? " + 2টা স্ন্যাক্স" : /سناك/.test(plan) ? " + 1টা স্ন্যাক্স" : "";
    return p ? `${n} বেলা খাবার — মাংস ${p} গ্রাম, কার্ব ${c} গ্রাম${sn}` : esc(plan);
  }
  // مشترك عنده أكتر من يوم: كل يوم لحاله، وإذا الطلب نفسه بكل الأيام منكتبه مرة وحدة
  function cardItems(r, bn) {
    const line = bn ? itemLineBn : itemLineAr;
    const dn = (d) => bn ? DAYS_BN[dayIdx(d)] : DAYS_AR[dayIdx(d)];
    if (!r.days || r.days.length < 2) return r.items.map(line).join("");
    const per = r.days.map(d => r.items.filter(it => it.day === d));
    const key = (arr) => JSON.stringify(arr.map(it => [it.dish, it.grams, it.carb, it.carbG]));
    if (per.every(a => key(a) === key(per[0])))
      return `<div class="dsep">${r.days.map(dn).join(" + ")} — ${bn ? "একই — প্রতিদিন আলাদা ব্যাগ" : "نفس الطلب، كيس لكل يوم"}</div>` + per[0].map(line).join("");
    return per.map((a, k) => `<div class="dsep">${dn(r.days[k])}</div>` + a.map(line).join("")).join("");
  }
  function packingSection(day, rows, bn, label) {
    const w = dayIdx(day);
    const cards = rows.map((r, i) => `
      <div class="card"><div class="hd"><span class="no">${i + 1}</span><div class="nm">${esc(r.name)}${r.nick && bn ? ` (${esc(r.nick)})` : ""}<span class="id">#${esc(r.sid)}${r.days ? ` <small>${r.days.map(d => bn ? DAYS_BN[dayIdx(d)] : DAYS_AR[dayIdx(d)]).join(" + ")}</small>` : ""}</span></div><span class="cnt">${r.items.length}</span></div>
      <div class="pl">${bn ? planBn(r.plan) : esc(r.plan)}</div>
      ${cardItems(r, bn)}
      ${r.notes ? `<div class="nt">${bn ? "নোট" : "ملاحظة"}: ${esc(r.notes)}</div>` : ""}</div>`).join("");
    const count = rows.reduce((a, r) => a + r.items.length, 0);
    const title = bn ? `প্যাকিং লিস্ট — ${label ? label.bn : DAYS_BN[w] + " " + dmy(day)}` : `تقرير التغليف — ${label ? label.ar : DAYS_AR[w] + " " + dmy(day)}`;
    const sub = bn ? `${rows.length} জন কাস্টমার · ${count}টা আইটেম · প্রতিটা বক্স = একজনের ব্যাগ` : `${rows.length} عميل · ${count} صنف · كل مربع = كيس عميل`;
    return `<section class="day"><h2>${title}</h2><div class="sub">${sub}</div><div class="grid">${cards}</div></section>`;
  }

  // ---------- فاتورة الكمية المفصّلة ----------
  function invoiceSection(day, rows, bn, label) {
    const w = dayIdx(day);
    const groups = new Map();
    rows.forEach(r => r.items.forEach(it => {
      if (!groups.has(it.dish)) groups.set(it.dish, { dish: it.dish, en: it.en, kind: it.kind, total: 0, lines: new Map() });
      const g = groups.get(it.dish); g.total++;
      const k = [it.grams || "", it.carb || "", it.carbG || ""].join("|");
      g.lines.set(k, (g.lines.get(k) || 0) + 1);
    }));
    const order = { main: 0, side: 1, snack: 2 };
    const arr = [...groups.values()].sort((a, b) => order[a.kind] - order[b.kind] || b.total - a.total);
    const carbTot = new Map(), protTot = new Map();
    let n = 0, body = "";
    arr.forEach(g => {
      n++;
      const name = bn ? `${esc(BN[g.dish] || g.en || g.dish)}<div class="en">${esc(g.en || "")}</div>` : esc(g.dish);
      const lines = [...g.lines.entries()];
      const detailed = lines.some(([k]) => k !== "||");
      const det = detailed ? lines.map(([k, q]) => {
        const [gr, carb, cg] = k.split("|");
        if (gr) protTot.set(g.dish, (protTot.get(g.dish) || 0) + Number(gr) * q);
        if (carb && cg) carbTot.set(carb, (carbTot.get(carb) || 0) + Number(cg) * q);
        const prot = gr ? (bn ? `মাংস <b>${gr}</b> গ্রাম` : `بروتين <b>${gr}</b> جم`) : "";
        const cb = carb ? `${esc(bn ? (BN_CARB[carb] || carb) : carb)}${cg ? (bn ? ` <b>${cg}</b> গ্রাম` : ` <b>${cg}</b> جم`) : ""}` : (bn ? "কার্ব নেই" : "بدون كارب");
        return `<div class="dl"><span class="x">${q} ×</span> ${[prot, cb].filter(Boolean).join(" + ")}</div>`;
      }).join("") : "";
      body += `<tr><td>${n}</td><td class="nm">${name}</td><td class="det">${det}</td><td class="q">${g.total}</td></tr>`;
    });
    const total = arr.reduce((a, g) => a + g.total, 0);
    const kg = (g) => (g >= 1000 ? (g / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 }) + (bn ? " কেজি" : " كجم") : g + (bn ? " গ্রাম" : " جم"));
    const sumRows = [...protTot.entries()].map(([d, g]) => `<div>${bn ? esc(BN[d] || d) : esc(d)}: <b>${kg(g)}</b></div>`).join("")
      + [...carbTot.entries()].map(([c, g]) => `<div class="cb">${bn ? esc(BN_CARB[c] || c) : esc(c)}: <b>${kg(g)}</b></div>`).join("");
    const title = bn ? `কোন খাবার কত পিস (বিস্তারিত) — ${label ? label.bn : DAYS_BN[w] + " " + dmy(day)}` : `فاتورة الكمية المفصّلة — ${label ? label.ar : DAYS_AR[w] + " " + dmy(day)}`;
    const head = bn ? "<th>#</th><th>খাবার</th><th>বিস্তারিত: কয়টা × মাংস + কার্ব</th><th>কত পিস</th>" : "<th>#</th><th>الصنف</th><th>التفصيل: كم وجبة × البروتين + الكارب</th><th>العدد</th>";
    return `<section class="day"><h2>${title}</h2><div class="sub">${bn ? "প্রতিটা খাবারের নিচে: কত গ্রাম মাংস আর কোন কার্ব কত গ্রাম" : "تحت كل صنف: كم جرام بروتين وأي كارب وكم جرام"}</div>
      <table class="inv"><thead><tr>${head}</tr></thead><tbody>${body}<tr class="t"><td></td><td>${bn ? "মোট" : "المجموع"}</td><td></td><td class="q">${total}</td></tr></tbody></table>
      ${sumRows ? `<h3>${bn ? "মোট ওজন (রান্নার জন্য)" : "إجمالي الأوزان (للطبخ)"}</h3><div class="sum">${sumRows}</div>` : ""}</section>`;
  }

  // ---------- ورقة ابو يزيد ----------
  function standingSection(day, rows) {
    const w = dayIdx(day);
    return rows.filter(r => r.standing).map(r => {
      const st = r.standing;
      return `<section class="day yz"><h2>طلب ${esc(r.name)} — ${DAYS_AR[w]} ${dmy(day)}</h2>
        <div class="sub">${esc(r.special)} · ${esc(st.plan || "")}</div>
        <div class="card big"><div class="hd"><div class="nm">${esc(r.name)}${r.nick ? ` (${esc(r.nick)})` : ""}<span class="id">#${esc(r.sid)}</span></div><span class="cnt">${r.items.length}</span></div>
        ${r.items.map(it => itemLineAr(it) + `<div class="bnl">${esc(BN[it.dish] || "")}${it.carb ? " + " + esc(BN_CARB[it.carb] || it.carb) + (it.carbG ? " " + it.carbG + " গ্রাম" : "") : ""}</div>`).join("")}
        <div class="nt">المندوب: <b>${esc(st.captain || "—")}</b> · وقت التوصيل: <b dir="ltr">${esc(st.window || "—")}</b> · المدينة: <b>${esc(st.city || "—")}</b></div></div></section>`;
    }).join("");
  }

  const CSS = `@page{size:A4;margin:6mm}
*{box-sizing:border-box}body{margin:0;color:#000;background:#fff;font-family:"Noto Sans Arabic","Noto Sans Bengali",Tahoma,Arial,sans-serif}
.part{page-break-before:always}.part:first-child{page-break-before:auto}
.bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #999;padding:8px;text-align:center;z-index:2}
.bar button{font:inherit;font-size:16px;padding:8px 18px;border:1.5px solid #000;border-radius:8px;background:#fff;cursor:pointer}
@media print{.bar{display:none}}
.day{margin:0 0 6mm}.day+.day{margin-top:8mm;border-top:2px solid #000;padding-top:4mm}
h2{font-size:18px;margin:0 0 1px;text-align:center}h3{font-size:15px;margin:10px 0 4px}
.sub{text-align:center;font-size:12px;margin-bottom:4px}
.grid{columns:4;column-gap:2.5mm}.grid .card{display:inline-block;width:100%;margin:0 0 2mm}
.card{break-inside:avoid;border:1.2px solid #555;border-radius:8px;overflow:hidden}
.hd{display:flex;align-items:center;gap:5px;padding:3px 6px;border-bottom:1.2px solid #555}
.no{border:1.4px solid #000;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;font-family:Arial}
.nm{flex:1;font-weight:700;font-size:13.5px;line-height:1.15}.id{display:block;font-weight:700;font-family:Arial;font-size:13px;letter-spacing:.3px;line-height:1.2}.id small{font-family:"Noto Sans Arabic","Noto Sans Bengali",sans-serif;font-size:9.5px;font-weight:400;letter-spacing:0}
.dsep{font-weight:700;font-size:11.5px;line-height:1.25;padding:1px 6px;border-top:1.2px solid #555;text-decoration:underline}
.dy{border:1px solid #000;border-radius:4px;padding:0 5px;font-size:11px;font-weight:700}
.cnt{border:1px solid #555;border-radius:9px;padding:0 6px;font-family:Arial;font-size:11px;font-weight:700}
.pl{font-size:10.5px;padding:2px 6px;border-bottom:1px dashed #999;line-height:1.3}
.it{display:flex;gap:5px;padding:2px 6px;border-top:1px dashed #ccc;font-size:12.5px;line-height:1.2}
.pl+.it{border-top:0}.bx{flex:none;width:13px;height:13px;border:1.3px solid #000;border-radius:2px;margin-top:3px}
.dn{font-weight:700}.sp{font-size:11.5px;line-height:1.15}.en{font-family:Arial;font-size:9.5px}
[lang=bn] .it{font-size:11px;line-height:1.12}[lang=bn] .nm{font-size:12.5px}[lang=bn] .sp{font-size:10.5px}[lang=bn] .pl{font-size:9.5px}[lang=bn] .en{font-size:8.5px;line-height:1.1}[lang=bn] .inv td.nm{font-size:12.5px;line-height:1.1}
.tag{font-size:10px;font-weight:400;white-space:nowrap}
.nt{font-size:12px;padding:4px 7px;border-top:1px solid #999}.bnl{font-size:11px;padding:0 26px 4px}
table{width:100%;border-collapse:collapse}
.inv th{font-size:13px;border-bottom:1.5px solid #000;padding:4px}
.inv td{border-bottom:1px solid #bbb;padding:1px 6px;font-size:13px;text-align:center}
.inv td{border-bottom:1px solid #888;vertical-align:top}.inv td.nm{text-align:start;font-weight:700;font-size:13.5px;line-height:1.25}
.inv td.det{text-align:start}.dl{font-size:12.5px;line-height:1.3}.x{display:inline-block;min-width:30px;font-family:Arial;font-weight:700}.inv td.q{font-weight:700;font-family:Arial;font-size:14px}.inv td.ar{text-align:end}
.inv tr.t td{border-top:1.5px solid #000;font-weight:700;font-size:15px}
.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:1px 6mm;font-size:12.5px;border:1px solid #999;border-radius:6px;padding:4px 8px}.sum b{font-family:Arial}.sum .cb{font-weight:700}
.yz{display:inline-block;width:49%;vertical-align:top;padding:0 1%;margin-top:0!important;border-top:0!important}.yz h2{font-size:16px}.yz .card.big .it{font-size:15px}.yz .nm{font-size:18px}`;

  // days: [{date, subs}] — يرجّع صفحة HTML كاملة جاهزة للطباعة
  function buildDocument(days, standing, opts) {
    opts = opts || {};
    let built = days.map(d => ({ date: d.date, rows: buildDay(d.date, d.subs, standing) }));
    let label = null;
    // دمج الأيام بورقة وحدة: كل الزباين بمربعات (على كل مربع اسم اليوم) وفاتورة وحدة مجموعة
    if (opts.merge && built.length > 1) {
      label = { ar: built.map(b => DAYS_AR[dayIdx(b.date)]).join(" + ") + " " + built.map(b => dmy(b.date)).join(" و "),
                bn: built.map(b => DAYS_BN[dayIdx(b.date)]).join(" + ") + " " + built.map(b => dmy(b.date)).join(" / ") };
      // كل مشترك مربع واحد: طلباته للأيام كلها مع بعض (وجنب كل مجموعة اسم يومها)
      const bySid = new Map();
      built.forEach(b => b.rows.forEach(r => {
        if (!bySid.has(r.sid)) bySid.set(r.sid, { ...r, items: [], days: [] });
        const m = bySid.get(r.sid);
        m.days.push(b.date);
        if (r.notes && !m.notes.includes(r.notes)) m.notes = m.notes ? m.notes + " · " + r.notes : r.notes;
        r.items.forEach(it => m.items.push({ ...it, day: b.date }));
      }));
      const all = [...bySid.values()];
      const yz = built.map(b => ({ date: b.date, rows: b.rows }));
      built = [{ date: built[0].date, rows: all, label, yz }];
    }
    const parts = [
      ["rtl", "ar", built.map(b => packingSection(b.date, b.rows, false, b.label)).join("")],
      ["ltr", "bn", built.map(b => packingSection(b.date, b.rows, true, b.label)).join("")],
      ["rtl", "ar", built.map(b => invoiceSection(b.date, b.rows, false, b.label)).join("")],
      ["ltr", "bn", built.map(b => invoiceSection(b.date, b.rows, true, b.label)).join("")],
      ["rtl", "ar", built.map(b => (b.yz || [b]).map(x => standingSection(x.date, x.rows)).join("")).join("")]
    ].filter(p => p[2]);
    const fonts = opts.fontCss || '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&family=Noto+Sans+Bengali:wght@400;700&display=swap">';
    const bar = opts.noBar ? "" : '<div class="bar"><button onclick="window.print()">🖨️ طباعة / حفظ PDF</button></div>';
    return `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>أوراق الاشتراكات ${days.map(d => dmy(d.date)).join(" + ")}</title>${fonts}<style>${CSS}</style></head><body>${bar}${parts.map(([dir, lang, html]) => `<div class="part" dir="${dir}" lang="${lang}">${html}</div>`).join("")}</body></html>`;
  }

  const api = { buildDay, buildDocument, splitDish, normCarb };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SubsSheets = api;
})(typeof window !== "undefined" ? window : globalThis);
