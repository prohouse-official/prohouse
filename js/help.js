// ==================== طريقة الاستخدام (مختصر ومصوّر) ====================
// خطوات قليلة وكلام قليل. كل خطوة مربوطة بشاشة وبتظهر بس للي عنده صلاحية عليها.
const HELP_SECTIONS = [
  { tab: "receiving", icon: "📦", title: "الصبح: الاستلام", img: "05-receiving-item",
    lines: ["اوزن كل صنف واكتب الرقم.", "ما وصل؟ اضغط «لم يصل». بالأخير «💾 حفظ»."] },
  { tab: "opening", icon: "📷", title: "التوثيق بالصور", img: "07-docs",
    lines: ["3 مرات باليوم: صوّر كل منطقة.", "بالأخير اضغط «✓ اعتماد»."] },
  { tab: "remaining", icon: "🌙", title: "آخر الدوام: المتبقي", img: "09-remaining-item",
    lines: ["اوزن اللي باقي واكتبه.", "انرمى شي؟ اضغط 🗑. بالأخير «💾 حفظ»."] },
  { tab: "custody", icon: "💰", title: "إغلاق العهدة", img: "11-custody",
    lines: ["اكتب الكاش والشبكة والمصاريف.", "اضغط «🔒 إغلاق العهدة»."] },
  { tab: "tomorrow", icon: "📋", title: "طلبية الغد", img: "21-tomorrow",
    lines: ["اختر الفرع واضغط «⚡ تطبيق كل المقترحات».", "عدّل اللي تبيه واضغط «💾 حفظ»."] },
  { tab: "report", icon: "📈", title: "التقارير", img: "25-report",
    lines: ["اختر النوع والشهر واضغط «عرض»."] },
  { tab: "settings", icon: "⚙️", title: "الإعدادات والموظفين", img: "28-settings",
    lines: ["الموظفين، الأصناف، والتذكيرات."] }
];

function renderHelpView() {
  const el = document.getElementById("helpView");
  if (!el) return;
  const allowed = (t) => typeof tabAllowed !== "function" || tabAllowed(t);
  const secs = HELP_SECTIONS.filter(s => allowed(s.tab));
  el.innerHTML = `
    <div class="help-head">
      <h2>📘 طريقة الاستخدام</h2>
      <p>ضعت؟ الرئيسية تقولك «الخطوة الجاية» — اضغطها.</p>
    </div>
    ${secs.map((s, i) => `
      <section class="help-sec">
        <h3><span class="help-num">${i + 1}</span><span>${s.icon} ${s.title}</span></h3>
        ${s.lines.map(t => `<p class="help-line">${t}</p>`).join("")}
        <img class="help-shot" src="assets/guide/${s.img}.jpg" alt="" loading="lazy" width="390" height="780">
      </section>`).join("")}
    <p class="help-foot">كل شي ينحفظ لحاله. أي مشكلة كلّم المدير.</p>`;
}
