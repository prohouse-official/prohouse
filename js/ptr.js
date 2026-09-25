// ==================== اسحب لتحت عشان تحدّث ====================
// لما الموقع مضاف عالشاشة الرئيسية (وضع التطبيق) ما في زر تحديث متل سفاري،
// فإذا سحبت الصفحة لتحت وهي بأولها بيطلع سهم، وإذا تركتها بعد ما يكمل بتنحفظ الأرقام وبتتحدث الصفحة.
(function () {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const forced = /[?&]ptr=1\b/.test(location.search); // للتجربة بالمتصفح
  if (!standalone && !forced) return;

  const THRESHOLD = 70;
  let startY = null, startX = 0, pull = 0, busy = false, el = null;

  function indicator() {
    if (el) return el;
    el = document.createElement("div");
    el.className = "ptr";
    el.innerHTML = '<span class="ptr-icon">↻</span>';
    document.body.appendChild(el);
    return el;
  }

  function scrolledAncestor(node) {
    for (let n = node; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
      if (n.scrollTop > 0) return true;
    }
    return (document.scrollingElement || document.documentElement).scrollTop > 0;
  }

  function blocked(target) {
    if (busy) return true;
    if (document.querySelector(".ph-dialog, .mobile-open")) return true;
    return !!(target.closest && target.closest("input, textarea, select, [contenteditable]"));
  }

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || blocked(e.target) || scrolledAncestor(e.target)) { startY = null; return; }
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    pull = 0;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    const dx = Math.abs(e.touches[0].clientX - startX);
    if (dy <= 0 || dx > dy) { pull = 0; if (el) el.style.transform = ""; return; }
    pull = Math.min(dy * 0.5, 110);
    const ind = indicator();
    ind.classList.toggle("ready", pull >= THRESHOLD);
    ind.style.opacity = String(Math.min(pull / THRESHOLD, 1));
    ind.style.transform = `translate(-50%, ${pull}px) rotate(${pull * 3}deg)`;
  }, { passive: true });

  document.addEventListener("touchend", async () => {
    if (startY === null) return;
    startY = null;
    if (pull < THRESHOLD) {
      if (el) { el.style.transform = ""; el.style.opacity = "0"; el.classList.remove("ready"); }
      pull = 0;
      return;
    }
    busy = true;
    const ind = indicator();
    ind.classList.add("spinning");
    ind.style.transform = `translate(-50%, ${THRESHOLD}px)`;
    try {
      if (typeof allAutosavers !== "undefined") await Promise.all(allAutosavers.map(a => a.flush()));
    } catch (err) { /* الحفظ الفاشل بيضل بالطابور وبيتعاد */ }
    if (typeof savePlace === "function") savePlace();
    location.reload();
  });
})();
