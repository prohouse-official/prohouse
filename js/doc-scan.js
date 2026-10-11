// ==================== سكان الفواتير (مثل المسح الضوئي بالملاحظات) ====================
// الكاميرا تلقط حدود الورقة (مستطيل أصفر)، تلتقط تلقائياً لما تثبت، تعدّل الميلان،
// وتطلع صورة نظيفة خلفيتها بيضا والكتابة واضحة. وتقرأ رمز QR الفاتورة الضريبية
// (اسم المورد، الرقم الضريبي، التاريخ، الإجمالي، الضريبة) — بدون أي مكتبة ثقيلة.
// DocScan.open({ onDone: ({ dataUrl, qr }) => ... })

const DocScan = (() => {
  const JSQR_URL = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
  const DETECT_W = 320;     // عرض الصورة الصغيرة اللي نكشف عليها الحدود
  const OUT_MAX = 1600;     // أطول ضلع للصورة النهائية
  const STABLE_FRAMES = 9;  // كم كشف متتالي ثابت قبل الالتقاط التلقائي

  let el = null, video = null, overlay = null, stream = null, timer = 0;
  let onDone = null, auto = true, lastQuad = null, stableCount = 0, busy = false;

  // ---------- الكشف عن الورقة ----------
  function grayOf(data, n) {
    const g = new Uint8ClampedArray(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    return g;
  }

  function otsu(g) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < g.length; i++) hist[g[i]]++;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = g.length - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = t; }
    }
    return thr;
  }

  // أكبر منطقة فاتحة متصلة (الورقة) → لكل سطر أقصى يمين ويسار
  function largestBright(g, w, h) {
    const thr = otsu(g);
    const lab = new Int32Array(w * h).fill(-1);
    let bestId = -1, bestSize = 0, bestRows = null;
    const stack = new Int32Array(w * h);
    let id = 0;
    for (let s = 0; s < w * h; s++) {
      if (lab[s] !== -1 || g[s] <= thr) continue;
      let sp = 0, size = 0;
      const rows = new Map();
      stack[sp++] = s; lab[s] = id;
      while (sp) {
        const p = stack[--sp]; size++;
        const x = p % w, y = (p / w) | 0;
        const r = rows.get(y);
        if (!r) rows.set(y, [x, x]); else { if (x < r[0]) r[0] = x; if (x > r[1]) r[1] = x; }
        if (x > 0 && lab[p - 1] === -1 && g[p - 1] > thr) { lab[p - 1] = id; stack[sp++] = p - 1; }
        if (x < w - 1 && lab[p + 1] === -1 && g[p + 1] > thr) { lab[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && lab[p - w] === -1 && g[p - w] > thr) { lab[p - w] = id; stack[sp++] = p - w; }
        if (y < h - 1 && lab[p + w] === -1 && g[p + w] > thr) { lab[p + w] = id; stack[sp++] = p + w; }
      }
      if (size > bestSize) { bestSize = size; bestId = id; bestRows = rows; }
      id++;
    }
    return bestId < 0 ? null : { size: bestSize, rows: bestRows };
  }

  function hull(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  const polyArea = (q) => {
    let a = 0;
    for (let i = 0; i < q.length; i++) { const p = q[i], n = q[(i + 1) % q.length]; a += p[0] * n[1] - n[0] * p[1]; }
    return Math.abs(a) / 2;
  };

  // أكبر رباعي داخل المضلع المحدّب = زوايا الورقة
  function bestQuad(h) {
    let pts = h;
    if (pts.length > 24) { const step = pts.length / 24; pts = Array.from({ length: 24 }, (_, i) => h[Math.floor(i * step)]); }
    const n = pts.length;
    if (n < 4) return null;
    let best = null, bestA = 0;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
      const q = [pts[a], pts[b], pts[c], pts[d]];
      const ar = polyArea(q);
      if (ar > bestA) { bestA = ar; best = q; }
    }
    return best;
  }

  // ترتيب الزوايا: فوق يسار، فوق يمين، تحت يمين، تحت يسار
  function orderQuad(q) {
    const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
    const byAng = q.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    let start = 0, min = Infinity;
    byAng.forEach((p, i) => { if (p[0] + p[1] < min) { min = p[0] + p[1]; start = i; } });
    return [0, 1, 2, 3].map(i => byAng[(start + i) % 4]);
  }

  // يرجّع زوايا الورقة بإحداثيات الصورة الصغيرة، أو null
  function detect(imgData) {
    const { width: w, height: h, data } = imgData;
    const g = grayOf(data, w * h);
    const comp = largestBright(g, w, h);
    if (!comp || comp.size < w * h * 0.12) return null;
    const pts = [];
    comp.rows.forEach((r, y) => { pts.push([r[0], y]); pts.push([r[1] + 1, y + 1]); });
    const q = bestQuad(hull(pts));
    if (!q) return null;
    const ar = polyArea(q);
    // نفس الإطار كله (خلفية فاتحة) أو صغيرة جداً → ما في ورقة واضحة
    if (ar < w * h * 0.12 || ar > w * h * 0.97) return null;
    return orderQuad(q);
  }

  // ---------- تعديل الميلان (Perspective) ----------
  function solve(A, b) {
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let m = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
      [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
      for (let r = i + 1; r < n; r++) {
        const f = A[r][i] / A[i][i];
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
    return x;
  }

  // من مستطيل النتيجة (u,v) → نقطة بالصورة الأصلية
  function homography(dst, src) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [u, v] = dst[i], [x, y] = src[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    return solve(A, b);
  }

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // يقص الورقة ويعدّلها → رمادي (Uint8) بحجم W×H
  function warpGray(srcCanvas, quad) {
    const sw = srcCanvas.width, sh = srcCanvas.height;
    const src = srcCanvas.getContext("2d").getImageData(0, 0, sw, sh).data;
    let W = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
    let H = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
    const k = Math.min(1, OUT_MAX / Math.max(W, H));
    W = Math.max(50, Math.round(W * k)); H = Math.max(50, Math.round(H * k));
    const m = homography([[0, 0], [W, 0], [W, H], [0, H]], quad);
    const out = new Uint8ClampedArray(W * H);
    for (let v = 0; v < H; v++) {
      for (let u = 0; u < W; u++) {
        const den = m[6] * u + m[7] * v + 1;
        let x = (m[0] * u + m[1] * v + m[2]) / den, y = (m[3] * u + m[4] * v + m[5]) / den;
        if (x < 0) x = 0; else if (x > sw - 1.001) x = sw - 1.001;
        if (y < 0) y = 0; else if (y > sh - 1.001) y = sh - 1.001;
        const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
        const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
        const g = (i) => (src[i] * 77 + src[i + 1] * 150 + src[i + 2] * 29) >> 8;
        const top = g(i00) * (1 - fx) + g(i10) * fx, bot = g(i01) * (1 - fx) + g(i11) * fx;
        out[v * W + u] = top * (1 - fy) + bot * fy;
      }
    }
    return { gray: out, w: W, h: H };
  }

  // ---------- تنظيف "سكان": نشيل الظل ونبيّض الورقة ونغمّق الكتابة ----------
  function boxBlur(g, w, h, r) {
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
      }
    }
    return out;
  }

  function enhance(gray, w, h) {
    // الخلفية = أفتح شي بالمنطقة تقريباً (نطمس مرتين بعد ما نرفع الفاتح)
    const r = Math.max(8, Math.round(Math.max(w, h) / 28));
    const bg = boxBlur(gray, w, h, r);
    const lifted = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) lifted[i] = Math.max(gray[i], bg[i]);
    const bg2 = boxBlur(lifted, w, h, r);
    const out = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) {
      const n = gray[i] / Math.max(bg2[i], 1);          // 1 = ورقة، أقل = كتابة
      let v = (n - 0.55) / (0.9 - 0.55);                  // نبيّض الورقة ونغمّق الحبر
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      out[i] = Math.round(Math.pow(v, 1.35) * 255);
    }
    return out;
  }

  function grayToCanvas(g, w, h) {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let i = 0, j = 0; i < w * h; i++, j += 4) { img.data[j] = img.data[j + 1] = img.data[j + 2] = g[i]; img.data[j + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  function smallFrame(srcCanvas) {
    const k = DETECT_W / srcCanvas.width;
    const cv = document.createElement("canvas");
    cv.width = DETECT_W; cv.height = Math.max(1, Math.round(srcCanvas.height * k));
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.filter = "blur(1px)";
    ctx.drawImage(srcCanvas, 0, 0, cv.width, cv.height);
    return { k, data: ctx.getImageData(0, 0, cv.width, cv.height) };
  }

  // صورة كاملة → صورة سكان + الزوايا اللي انقصّت
  function processCanvas(full) {
    const { k, data } = smallFrame(full);
    const q = detect(data);
    // نقص شوي لجوّا عشان ما يطلع طرف الطاولة على حدود الورقة
    const inset = (qq) => {
      const cx = qq.reduce((a, p) => a + p[0], 0) / 4, cy = qq.reduce((a, p) => a + p[1], 0) / 4;
      return qq.map(p => [p[0] + (cx - p[0]) * 0.012, p[1] + (cy - p[1]) * 0.012]);
    };
    const quad = q ? inset(q.map(p => [p[0] / k, p[1] / k])) : [[0, 0], [full.width, 0], [full.width, full.height], [0, full.height]];
    const { gray, w, h } = warpGray(full, quad);
    return { found: !!q, gray, w, h, clean: enhance(gray, w, h) };
  }

  // ---------- قراءة QR الفاتورة الضريبية (هيئة الزكاة: TLV بصيغة base64) ----------
  let jsqrLoading = null;
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(true);
    if (!jsqrLoading) jsqrLoading = new Promise((res) => {
      const s = document.createElement("script"); s.src = JSQR_URL;
      s.onload = () => res(!!window.jsQR); s.onerror = () => { jsqrLoading = null; res(false); };
      document.head.appendChild(s);
    });
    return jsqrLoading;
  }

  function parseZatca(text) {
    try {
      const bin = atob(String(text || "").trim());
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      const dec = new TextDecoder("utf-8");
      const tags = {};
      for (let i = 0; i + 2 <= bytes.length;) {
        const tag = bytes[i], len = bytes[i + 1];
        if (!tag || i + 2 + len > bytes.length) break;
        tags[tag] = dec.decode(bytes.subarray(i + 2, i + 2 + len));
        i += 2 + len;
      }
      if (!tags[1] || !tags[4]) return null;
      const total = Number(tags[4]), vat = Number(tags[5]);
      const ts = String(tags[3] || "");
      const m = /(\d{4})-(\d{2})-(\d{2})/.exec(ts) || /(\d{2})\/(\d{2})\/(\d{4})/.exec(ts);
      const date = !m ? "" : m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
      return {
        seller: tags[1].trim(), vatNo: String(tags[2] || "").trim(), date,
        total: isFinite(total) ? total : null, vat: isFinite(vat) ? vat : null
      };
    } catch (e) { return null; }
  }

  async function readQr(gray, w, h, clean) {
    if (!(await loadJsQR())) return null;
    // نجرب أكثر من شكل: الـ QR أحياناً صغير أو باهت بالصورة (التكبير ناعم مو مربعات)
    const base = grayToCanvas(gray, w, h), cleanCv = clean ? grayToCanvas(clean, w, h) : base;
    const tries = [[base, 1], [cleanCv, 1], [base, 1.7], [cleanCv, 1.7], [base, 2.4]];
    for (const [cv, scale] of tries) {
      const r = scanQr(cv, scale);
      if (r) return r;
      await new Promise(res => setTimeout(res, 0));
    }
    return null;
  }

  function scanQr(src, scale) {
    const k = Math.min(scale, 3000 / Math.max(src.width, src.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const code = window.jsQR(img.data, cv.width, cv.height, { inversionAttempts: "dontInvert" });
    return code && code.data ? (parseZatca(code.data) || { raw: code.data }) : null;
  }

  // ---------- الواجهة ----------
  function ui() {
    el = document.createElement("div");
    el.className = "dscan";
    el.innerHTML = `
      <div class="dscan-top">
        <button type="button" class="dscan-txt" data-act="cancel">إلغاء</button>
        <button type="button" class="dscan-txt dscan-torch hidden" data-act="torch" aria-label="الفلاش">⚡</button>
        <button type="button" class="dscan-txt" data-act="auto">تلقائي</button>
      </div>
      <div class="dscan-stage">
        <video playsinline muted autoplay></video>
        <canvas class="dscan-overlay"></canvas>
        <div class="dscan-hint">وجّه الكاميرا على الفاتورة</div>
      </div>
      <div class="dscan-bottom">
        <label class="dscan-txt dscan-gallery">🖼️<input type="file" accept="image/*" hidden></label>
        <button type="button" class="dscan-shutter" data-act="shoot" aria-label="التقاط"></button>
        <span class="dscan-spacer"></span>
      </div>
      <div class="dscan-review hidden"></div>`;
    document.body.appendChild(el);
    video = el.querySelector("video");
    overlay = el.querySelector(".dscan-overlay");
    el.querySelector('[data-act="cancel"]').addEventListener("click", close);
    el.querySelector('[data-act="shoot"]').addEventListener("click", () => shoot());
    el.querySelector('[data-act="auto"]').addEventListener("click", (e) => {
      auto = !auto; e.target.textContent = auto ? "تلقائي" : "يدوي"; stableCount = 0;
    });
    el.querySelector('[data-act="torch"]').addEventListener("click", toggleTorch);
    el.querySelector(".dscan-gallery input").addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) await fromFile(f);
    });
  }

  const hint = (t) => { const h = el && el.querySelector(".dscan-hint"); if (h) h.textContent = t; };

  let torchOn = false;
  async function toggleTorch() {
    const t = stream && stream.getVideoTracks()[0];
    if (!t) return;
    torchOn = !torchOn;
    try { await t.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch (e) { torchOn = false; }
  }

  function drawQuad(q, sw, sh) {
    const r = video.getBoundingClientRect();
    overlay.width = r.width * devicePixelRatio; overlay.height = r.height * devicePixelRatio;
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!q) return;
    // الفيديو معروض object-fit: cover
    const s = Math.max(overlay.width / sw, overlay.height / sh);
    const ox = (overlay.width - sw * s) / 2, oy = (overlay.height - sh * s) / 2;
    ctx.beginPath();
    q.forEach((p, i) => { const x = p[0] * s + ox, y = p[1] * s + oy; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.fillStyle = "rgba(242, 190, 34, 0.35)"; ctx.fill();
    ctx.lineWidth = 3 * devicePixelRatio; ctx.strokeStyle = "#f2be22"; ctx.stroke();
  }

  function frameCanvas() {
    const cv = document.createElement("canvas");
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    cv.getContext("2d").drawImage(video, 0, 0);
    return cv;
  }

  function tick() {
    if (!el || busy || !video.videoWidth) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    const k = DETECT_W / vw;
    const cv = document.createElement("canvas");
    cv.width = DETECT_W; cv.height = Math.round(vh * k);
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.filter = "blur(1px)";
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    const q = detect(ctx.getImageData(0, 0, cv.width, cv.height));
    const full = q ? q.map(p => [p[0] / k, p[1] / k]) : null;
    drawQuad(full, vw, vh);
    if (!full) { stableCount = 0; lastQuad = null; hint("وجّه الكاميرا على الفاتورة"); return; }
    const moved = lastQuad ? Math.max(...full.map((p, i) => dist(p, lastQuad[i]))) : Infinity;
    lastQuad = full;
    if (moved < vw * 0.025) stableCount++; else stableCount = 0;
    if (!auto) { hint("لقطنا الفاتورة — اضغط الزر"); return; }
    hint(stableCount >= 3 ? "ثبّت الجوال…" : "قرّب الفاتورة");
    if (stableCount >= STABLE_FRAMES) shoot();
  }

  async function shoot() {
    if (busy || !video || !video.videoWidth) return;
    busy = true;
    hint("جاري المسح…");
    try { showResult(processCanvas(frameCanvas())); }
    catch (e) { busy = false; hint("⚠ ما زبط — جرّب مرة ثانية"); }
  }

  async function fromFile(file) {
    busy = true;
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 2400 / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      showResult(processCanvas(cv));
    } catch (e) { busy = false; showToast("⚠ ما قدرنا نقرأ الصورة — جرّب مرة ثانية"); }
  }

  function showResult(res) {
    const cv = grayToCanvas(res.clean, res.w, res.h);
    const dataUrl = cv.toDataURL("image/jpeg", 0.8);
    const box = el.querySelector(".dscan-review");
    box.classList.remove("hidden");
    box.innerHTML = `
      <div class="dscan-review-img"><img src="${dataUrl}" alt="الفاتورة"></div>
      ${res.found ? "" : '<div class="dscan-note">ما لقطنا حدود الورقة — حطها على سطح غامق وصوّر مرة ثانية إذا مو واضحة</div>'}
      <div class="dscan-qr">🔎 جاري قراءة رمز الفاتورة…</div>
      <div class="dscan-review-actions">
        <button type="button" class="dscan-btn" data-act="retake">↺ إعادة</button>
        <button type="button" class="dscan-btn primary" data-act="use">✓ استخدم</button>
      </div>`;
    let qr = null;
    const qrBox = box.querySelector(".dscan-qr");
    readQr(res.gray, res.w, res.h, res.clean).then((r) => {
      qr = r && r.seller ? r : null;
      if (!qrBox.isConnected) return;
      qrBox.innerHTML = qr
        ? `✅ <b>${escHtml(qr.seller)}</b>${qr.total !== null ? ` · الإجمالي <b>${qr.total.toFixed(2)}</b>` : ""}${qr.vat !== null ? ` · الضريبة ${qr.vat.toFixed(2)}` : ""}${qr.date ? ` · ${qr.date}` : ""}`
        : "ما قدرنا نقرأ رمز QR — اكتب المبلغ بإيدك";
    }).catch(() => { qrBox.textContent = "ما قدرنا نقرأ رمز QR — اكتب المبلغ بإيدك"; });
    box.querySelector('[data-act="retake"]').addEventListener("click", () => {
      box.classList.add("hidden"); box.innerHTML = ""; busy = false; stableCount = 0; lastQuad = null;
      if (!stream) el.querySelector(".dscan-gallery input").click();
    });
    box.querySelector('[data-act="use"]').addEventListener("click", () => {
      const cb = onDone;
      close();
      if (cb) cb({ dataUrl, qr });
    });
  }

  function close() {
    clearInterval(timer); timer = 0;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; torchOn = false;
    if (el) el.remove();
    el = null; video = null; overlay = null; busy = false; lastQuad = null; stableCount = 0;
    document.removeEventListener("visibilitychange", onHidden);
  }
  const onHidden = () => { if (document.hidden) close(); };

  async function open(opts) {
    if (el) close();
    onDone = opts && opts.onDone;
    auto = true;
    ui();
    loadJsQR();
    document.addEventListener("visibilitychange", onHidden);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no camera api");
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } }
      });
      if (!el) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      const caps = track && track.getCapabilities ? track.getCapabilities() : {};
      if (caps.torch) el.querySelector('[data-act="torch"]').classList.remove("hidden");
      timer = setInterval(tick, 140);
    } catch (e) {
      // بدون كاميرا مباشرة (صلاحية مرفوضة أو متصفح قديم) → كاميرا الجوال العادية ونسوي السكان على الصورة
      const inp = el.querySelector(".dscan-gallery input");
      inp.setAttribute("capture", "environment");
      hint("اضغط 🖼️ وصوّر الفاتورة");
      el.classList.add("dscan-nocam");
      inp.click();
    }
  }

  return { open, close, _test: { detect, processCanvas, parseZatca, readQr } };
})();
