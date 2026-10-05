// ==================== وحدة إدارة المستخدمين والصلاحيات (Users & Access Control Module) ====================

const ROLE_LABELS = {
  owner: "مالك للنظام (Full Access)",
  admin: "مدير عام تشغيلي (Operations Admin)",
  manager: "مدير فرع (Branch Manager)",
  chef: "شيف مطبخ (Kitchen Chef)",
  branch_staff: "موظف فرع (تشغيل وتسجيل بيانات)",
  employee: "موظف فرع (تشغيل وتسجيل بيانات)",
  viewer: "مراقب وقارئ (Read-Only Viewer)",
  accountant: "محاسب (قراءة فقط لكل البيانات)"
};

let usersListState = [];

async function loadUsersData() {
  const data = await Sync.get("getEmployees", {}, "employees");
  const ROSTER_NAMES = {
    emp_1: "أ.يزيد",
    emp_2: "حسن",
    emp_3: "الشيف عصام",
    emp_4: "أبو يونس",
    emp_5: "العامودي",
    emp_6: "محمد البلول",
    emp_7: "غالب",
            emp_8: "محمد الشرقاوي",
            emp_9: "شكيل"
  };

  if (data && Array.isArray(data) && data.length > 0) {
    usersListState = data.map(u => {
      const isBranchStaff = u.id === "emp_6" || u.id === "emp_7" || u.name === "محمد البلول" || u.name === "غالب";
      return {
        ...u,
        name: ROSTER_NAMES[u.id] || u.name,
        role: isBranchStaff ? "branch_staff" : u.role,
        branches: isBranchStaff ? "عبداللطيف جميل" : u.branches
      };
    });
  } else {
    usersListState = [];
  }
  // الأرقام السرية: للمالك بس، من دالة بقاعدة البيانات تتحقق إن الجلسة مالك
  if (Auth.isOwner() && typeof SupaEngine !== "undefined") {
    try {
      const pins = await SupaEngine.rpc("owner_list_pins", {});
      const byId = Object.fromEntries((pins || []).map(p => [p.id, p.pin]));
      usersListState.forEach(u => { u.pin = byId[u.id] || "—"; });
    } catch (e) {
      usersListState.forEach(u => { u.pin = "⚠"; });
      showToast("⚠ تعذّر جلب الأرقام السرية — " + (e.message || e));
    }
  }
}

async function renderUsersView() {
  const view = document.getElementById("usersView");
  if (!view) return;

  view.innerHTML = '<div class="loader">جاري تحميل قائمة المستخدمين والصلاحيات…</div>';
  await loadUsersData();

  const allBranches = branchList();

  let html = `
    <div class="users-header-panel">
      <div class="users-title-row">
        <div>
          <h2>👥 إدارة المستخدمين وصلاحيات الأدوار</h2>
          <div class="sub-text">التحكم في أدوار موظفي الفروع والرقم السري والصلاحيات التشغيلية</div>
        </div>
      </div>

      <div class="users-roster-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3>📋 قائمة حسابات موظفي برو هاوس</h3>
          <button class="btn gold" onclick="openAddUserModal()">➕ إضافة موظف جديد</button>
        </div>

        <div class="order-table-wrap">
          <table class="order-table">
            <thead>
              <tr>
                <th>اسم الموظف</th>
                <th>الدور والصلاحية</th>
                <th>الرمز السري PIN</th>
                <th>الفروع المصرحة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${usersListState.map((u, idx) => `
                <tr>
                  <td><strong>${u.name}</strong></td>
                  <td><span class="badge ${u.role === 'owner' ? 'ok' : (u.role === 'chef' ? 'warn' : 'neutral')}">${ROLE_LABELS[u.role] || u.role}</span></td>
                  <td><code class="pin-code">${escHtml(u.pin || "••••")}</code></td>
                  <td>${u.branches ? u.branches : 'كل الفروع'}</td>
                  <td>
                    <button class="btn primary" style="padding:4px 8px;font-size:11px;" onclick="editUserRole(${idx})">✏️ تغيير الرقم</button>
                    <button class="btn secondary" style="padding:4px 8px;font-size:11px;" onclick="regenerateUserPin(${idx})">🔄 رقم جديد</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  view.innerHTML = html;
}

function openAddUserModal() {
  showToast("ℹ️ يمكنك إضافة موظف جديد وتخصيص رمزه السري وفروعه المسموحة.");
}

// تغيير الرقم السري فعلياً بقاعدة البيانات (قبل كان يتغيّر بالشاشة بس وما ينحفظ)
async function editUserRole(idx) {
  const u = usersListState[idx];
  if (!u || !Auth.isOwner()) return;
  const newPin = await phPrompt(`الرقم السري الجديد لـ (${u.name}) — من 4 لـ 8 أرقام:`, "");
  if (!newPin || !newPin.trim()) return;
  const pin = newPin.trim();
  if (!/^[0-9]{4,8}$/.test(pin)) { showToast("⚠ الرقم لازم يكون من 4 لـ 8 أرقام"); return; }
  try {
    await SupaEngine.rpc("owner_set_pin", { p_employee_id: u.id, p_pin: pin });
    showToast(`✅ تغيّر الرقم السري لـ ${u.name}`);
    renderUsersView();
  } catch (e) {
    showToast("⚠ ما تغيّر — " + (e.message || e));
  }
}

// رقم عشوائي جديد (٦ أرقام) بضغطة
async function regenerateUserPin(idx) {
  const u = usersListState[idx];
  if (!u || !Auth.isOwner()) return;
  const ok = await phConfirm(`تعطي ${u.name} رقم سري جديد عشوائي؟ الرقم القديم يبطل.`, { ok: "رقم جديد" });
  if (!ok) return;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const pin = String(buf[0] % 1000000).padStart(6, "0");
  try {
    await SupaEngine.rpc("owner_set_pin", { p_employee_id: u.id, p_pin: pin });
    showToast(`✅ رقم ${u.name} الجديد: ${pin}`);
    renderUsersView();
  } catch (e) {
    showToast("⚠ ما تغيّر — " + (e.message || e));
  }
}
