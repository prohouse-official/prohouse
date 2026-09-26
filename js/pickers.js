// ==================== اختيار التاريخ والفرع بتصميم برو هاوس ====================
// بدل حقل التاريخ وقائمة الفرع العاديين: كرت تاريخ كبير (اسم اليوم + التاريخ) بأسهم،
// وأزرار فروع أسود/أصفر. العناصر الأصلية بتضل موجودة ومخفية، فكل الكود القديم بيضل شغّال.
(function () {
  const dayName = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString(phLocale(), { weekday: "long", timeZone: "UTC" });
  const dayDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString(phLocale(), { day: "numeric", month: "long", timeZone: "UTC" });
  function relative(iso) {
    const today = todayStr();
    if (iso === today) return "اليوم";
    if (iso === addDaysStr(today, -1)) return "أمس";
    if (iso === addDaysStr(today, 1)) return "بكرة";
    return "";
  }

  // ---- كرت التاريخ ----
  function enhanceDateBar(bar) {
    if (bar.dataset.phDate) return;
    const input = bar.querySelector('input[type="date"]');
    if (!input) return;
    bar.dataset.phDate = "1";
    bar.classList.add("ph-datebar");
    const q = (d) => bar.querySelector(`.day-jump [data-day="${d}"]`);
    const prev = q("prev"), next = q("next"), yest = q("yesterday"), today = q("today");

    const row = document.createElement("div");
    row.className = "ph-date-row";
    const card = document.createElement("button");
    card.type = "button";
    card.className = "ph-date-card";
    card.innerHTML = `<span class="ph-date-icon">📅</span><span class="ph-date-text"><b class="ph-date-day"></b><span class="ph-date-full"></span></span><span class="ph-date-rel"></span>`;
    input.classList.add("ph-hidden-select"); // الحقل الأصلي مخفي — التقويم تبعنا بيعبّيه
    const allowFuture = bar.id === "tomorrowDateBar";
    card.addEventListener("click", () => openPhCalendar(input, allowFuture));
    if (prev) { prev.classList.add("ph-date-arrow"); row.appendChild(prev); }
    row.appendChild(card);
    if (next) { next.classList.add("ph-date-arrow"); row.appendChild(next); }
    bar.prepend(row);

    const chips = bar.querySelector(".day-jump");
    if (chips) {
      chips.classList.add("ph-date-chips");
      [yest, today].forEach(b => b && chips.appendChild(b));
      if (!chips.children.length) chips.remove();
    }
    const refresh = () => {
      const v = input.value || todayStr();
      if (input.dataset.shown === v) return;
      input.dataset.shown = v;
      card.querySelector(".ph-date-day").textContent = dayName(v);
      card.querySelector(".ph-date-full").textContent = dayDate(v);
      const rel = relative(v);
      const relEl = card.querySelector(".ph-date-rel");
      relEl.textContent = rel;
      relEl.hidden = !rel;
      if (next) next.disabled = v >= todayStr() && bar.id !== "tomorrowDateBar";
      if (today) today.classList.toggle("active", v === todayStr());
      if (yest) yest.classList.toggle("active", v === addDaysStr(todayStr(), -1));
    };
    input.addEventListener("change", refresh);
    input.addEventListener("input", refresh);
    input._phRefresh = refresh;
    refresh();
  }

  // ---- تقويم برو هاوس (بدل تقويم الجوال) ----
  const WEEK = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
  const pad = (n) => String(n).padStart(2, "0");
  const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

  function openPhCalendar(input, allowFuture) {
    const today = todayStr();
    const selected = input.value || today;
    let y = Number(selected.slice(0, 4)), m = Number(selected.slice(5, 7)) - 1;
    const wrap = document.createElement("div");
    wrap.className = "ph-dialog ph-cal-wrap";
    const close = () => { wrap.classList.add("closing"); setTimeout(() => wrap.remove(), 160); };
    const pick = (iso) => {
      close();
      if (iso === input.value) return;
      input.value = iso;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const render = () => {
      const first = new Date(Date.UTC(y, m, 1));
      const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const lead = first.getUTCDay();
      const title = first.toLocaleDateString(phLocale(), { month: "long", year: "numeric", timeZone: "UTC" });
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push('<span class="ph-cal-empty"></span>');
      for (let d = 1; d <= daysIn; d++) {
        const iso = isoOf(y, m, d);
        const future = !allowFuture && iso > today;
        const cls = ["ph-cal-day", iso === selected ? "sel" : "", iso === today ? "today" : "", future ? "off" : ""].join(" ");
        cells.push(`<button type="button" class="${cls}" data-iso="${iso}" ${future ? "disabled" : ""}>${d}</button>`);
      }
      const nextMonthStart = isoOf(m === 11 ? y + 1 : y, (m + 1) % 12, 1);
      const canNext = allowFuture || nextMonthStart <= today;
      wrap.innerHTML = `
        <div class="ph-cal" role="dialog" aria-modal="true">
          <div class="ph-cal-head">
            <button type="button" class="ph-cal-nav" data-nav="-1" aria-label="الشهر السابق">→</button>
            <b class="ph-cal-title">${title}</b>
            <button type="button" class="ph-cal-nav" data-nav="1" aria-label="الشهر الجاي" ${canNext ? "" : "disabled"}>←</button>
          </div>
          <div class="ph-cal-week">${WEEK.map(w => `<span>${w}</span>`).join("")}</div>
          <div class="ph-cal-grid">${cells.join("")}</div>
          <div class="ph-cal-foot">
            <button type="button" class="ph-cal-today">📅 اليوم</button>
            <button type="button" class="ph-cal-cancel">إلغاء</button>
          </div>
        </div>`;
      wrap.querySelectorAll(".ph-cal-day:not(.off)").forEach(b => b.addEventListener("click", () => pick(b.dataset.iso)));
      wrap.querySelectorAll(".ph-cal-nav").forEach(b => b.addEventListener("click", () => {
        m += Number(b.dataset.nav);
        if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
        render();
      }));
      wrap.querySelector(".ph-cal-today").addEventListener("click", () => pick(today));
      wrap.querySelector(".ph-cal-cancel").addEventListener("click", close);
    };
    render();
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("open"));
  }

  // ---- أزرار الفروع ----
  function isBranchSelect(sel) {
    if (sel.dataset.phBranch || sel.closest(".custom-rec-modal-box")) return false;
    const values = Array.from(sel.options).map(o => o.value).filter(Boolean);
    if (!values.length || typeof branchList !== "function") return false;
    const all = branchList();
    return values.every(v => all.includes(v));
  }

  function enhanceBranchSelect(sel) {
    sel.dataset.phBranch = "1";
    const pills = document.createElement("div");
    pills.className = "ph-branch-pills";
    const render = () => {
      const opts = Array.from(sel.options).filter(o => o.value);
      pills.innerHTML = opts.map(o => `<button type="button" data-v="${o.value.replace(/"/g, "&quot;")}" class="${o.value === sel.value ? "active" : ""}">🏪 ${o.textContent}</button>`).join("");
      pills.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
        if (sel.value === b.dataset.v) return;
        sel.value = b.dataset.v;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        render();
      }));
    };
    sel.classList.add("ph-hidden-select");
    sel.insertAdjacentElement("afterend", pills);
    sel.addEventListener("change", render);
    sel._phRender = render;
    render();
  }

  function scan(root) {
    (root.querySelectorAll ? root : document).querySelectorAll(".datebar").forEach(enhanceDateBar);
    (root.querySelectorAll ? root : document).querySelectorAll("select").forEach(sel => { if (isBranchSelect(sel)) enhanceBranchSelect(sel); });
  }

  function start() {
    scan(document);
    new MutationObserver(muts => {
      for (const m of muts) m.addedNodes.forEach(n => { if (n.nodeType === 1) scan(n.parentNode || n); });
    }).observe(document.body, { childList: true, subtree: true });
    // لما الكود يغيّر قيمة الحقل مباشرة (بدون حدث) — منحدّث الكرت والأزرار
    setInterval(() => {
      document.querySelectorAll(".ph-datebar:not(.hidden) input[type=date]").forEach(i => i._phRefresh && i._phRefresh());
      document.querySelectorAll("select[data-ph-branch]").forEach(sel => {
        const active = sel.nextElementSibling && sel.nextElementSibling.querySelector("button.active");
        if (sel._phRender && (!active || active.dataset.v !== sel.value)) sel._phRender();
      });
    }, 700);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
