// ==================== وحدة كاميرا الجوال والمعاينة البصرية والتخزين (Mobile Camera & Inspection Module) ====================

const JAMEEL_INSPECTION_CHECKPOINTS = [
  { id: "bar_fridge_1", name: "بار التقديم الثلاجة 1", icon: "❄️", required: true },
  { id: "bar_fridge_2", name: "بار التقديم الثلاجة 2", icon: "🧊", required: true },
  { id: "sweets_zone", name: "منطقة الحلا", icon: "🍰", required: true },
  { id: "snacks_zone", name: "منطقة السناكات", icon: "🥨", required: true },
  { id: "pos_zone", name: "منطقة الكاشير", icon: "💻", required: true },
  { id: "coffee_zone", name: "منطقة القهوة", icon: "☕", required: true },
  { id: "coffee_machine", name: "ماكينة القهوة", icon: "⚙️", required: true },
  { id: "oven_prep", name: "الفرن ومكان تجهيز الساندويتشات", icon: "🥪", required: true }
];

const DEFAULT_INSPECTION_CHECKPOINTS = [
  { id: "entrance", name: "مدخل الفرع واللوحة", icon: "🚪", required: true },
  { id: "counter", name: "منطقة الكاشير والـ POS", icon: "💻", required: true },
  { id: "kitchen", name: "المطبخ الرئيسي", icon: "🍳", required: true },
  { id: "prep", name: "منطقة التحضير والتصفيح", icon: "🥗", required: true },
  { id: "fridges", name: "ثلاجات التبريد", icon: "❄️", required: true },
  { id: "freezers", name: "فريزرات التجميد", icon: "🧊", required: true },
  { id: "storage", name: "المخزن الجاف والعبوات", icon: "📦", required: true },
  { id: "delivery", name: "منطقة التسليم واستلام الطلبات", icon: "🛵", required: true }
];

// أماكن التصوير الافتراضية لكل فرع (لو ما تعدّلت من الشاشة). الروضة: ٦ أماكن — نفس معرّفات القائمة العامة
// عشان أي صور قديمة تضل مربوطة بمكانها
const BRANCH_CHECKPOINT_DEFAULTS = {
  "الروضة": ["counter", "kitchen", "prep", "fridges", "freezers", "storage"]
    .map(id => DEFAULT_INSPECTION_CHECKPOINTS.find(c => c.id === id))
};
function checkpointsSettingKey(branch) { return "photo_checkpoints:" + branch; }

// أماكن التصوير: المحفوظة بالإعدادات للفرع (مدير الفرع يعدّلها) ← الافتراضي للفرع ← القائمة العامة
function getCheckpointsForBranch(branchName) {
  const raw = typeof currentSettings !== "undefined" && branchName ? currentSettings[checkpointsSettingKey(branchName)] : "";
  if (raw) {
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length) return list.filter(c => c && c.id && c.name).map(c => ({ icon: "📷", required: true, ...c }));
    } catch (e) { /* قيمة تالفة: نرجع للافتراضي */ }
  }
  if (branchName && BRANCH_CHECKPOINT_DEFAULTS[branchName]) return BRANCH_CHECKPOINT_DEFAULTS[branchName];
  if (branchName && branchName.includes("عبداللطيف جميل")) {
    return JAMEEL_INSPECTION_CHECKPOINTS;
  }
  return DEFAULT_INSPECTION_CHECKPOINTS;
}

// المالك أو مدير الفرع نفسه يقدر يعدّل أماكن التصوير
function canEditCheckpoints(branch) {
  if (typeof Auth === "undefined" || (Auth.isReadOnly && Auth.isReadOnly())) return false;
  if (Auth.isOwner()) return true;
  return Auth.role() === "manager" && (Auth.branches() || []).includes(branch);
}

