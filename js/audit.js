// ==================== سجل التغييرات وحالة النظام والنسخ الاحتياطي (Audit & System Health Module) ====================

function logAuditEvent(action, details) {
  const emp = Auth.getEmployee();
  const logObj = {
    id: "LOG-" + Date.now(),
    action: action,
    details: details,
    user: emp ? emp.name : "النظام",
    branch: Branch.get() || "الكل",
    timestamp: new Date().toISOString()
  };

  try {
    const list = JSON.parse(localStorage.getItem("ph_audit_log") || "[]");
    list.unshift(logObj);
    localStorage.setItem("ph_audit_log", JSON.stringify(list.slice(0, 100))); // الاحتفاظ بآخر 100 عملية
  } catch (e) {
    console.error("Audit log storage error", e);
  }
}

function getAuditLogs() {
  try {
    return JSON.parse(localStorage.getItem("ph_audit_log") || "[]");
  } catch (e) {
    return [];
  }
}

async function renderAuditView() {
  const view = document.getElementById("auditView");
  if (!view) return;

  view.innerHTML = '<div class="loader">جاري تجميع سجل العمليات وحالة النظام…</div>';

  const queue = Sync.getQueue();
  const logs = getAuditLogs();
  const photos = await getAllPhotos();

  let html = `
    <div class="audit-header-panel">
      <div class="audit-title-row">
        <div>
          <h2>⚙️ حالة النظام وسجل العمليات والنسخ الاحتياطي</h2>
          <div class="sub-text">مراقبة سلامة البيانات وطابور التزامن وسجل النشاط التشغيلي</div>
        </div>
        <div>
          <button class="btn gold" onclick="exportFullBackupJSON()">⬇ تصدير نسخة احتياطية كاملة</button>
        </div>
      </div>

      <!-- كروت صحة النظام -->
      <div class="system-health-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">
        <div class="kpi-card ok">
          <div class="kpi-v">🟢 متصل</div>
          <div class="kpi-l">حالة الاتصال بالسيرفر</div>
        </div>
        <div class="kpi-card ${queue.length > 0 ? 'warn' : 'ok'}">
          <div class="kpi-v">${queue.length}</div>
          <div class="kpi-l">طابور التزامن المؤجل</div>
        </div>
        <div class="kpi-card ok">
          <div class="kpi-v">${photos.length}</div>
          <div class="kpi-l">الصور المخزنة أوفلاين</div>
        </div>
        <div class="kpi-card ok">
          <div class="kpi-v">v40 (SaaS)</div>
          <div class="kpi-l">إصدار النظام التشغيلي</div>
        </div>
      </div>

      <!-- سجل العمليات والتغييرات -->
      <div class="audit-log-card" style="background:var(--card);border:2.5px solid var(--black);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow);">
        <h3>📜 سجل العمليات والتغييرات الأخيرة (Audit Log)</h3>
        ${logs.length === 0 ? `
          <div class="empty-state">لا توجد عمليات مادة في سجل النشاط بعد.</div>
        ` : `
          <div class="order-table-wrap">
            <table class="order-table">
              <thead>
                <tr>
                  <th>الوقت والتاريخ</th>
                  <th>المستخدم</th>
                  <th>الفرع</th>
                  <th>نوع العملية</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(l => `
                  <tr>
                    <td>${new Date(l.timestamp).toLocaleString(phLocale())}</td>
                    <td><strong>${l.user}</strong></td>
                    <td>${l.branch}</td>
                    <td><span class="badge neutral">${l.action}</span></td>
                    <td>${l.details}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>
  `;

  view.innerHTML = html;
}

function exportFullBackupJSON() {
  const backup = {
    version: "v40",
    exportedAt: new Date().toISOString(),
    items: Items.current,
    settings: typeof currentSettings !== "undefined" ? currentSettings : {},
    auditLogs: getAuditLogs()
  };

  const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", str);
  downloadAnchor.setAttribute("download", `prohouse_backup_${todayStr()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  showToast("✓ تم تصدير النسخة الاحتياطية بنجاح!");
}
