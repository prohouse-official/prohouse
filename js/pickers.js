// ==================== اختيار التاريخ والفرع بتصميم برو هاوس ====================
// بدل حقل التاريخ وقائمة الفرع العاديين: كرت تاريخ كبير (اسم اليوم + التاريخ) بأسهم،
// وأزرار فروع أسود/أصفر. العناصر الأصلية بتضل موجودة ومخفية، فكل الكود القديم بيضل شغّال.
(function () {
  const dayName = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "long", timeZone: "UTC" });
  const dayDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory", { day: "numeric", month: "long", timeZone: "UTC" });
  function relative(iso) {
    const today = todayStr();
    if (iso === today) return "اليوم";
    if (iso === addDaysStr(today, -1)) return "أمس";
    if (iso === addDaysStr(today, 1)) return "بكرا";
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
    const card = document.createElement("label");
    card.className = "ph-date-card";
    card.innerHTML = `<span class="ph-date-icon">📅</span><span class="ph-date-text"><b class="ph-date-day"></b><span class="ph-date-full"></span></span><span class="ph-date-rel"></span>`;
    card.appendChild(input); // الحقل الأصلي فوق الكرت وشفاف: الكبسة بتفتح منتقي التاريخ تبع الجوال
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