function openCheckpointsEditor(branch) {
  if (!canEditCheckpoints(branch)) return;
  let rows = getCheckpointsForBranch(branch).map(c => ({ id: c.id, name: c.name, icon: c.icon || "📷" }));
  document.getElementById("cpEditor")?.remove();
  const wrap = document.createElement("div");
  wrap.id = "cpEditor";
  wrap.className = "custom-rec-modal-backdrop";
  const render = () => {
    wrap.innerHTML = `
      <div class="custom-rec-modal-box">
        <div class="custom-rec-modal-header">
          <h3>✏️ أماكن التصوير — ${escHtml(branch)}</h3>
          <button type="button" class="custom-rec-modal-close" data-act="close">✕</button>
        </div>
        <div class="custom-rec-modal-body">
          <div class="cp-edit-hint">اكتب اسم كل مكان. تقدر تضيف وتشيل (أقل شي مكان واحد).</div>
          ${rows.map((r, i) => `
            <div class="cp-edit-row">
              <span class="cp-edit-num">${i + 1}</span>
              <input type="text" value="${escHtml(r.name)}" data-i="${i}" placeholder="اسم المكان">
              <button type="button" class="cust-exp-del" data-del="${i}" ${rows.length <= 1 ? "disabled" : ""} aria-label="شيل">✕</button>
            </div>`).join("")}
          <button type="button" class="cust-add" data-act="add">➕ أضف مكان</button>
          <div class="custom-rec-modal-actions">
            <button type="button" class="btn-save" data-act="save">💾 حفظ الأماكن</button>
            <button type="button" class="btn-cancel" data-act="close">إلغاء</button>
          </div>
        </div>
      </div>`;
    wrap.querySelectorAll("input[data-i]").forEach(inp => inp.addEventListener("input", () => { rows[Number(inp.dataset.i)].name = inp.value; }));
    wrap.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", () => { rows.splice(Number(btn.dataset.del), 1); render(); }));
  };
  wrap.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act || (e.target === wrap ? "close" : "");
    if (act === "close") wrap.remove();
    if (act === "add") {
      rows.push({ id: "cp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: "", icon: "📷" });
      render();
      const inputs = wrap.querySelectorAll("input[data-i]"); inputs[inputs.length - 1]?.focus();
    }
    if (act === "save") {
      const clean = rows.map(r => ({ ...r, name: String(r.name || "").trim() })).filter(r => r.name);
      if (!clean.length) { showToast("⚠ لازم مكان واحد على الأقل"); return; }
      const value = JSON.stringify(clean);
      try {
        await SupaEngine.saveSettings({ [checkpointsSettingKey(branch)]: value });
        currentSettings[checkpointsSettingKey(branch)] = value;
        wrap.remove();
        showToast(`✅ انحفظت ${clean.length} أماكن تصوير`);
        if (typeof renderOpeningView === "function") renderOpeningView();
      } catch (err) {
        showToast("⚠ ما انحفظ — " + (err.message || err));
      }
    }
  });
  render();
  document.body.appendChild(wrap);
}

let dbInstance = null;
let currentCameraStream = null;
let currentActiveCheckpoint = null;
let currentActiveCallback = null;

// تهيئة قاعدة بيانات IndexedDB لتخزين الصور أوفلاين
function openMediaDatabase() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    if (!window.indexedDB) {
      console.warn("IndexedDB not supported in this browser. Falling back to local storage.");
      return resolve(null);
    }
    const req = indexedDB.open("prohouse_media_db", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("photos")) {
        const store = db.createObjectStore("photos", { keyPath: "id" });
        store.createIndex("branch", "branch", { unique: false });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("session", "sessionId", { unique: false });
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => resolve(null);
  });
}

// الصورة وصلت السيرفر — منعلّمها عشان ما نرجع نفحصها ونرفعها كل مرة
async function markPhotoUploaded(id, saved) {
  const db = await openMediaDatabase();
  if (!db || !id) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction("photos", "readwrite");
      const store = tx.objectStore("photos");
      const req = store.get(id);
      req.onsuccess = () => {
        if (!req.result) return;
        const extra = saved && saved.url ? { url: saved.url, path: saved.path } : {};
        if (!req.result.uploaded || extra.url) store.put({ ...req.result, ...extra, uploaded: true });
      };
      tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
    } catch (e) { resolve(); }
  });
}

// ذاكرة الجوال: الصور المرفوعة منخلّيها ٣ أيام بس، واللي ما انرفعت ٣٠ يوم.
// قبل كانت تضل للأبد وكل فتحة للتوثيق تقرأها كلها وتفحصها مع السيرفر يوم يوم.
const LOCAL_PHOTO_KEEP_UPLOADED = 3, LOCAL_PHOTO_KEEP_PENDING = 30;
function isStaleLocalPhoto(p) {
  const d = p.date || (p.timestamp ? String(p.timestamp).slice(0, 10) : "");
  if (!d) return false;
  return d < addDaysStr(todayStr(), -(p.uploaded ? LOCAL_PHOTO_KEEP_UPLOADED : LOCAL_PHOTO_KEEP_PENDING));
}
function pruneLocalPhotos(db, list) {
  const stale = list.filter(isStaleLocalPhoto);
  if (db && stale.length) {
    try {
      const tx = db.transaction("photos", "readwrite");
      stale.forEach(p => tx.objectStore("photos").delete(p.id));
    } catch (e) { /* منرجع نحاول المرة الجاي */ }
  }
  return list.filter(p => !isStaleLocalPhoto(p));
}

async function savePhotoRecord(photoData) {
  const db = await openMediaDatabase();
  photoData.id = photoData.id || "IMG-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  photoData.timestamp = photoData.timestamp || new Date().toISOString();
  photoData.uploaded = photoData.uploaded || false;

  // 1. حذف أي صورة قديمة لنفس نقطة الفحص والجلسة لتفادي التكرار عند إعادة التصوير
  if (db && photoData.sessionId && photoData.checkpointId) {
    try {
      await new Promise((resolve) => {
        const tx = db.transaction("photos", "readwrite");
        const store = tx.objectStore("photos");
        const req = store.getAll();
        req.onsuccess = () => {
          (req.result || []).forEach(p => {
            if (p.sessionId === photoData.sessionId && p.checkpointId === photoData.checkpointId && p.id !== photoData.id) {
              store.delete(p.id);
            }
          });
          store.put(photoData);
          resolve(photoData);
        };
        req.onerror = () => { store.put(photoData); resolve(photoData); };
      });
    } catch (e) {
      savePhotoToLocalStorageFallback(photoData);
    }
  } else if (db) {
    try {
      await new Promise((resolve) => {
        const tx = db.transaction("photos", "readwrite");
        const store = tx.objectStore("photos");
        store.put(photoData);
        tx.oncomplete = () => resolve(photoData);
        tx.onerror = () => resolve(savePhotoToLocalStorageFallback(photoData));
      });
    } catch (e) {
      savePhotoToLocalStorageFallback(photoData);
    }
  } else {
    savePhotoToLocalStorageFallback(photoData);
  }

  // 2. نسخة بالـ LocalStorage بس إذا الجوال ما بيدعم IndexedDB
  // (قبل كانت كل صورة تنحفظ بالمكانين، و٥٠ صورة كانت تعبّي نص ذاكرة المتصفح)
  if (!db) try {
    let list = JSON.parse(localStorage.getItem("ph_local_photos") || "[]");
    if (photoData.sessionId && photoData.checkpointId) {
      list = list.filter(p => !(p.sessionId === photoData.sessionId && p.checkpointId === photoData.checkpointId));
    }
    list.push(photoData);
    localStorage.setItem("ph_local_photos", JSON.stringify(list.slice(-50)));
  } catch(e) {}

  // 3. المزامنة السحابية الفورية مع سوبابيس لتظهر لجميع الأجهزة واللابتوب
  if (typeof SupaEngine !== "undefined" && SupaEngine.saveInspectionPhoto) {
    try {
      const saved = await SupaEngine.saveInspectionPhoto(photoData);
      photoData.uploaded = true;
      if (saved && saved.url) { photoData.url = saved.url; photoData.path = saved.path; }
      await markPhotoUploaded(photoData.id, saved);
    } catch (err) {
      console.warn("Direct photo cloud sync failed, queuing via Sync:", err);
      if (typeof Sync !== "undefined" && Sync.enqueue) {
        Sync.enqueue("photo:" + photoData.id, "saveInspectionPhoto", photoData);
      }
    }
  } else if (typeof Sync !== "undefined" && Sync.enqueue) {
    Sync.enqueue("photo:" + photoData.id, "saveInspectionPhoto", photoData);
  }

  return photoData;
}

async function deletePhotoRecord(photoId, photoDate, photoBranch) {
  if (!(await phConfirm("هل أنت متأكد من حذف هذه الصورة؟ يمكنك التقاط صورة جديدة بدلاً منها.", { ok: "احذف", danger: true }))) return;

  // 1. Delete from IndexedDB
  const db = await openMediaDatabase();
  if (db) {
    try {
      await new Promise((resolve) => {
        const tx = db.transaction("photos", "readwrite");
        const store = tx.objectStore("photos");
        store.delete(photoId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {}
  }

  // 2. Delete from LocalStorage fallback
  try {
    let list = JSON.parse(localStorage.getItem("ph_local_photos") || "[]");
    list = list.filter(p => p.id !== photoId);
    localStorage.setItem("ph_local_photos", JSON.stringify(list));
  } catch (e) {}

  // 3. Delete from Supabase
  if (typeof SupaEngine !== "undefined" && SupaEngine.deleteInspectionPhoto) {
    // الصورة بتنحذف من يومها وفرعها هي (قبل كان دايماً اليوم والفرع المختار، فصور يوم تاني ما كانت تنحذف)
    const branch = photoBranch || (typeof Branch !== "undefined" ? Branch.get() : "") || (typeof allowedBranchList === "function" ? allowedBranchList()[0] : "");
    const date = photoDate || todayStr();
    try {
      await SupaEngine.deleteInspectionPhoto(photoId, date, branch);
    } catch (err) {
      console.warn("Supabase photo delete error:", err);
      showToast("⚠ لم تُحذف من السيرفر: " + (err.message || "تأكد من النت"), true);
      return;
    }
  }

  showToast("🗑️ تم حذف الصورة — يمكنك الآن التقاط صورة بديلة");

  // إغلاق المعاينة المكبرة لو كانت مفتوحة
  const overlay = document.getElementById("photoFullscreenOverlay");
  if (overlay) overlay.classList.remove("active");

  // إعادة رسم الشاشات المفتوحة فوراً
  if (typeof renderOpeningView === "function" && document.getElementById("openingView") && !document.getElementById("openingView").classList.contains("hidden")) {
    renderOpeningView();
  }
  if (typeof renderInspectionGalleryView === "function" && document.getElementById("inspectionView") && !document.getElementById("inspectionView").classList.contains("hidden")) {
    renderInspectionGalleryView();
  }
}

function savePhotoToLocalStorageFallback(photoData) {
  try {
    const list = JSON.parse(localStorage.getItem("ph_local_photos") || "[]");
    list.push(photoData);
    localStorage.setItem("ph_local_photos", JSON.stringify(list.slice(-50))); // حفظ آخر 50 صورة فقط
  } catch (e) {
    console.error("LocalStorage photo limit fallback", e);
  }
  return photoData;
}

async function getPhotosForSession(sessionId) {
  const branch = (typeof Branch !== "undefined" ? Branch.get() : "") || (typeof allowedBranchList === "function" ? allowedBranchList()[0] : "");
  const date = todayStr();
  const all = await getAllPhotos(branch, date);
  return all.filter(p => p.sessionId === sessionId);
}

function getPhotosFromLocalStorageFallback(sessionId) {
  const list = JSON.parse(localStorage.getItem("ph_local_photos") || "[]");
  return list.filter(p => p.sessionId === sessionId);
}

async function getAllPhotos(branchFilter, dateFilter) {
  const bFilter = branchFilter || (typeof Branch !== "undefined" ? Branch.get() : "") || (typeof allowedBranchList === "function" ? allowedBranchList()[0] : "");
  const dFilter = dateFilter || todayStr();

  let localPhotos = [];
  try {
    const db = await openMediaDatabase();
    if (db) {
      localPhotos = await new Promise((resolve) => {
        const tx = db.transaction("photos", "readonly");
        const store = tx.objectStore("photos");
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      localPhotos = pruneLocalPhotos(db, localPhotos);
      if (localStorage.getItem("ph_local_photos")) localStorage.removeItem("ph_local_photos"); // نسخة قديمة مكررة
    } else {
      localPhotos = JSON.parse(localStorage.getItem("ph_local_photos") || "[]");
    }
  } catch (e) {
    localPhotos = JSON.parse(localStorage.getItem("ph_local_photos") || "[]");
  }

  // جلب الصور السحابية من سوبابيس
  let remotePhotos = [];
  if (typeof SupaEngine !== "undefined" && SupaEngine.getInspectionPhotos && bFilter) {
    try {
      remotePhotos = await SupaEngine.getInspectionPhotos(dFilter, bFilter);
    } catch (err) {
      console.warn("Could not fetch remote photos:", err);
    }
  }

  // دمج الصور ومنع التكرار
  const map = new Map();
  (remotePhotos || []).forEach(p => {
    const key = p.id || (p.sessionId + "_" + p.checkpointId);
    map.set(key, p);
  });
  (localPhotos || []).forEach(p => {
    const key = p.id || (p.sessionId + "_" + p.checkpointId);
    map.set(key, p);
  });

  let photos = Array.from(map.values());
  if (bFilter) photos = photos.filter(p => !p.branch || p.branch === bFilter);
  if (dFilter) photos = photos.filter(p => !p.date || p.date === dFilter);

  // مزامنة تلقائية بالخلفية: إذا كان هناك صور ملتقطة سابقاً على هذا الجهاز ولم ترفع لسوبابيس، ارفعها الآن
  if (localPhotos.length > 0 && typeof SupaEngine !== "undefined" && SupaEngine.saveInspectionPhoto) {
    syncPendingLocalPhotos(localPhotos).catch(() => {});
  }

  return photos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

let isSyncingLocalPhotos = false;
async function syncPendingLocalPhotos(localList) {
  const result = { uploaded: 0, failed: 0, pending: 0 };
  if (isSyncingLocalPhotos) return result;
  if (typeof SupaEngine === "undefined" || !SupaEngine.saveInspectionPhoto) return result;
  isSyncingLocalPhotos = true;
  try {
    let list = localList;
    if (!list) {
      const db = await openMediaDatabase();
      if (db) {
        list = await new Promise((resolve) => {
          const tx = db.transaction("photos", "readonly");
          const req = tx.objectStore("photos").getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      } else {
        list = JSON.parse(localStorage.getItem("ph_local_photos") || "[]");
      }
    }

    list = (list || []).filter(p => !p.uploaded && !isStaleLocalPhoto(p));
    result.pending = list.length;
    if (list.length === 0) return result;

    // تجميع حسب الفرع والتاريخ
    const groups = {};
    list.forEach(p => {
      const b = p.branch || (typeof Branch !== "undefined" ? Branch.get() : "") || "عبداللطيف جميل";
      const d = p.date || todayStr();
      const key = `${d}:::${b}`;
      if (!groups[key]) groups[key] = { date: d, branch: b, photos: [] };
      groups[key].photos.push(p);
    });

    for (const key of Object.keys(groups)) {
      const g = groups[key];
      const remote = await SupaEngine.getInspectionPhotos(g.date, g.branch);
      const remoteIds = new Set((remote || []).map(rp => rp.id));

      for (const lp of g.photos) {
        // كل صورة لحالها: لو وحدة فشلت نكمّل الباقي ونعرف كم فشل
        try {
          if (!remoteIds.has(lp.id)) {
            await SupaEngine.saveInspectionPhoto(lp);
            remoteIds.add(lp.id);
            result.uploaded++;
          }
          await markPhotoUploaded(lp.id);
        } catch (e) {
          result.failed++;
          console.warn("photo upload failed:", lp.id, e);
        }
      }
    }
  } catch (e) {
    console.warn("syncPendingLocalPhotos error:", e);
    result.failed = Math.max(result.failed, result.pending - result.uploaded, 1);
  } finally {
    isSyncingLocalPhotos = false;
  }
  return result;
}

async function manualSyncLocalPhotos() {
  showToast("⏳ جاري فحص ومزامنة صور هذا الجهاز مع السحابة…");
  const r = await syncPendingLocalPhotos();
  // الرسالة تقول الحقيقة: كم ارتفع وكم فشل (قبل كانت تقول «تمت» حتى لو ما ارتفع شيء)
  if (!r || r.failed) showToast(`⚠ ما ارتفعت ${r ? r.failed : ""} صورة — تأكد من النت وجرّب مرة ثانية`);
  else if (r.uploaded) showToast(`✅ ارتفعت ${r.uploaded} صورة للسحابة`);
  else showToast("✅ كل صور هذا الجهاز موجودة بالسحابة");
  if (typeof renderOpeningView === "function" && document.getElementById("openingView") && !document.getElementById("openingView").classList.contains("hidden")) {
    renderOpeningView();
  }
  if (typeof renderInspectionGalleryView === "function" && document.getElementById("inspectionView") && !document.getElementById("inspectionView").classList.contains("hidden")) {
    renderInspectionGalleryView();
  }
}

// ---- تجربة التصوير الميداني بالكاميرا الحية ----
function openCameraModal(checkpointObj, callback) {
  currentActiveCheckpoint = checkpointObj;
  currentActiveCallback = callback;

  let modal = document.getElementById("cameraModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "cameraModal";
    modal.className = "camera-modal-backdrop";
    modal.innerHTML = `
      <div class="camera-modal-box">
        <div class="camera-header">
          <div class="camera-active-badge"><span class="pulse-dot">●</span> 🔴 CAMERA ACTIVE</div>
          <span class="checkpoint-title" id="cameraModalTitle">تصوير نقطة الفحص</span>
          <button class="camera-close-btn" onclick="closeCameraModal()">✕</button>
        </div>
        
        <div class="camera-viewfinder">
          <video id="cameraVideo" autoplay playsinline muted></video>
          <canvas id="cameraCanvas" style="display:none;"></canvas>
          <img id="cameraPreviewImg" style="display:none;" />
        </div>

        <div class="camera-controls">
          <button class="btn gold capture-btn" id="btnSnapPhoto" onclick="takePhotoSnap()">📷 التقاط الصورة المباشرة</button>
          <button class="btn primary hidden" id="btnConfirmPhoto" onclick="confirmPhotoSnap()">✓ اعتماد الصورة</button>
          <button class="btn secondary hidden" id="btnRetakePhoto" onclick="retakePhotoSnap()">🔄 إعادة التصوير</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById("cameraModalTitle").textContent = checkpointObj ? checkpointObj.name : "تصوير الفحص البصري";
  document.getElementById("btnSnapPhoto").classList.remove("hidden");
  document.getElementById("btnConfirmPhoto").classList.add("hidden");
  document.getElementById("btnRetakePhoto").classList.add("hidden");
  document.getElementById("cameraVideo").style.display = "block";
  document.getElementById("cameraPreviewImg").style.display = "none";
  modal.classList.add("active");

  startCameraStream();
}

async function startCameraStream() {
  const video = document.getElementById("cameraVideo");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    currentCameraStream = stream;
    if (video) video.srcObject = stream;
  } catch (err) {
    console.warn("Camera access failed or denied:", err);
    showToast("⚠️ تعذر فتح الكاميرا المباشرة — يرجى السماح بصلاحية الكاميرا بالمتصفح");
  }
}

function stopCameraStream() {
  if (currentCameraStream) {
    currentCameraStream.getTracks().forEach(t => t.stop());
    currentCameraStream = null;
  }
}

function closeCameraModal() {
  stopCameraStream();
  const modal = document.getElementById("cameraModal");
  if (modal) modal.classList.remove("active");
}

let capturedDataUrl = null;

function takePhotoSnap() {
  const video = document.getElementById("cameraVideo");
  const canvas = document.getElementById("cameraCanvas");
  const img = document.getElementById("cameraPreviewImg");
  if (!video || !canvas) return;

  const maxDim = 640;
  let w = video.videoWidth || 640;
  let h = video.videoHeight || 480;
  if (w > maxDim || h > maxDim) {
    if (w > h) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    } else {
      w = Math.round((w * maxDim) / h);
      h = maxDim;
    }
  }

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // WebP أصغر بحوالي النص من JPEG بنفس الجودة؛ المتصفحات اللي ما بتدعمه بترجع PNG فمنرجع لـ JPEG
  const webp = canvas.toDataURL("image/webp", 0.6);
  capturedDataUrl = webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.6);
  img.src = capturedDataUrl;
  img.style.display = "block";
  video.style.display = "none";

  document.getElementById("btnSnapPhoto").classList.add("hidden");
  document.getElementById("btnConfirmPhoto").classList.remove("hidden");
  document.getElementById("btnRetakePhoto").classList.remove("hidden");
}

function retakePhotoSnap() {
  const video = document.getElementById("cameraVideo");
  const img = document.getElementById("cameraPreviewImg");
  if (video) video.style.display = "block";
  if (img) img.style.display = "none";

  document.getElementById("btnSnapPhoto").classList.remove("hidden");
  document.getElementById("btnConfirmPhoto").classList.add("hidden");
  document.getElementById("btnRetakePhoto").classList.add("hidden");
}

async function confirmPhotoSnap() {
  if (!capturedDataUrl) return;
  const emp = Auth.getEmployee();
  const branch = Branch.get() || allowedBranchList()[0] || "";

  const photoObj = {
    id: "IMG-" + Date.now(),
    dataUrl: capturedDataUrl,
    checkpointId: currentActiveCheckpoint ? currentActiveCheckpoint.id : "gen",
    checkpointName: currentActiveCheckpoint ? currentActiveCheckpoint.name : "فحص بصري",
    branch: branch,
    employeeName: emp ? emp.name : "موظف الفرع",
    date: todayStr(),
    timestamp: new Date().toISOString(),
    uploaded: true
  };

  await savePhotoRecord(photoObj);
  showToast("✓ تم التقاط الصورة وتوثيق الفحص بنجاح!");
  closeCameraModal();

  if (typeof currentActiveCallback === "function") {
    currentActiveCallback(photoObj);
  }
}

// ---- شاشة معرض المراقبة الميدانية والـ Timeline ----
async function renderInspectionGalleryView() {
  const view = document.getElementById("inspectionView");
  if (!view) return;

  view.innerHTML = '<div class="loader">جاري تحميل صور المراقبة الميدانية وسجل الساعات…</div>';
  const branch = Branch.get() || allowedBranchList()[0] || "";
  const date = todayStr();

  const photos = await getAllPhotos(branch, date);

  let html = `
    <div class="inspection-gallery-panel">
      <div class="inspection-header">
        <div>
          <h2>📷 المعاينة الميدانية وسجل الصور التشغيلية</h2>
          <div class="sub-text">التوثيق البصري المباشر لافتتاح وإغلاق فرع ${branch}</div>
        </div>
        <div class="branch-selector-wrap" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="btn gold" onclick="manualSyncLocalPhotos()" title="رفع أي صور تم التقاطها بهذا الجهاز سابقاً إلى السحابة لتظهر على اللابتوب" style="font-size:12px;padding:6px 12px;">
            ☁️ رفع صور هذا الجهاز للسحابة
          </button>
          <select onchange="onInspectionBranchChange(this.value)">
            ${branchOptionsHtml(branch)}
          </select>
        </div>
      </div>

      ${inspectionRoundsHtml(photos, branch)}
    </div>
  `;

  view.innerHTML = html;
}

// ---- الصور مرتبة حسب الجولات (الافتتاح / الغداء / الإغلاق) مع فرز ----
let inspectionRoundFilter = "all";
function photoRoundId(p) {
  const m = /-(MORNING|LUNCH|CLOSING)$/.exec(String(p.sessionId || ""));
  return m ? m[1].toLowerCase() : "other";
}
function inspectionCardHtml(p) {
  return `
    <div class="timeline-card">
      <div class="timeline-img-wrap" onclick="viewPhotoFullscreen('${p.id}')" title="اضغط لتكبير الصورة">
        <img src="${p.url || p.dataUrl}" loading="lazy" alt="${p.checkpointName}" />
        <span class="timeline-time">${new Date(p.timestamp).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div class="timeline-info" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;">
        <div>
          <strong style="display:block;margin-bottom:3px;">${p.checkpointName}</strong>
          <div class="timeline-emp">👤 ${p.employeeName}</div>
        </div>
        <button class="btn danger" style="padding:5px 12px;font-size:12px;" onclick="deletePhotoRecord('${p.id}', '${p.date || ""}', '${String(p.branch || "").replace(/'/g, "")}')" title="حذف هذه الصورة إذا تم تصويرها بالخطأ">
          🗑️ حذف
        </button>
      </div>
    </div>`;
}
function inspectionRoundsHtml(photos, branch) {
  const cps = getCheckpointsForBranch(branch);
  const order = new Map(cps.map((cp, i) => [cp.id, i]));
  const stages = (typeof INSPECTION_STAGES !== "undefined" ? INSPECTION_STAGES : []).concat([{ id: "other", name: "صور بدون جولة", icon: "📷" }]);
  const rounds = stages.map(st => {
    const list = photos.filter(p => photoRoundId(p) === st.id)
      .sort((a, b) => (order.get(a.checkpointId) ?? 99) - (order.get(b.checkpointId) ?? 99) || new Date(a.timestamp) - new Date(b.timestamp));
    const done = cps.filter(cp => list.some(p => p.checkpointId === cp.id));
    const missing = st.id === "other" ? [] : cps.filter(cp => !done.includes(cp)).map(cp => cp.name);
    return { ...st, list, done: done.length, total: cps.length, missing };
  }).filter(r => r.id !== "other" || r.list.length);
  const f = rounds.some(r => r.id === inspectionRoundFilter) ? inspectionRoundFilter : "all";
  const chip = (id, label) => `<button type="button" class="${f === id ? "active" : ""}" onclick="setInspectionRound('${id}')">${label}</button>`;
  const shown = f === "all" ? rounds : rounds.filter(r => r.id === f);
  return `
    <div class="inspection-timeline-wrap">
      <div class="ph-branch-pills insp-round-pills">
        ${chip("all", `الكل (${photos.length})`)}
        ${rounds.map(r => chip(r.id, `${r.icon} ${r.id === "other" ? "بدون جولة" : "الجولة " + (stages.indexOf(stages.find(s => s.id === r.id)) + 1)} ${r.id === "other" ? `(${r.list.length})` : `${r.done}/${r.total}`}`)).join("")}
      </div>
      ${shown.map(r => `
        <section class="insp-round">
          <div class="insp-round-head">
            <b>${r.icon} ${r.name}</b>
            ${r.id === "other" ? "" : `<span class="insp-round-count ${r.done >= r.total && r.total ? "ok" : r.done ? "part" : ""}">${r.done}/${r.total}</span>`}
          </div>
          ${r.missing.length && r.done ? `<div class="insp-round-missing">ناقص: ${r.missing.join("، ")}</div>` : ""}
          ${r.list.length ? `<div class="timeline-grid">${r.list.map(inspectionCardHtml).join("")}</div>`
                          : `<div class="insp-round-empty">ما فيه صور لهذي الجولة للحين.</div>`}
        </section>`).join("")}
    </div>`;
}
function setInspectionRound(id) {
  inspectionRoundFilter = id;
  renderInspectionGalleryView();
}

function onInspectionBranchChange(branch) {
  Branch.set(branch);
  renderInspectionGalleryView();
}

function viewPhotoFullscreen(photoId) {
  // تكبير الصورة
  getAllPhotos().then(list => {
    const p = list.find(x => x.id === photoId);
    if (!p) return;
    let overlay = document.getElementById("photoFullscreenOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "photoFullscreenOverlay";
      overlay.className = "fullscreen-photo-overlay";
      overlay.onclick = () => overlay.classList.remove("active");
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="fullscreen-box" onclick="event.stopPropagation()">
        <img src="${p.url || p.dataUrl}" loading="lazy" alt="${p.checkpointName}" />
        <div class="fullscreen-caption">
          <h3>${p.checkpointName}</h3>
          <div>الفرع: ${p.branch} | الموظف: ${p.employeeName} | الوقت: ${new Date(p.timestamp).toLocaleString(phLocale())}</div>
          <div style="margin-top:14px;display:flex;gap:10px;justify-content:center;">
            <button class="btn danger" style="font-size:14px;padding:8px 20px;" onclick="deletePhotoRecord('${p.id}', '${p.date || ""}', '${String(p.branch || "").replace(/'/g, "")}')">
              🗑️ حذف الصورة (إذا تم تصويرها بالخطأ)
            </button>
          </div>
        </div>
        <button class="fullscreen-close" onclick="document.getElementById('photoFullscreenOverlay').classList.remove('active')">✕</button>
      </div>
    `;
    overlay.classList.add("active");
  });
}
