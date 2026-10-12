// ==================== سكان الفواتير (مثل المسح الضوئي بالملاحظات) ====================
// الكاميرا تلقط حدود الورقة (مستطيل أصفر)، تلتقط تلقائياً لما تثبت، تعدّل الميلان،
// وتطلع صورة ملونة واضحة بدقة عالية (الورقة بيضا بدون ظل). الحواف تنعدّل باليد مثل الملاحظات.
// بعدها نقرأ الفاتورة: رمز QR الضريبي (ZXing) — وإذا مفعّل بالسيرفر، قراءة كاملة بالذكاء الاصطناعي.
// DocScan.open({ ai: true, onDone: ({ dataUrl, qr, ai }) => ... })

const DocScan = (() => {
  const JSQR_URL = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
  const ZX_BASE = "https://cdn.jsdelivr.net/npm/zxing-wasm@2.2.4/dist/";
  const DETECT_W = 320;     // عرض الصورة الصغيرة اللي نكشف عليها الحدود
  const OUT_MAX = 2400;     // أطول ضلع للصورة النهائية (دقة عالية للأرشيف والمحاسب)
  const STABLE_FRAMES = 8;  // كم كشف متتالي ثابت قبل الالتقاط التلقائي

  let el = null, video = null, overlay = null, stream = null, timer = 0;
  let opts = {}, auto = true, lastQuad = null, stableCount = 0, busy = false;

  // ---------- الكشف عن الورقة ----------
  function grayOf(data, n) {
    const g = new Uint8ClampedArray(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    return g;
  }

  function histogram(g) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < g.length; i++) hist[g[i]]++;
    return hist;
  }

  function otsu(hist, n) {
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = t; }
    }
    return thr;
  }

  const percentile = (hist, n, p) => {
    let acc = 0;
    for (let t = 0; t < 256; t++) { acc += hist[t]; if (acc >= n * p) return t; }
    return 255;
  };

  // أكبر منطقة أفتح من الحد ومتصلة → لكل سطر أقصى يمين ويسار + هل تلمس حواف الصورة
  function largestBright(g, w, h, thr, lab, stack) {
    lab.fill(-1);
    let best = null, id = 0;
    for (let s = 0; s < w * h; s++) {
      if (lab[s] !== -1 || g[s] <= thr) continue;
      let sp = 0, size = 0, minX = w, maxX = 0, minY = h, maxY = 0;
      const rows = new Map();
      stack[sp++] = s; lab[s] = id;
      while (sp) {
        const p = stack[--sp]; size++;
        const x = p % w, y = (p / w) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        const r = rows.get(y);
        if (!r) rows.set(y, [x, x]); else { if (x < r[0]) r[0] = x; if (x > r[1]) r[1] = x; }
        if (x > 0 && lab[p - 1] === -1 && g[p - 1] > thr) { lab[p - 1] = id; stack[sp++] = p - 1; }
        if (x < w - 1 && lab[p + 1] === -1 && g[p + 1] > thr) { lab[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && lab[p - w] === -1 && g[p - w] > thr) { lab[p - w] = id; stack[sp++] = p - w; }
        if (y < h - 1 && lab[p + w] === -1 && g[p + w] > thr) { lab[p + w] = id; stack[sp++] = p + w; }
      }
      if (!best || size > best.size) {
        const touches = (minX <= 1) + (maxX >= w - 2) + (minY <= 1) + (maxY >= h - 2);
        best = { size, rows, touches };
      }
      id++;
    }
    return best;
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

  // يرجّع زوايا الورقة بإحداثيات الصورة الصغيرة، أو null.
  // نجرب أكثر من حد للفاتح: ورقة بيضا على طاولة بيضا تنفصل بس بحد عالي.
  function detect(imgData) {
    const { width: w, height: h, data } = imgData;
    const N = w * h;
    // "بياض الورقة" = أصغر قناة لون: الورق أبيض بكل القنوات، والخشب والطاولات الملونة تنزل بقناة وحدة على الأقل
    const g = new Uint8ClampedArray(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) g[i] = Math.min(data[j], data[j + 1], data[j + 2]);
    const hist = histogram(g);
    const o = otsu(hist, N);
    const thrs = [...new Set([o, ...[0.45, 0.55, 0.65, 0.75, 0.84, 0.9].map(p => percentile(hist, N, p))])]
      .filter(t => t >= o - 2 && t < 250).sort((a, b) => a - b);
    const lab = new Int32Array(N), stack = new Int32Array(N);
    let best = null;
    for (const thr of thrs) {
      const comp = largestBright(g, w, h, thr, lab, stack);
      if (!comp || comp.size < N * 0.05 || comp.touches >= 3) continue;
      const pts = [];
      comp.rows.forEach((r, y) => { pts.push([r[0], y]); pts.push([r[1] + 1, y + 1]); });
      const q = bestQuad(hull(pts));
      if (!q) continue;
      const ar = polyArea(q);
      if (ar < N * 0.06 || ar > N * 0.96) continue;
      const fill = comp.size / ar; // ورقة = منطقة شبه مصمتة (الكتابة نسبة صغيرة)
      if (fill < 0.72) continue;
      const score = ar * fill * fill * fill;
      if (!best || score > best.score) best = { q, score };
    }
    return best ? orderQuad(best.q) : null;
  }

  // ---------- كشف الحواف بـ OpenCV (نفس طريقة تطبيقات السكان) — ينحمّل مرة وحدة ويضل بالكاش ----------
  const CV_URL = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";
  let cvReady = null, CV = null;
  function loadCV() {
    if (!cvReady) cvReady = new Promise((res) => {
      const done = (m) => { CV = m && m.Mat ? m : null; res(!!CV); };
      if (window.cv && window.cv.Mat) return done(window.cv);
      const s = document.createElement("script"); s.src = CV_URL; s.async = true;
      s.onload = () => {
        const c = window.cv;
        if (!c) return done(null);
        if (c.Mat) return done(c);
        if (typeof c.then === "function") c.then((m) => done(m));
        else c.onRuntimeInitialized = () => done(window.cv);
      };
      s.onerror = () => { cvReady = null; res(false); };
      document.head.appendChild(s);
    });
    return cvReady;
  }

  function detectCV(imgData) {
    if (!CV) return null;
    const w = imgData.width, h = imgData.height, N = w * h;
    const mats = [];
    const M = (m) => { mats.push(m); return m; };
    try {
      const src = M(CV.matFromImageData(imgData));
      const ch = new CV.MatVector(); mats.push(ch);
      CV.split(src, ch);
      const mn = M(new CV.Mat());
      CV.min(ch.get(0), ch.get(1), mn); CV.min(mn, ch.get(2), mn);
      const gray = M(new CV.Mat());
      CV.cvtColor(src, gray, CV.COLOR_RGBA2GRAY);
      const edges = M(new CV.Mat()), e2 = M(new CV.Mat());
      const ks = new CV.Size(5, 5);
      CV.GaussianBlur(mn, mn, ks, 0); CV.GaussianBlur(gray, gray, ks, 0);
      CV.Canny(mn, edges, 25, 75); CV.Canny(gray, e2, 25, 75);
      CV.bitwise_or(edges, e2, edges);
      const kernel = M(CV.getStructuringElement(CV.MORPH_RECT, new CV.Size(3, 3)));
      CV.dilate(edges, edges, kernel, new CV.Point(-1, -1), 2);
      const contours = new CV.MatVector(); mats.push(contours);
      const hier = M(new CV.Mat());
      CV.findContours(edges, contours, hier, CV.RETR_LIST, CV.CHAIN_APPROX_SIMPLE);
      let best = null, bestA = 0;
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const area = CV.contourArea(c);
        if (area < N * 0.08 || area > N * 0.98) { c.delete(); continue; }
        const approx = new CV.Mat();
        CV.approxPolyDP(c, approx, 0.02 * CV.arcLength(c, true), true);
        if (approx.rows === 4 && CV.isContourConvex(approx) && area > bestA) {
          bestA = area;
          best = [0, 1, 2, 3].map(k => [approx.data32S[k * 2], approx.data32S[k * 2 + 1]]);
        }
        approx.delete(); c.delete();
      }
      return best ? orderQuad(best) : null;
    } catch (e) { return null; }
    finally { mats.forEach(m => { try { m.delete(); } catch (e) {} }); }
  }

  // OpenCV أول (حواف حقيقية)، وإذا ما لقى نرجع للطريقة الخفيفة
  const detectBest = (imgData) => detectCV(imgData) || detect(imgData);

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

  // يقص الورقة ويعدّلها بالألوان → canvas
  function warp(srcCanvas, quad) {
    const sw = srcCanvas.width, sh = srcCanvas.height;
    const src = srcCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    let W = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
    let H = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
    const k = Math.min(1, OUT_MAX / Math.max(W, H));
    W = Math.max(50, Math.round(W * k)); H = Math.max(50, Math.round(H * k));
    const m = homography([[0, 0], [W, 0], [W, H], [0, H]], quad);
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const out = ctx.createImageData(W, H), o = out.data;
    for (let v = 0, j = 0; v < H; v++) {
      for (let u = 0; u < W; u++, j += 4) {
        const den = m[6] * u + m[7] * v + 1;
        let x = (m[0] * u + m[1] * v + m[2]) / den, y = (m[3] * u + m[4] * v + m[5]) / den;
        if (x < 0) x = 0; else if (x > sw - 1.001) x = sw - 1.001;
        if (y < 0) y = 0; else if (y > sh - 1.001) y = sh - 1.001;
        const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
        const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        o[j] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
        o[j + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
        o[j + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
        o[j + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    return cv;
  }

  // ---------- تحسين مثل الملاحظات: نشيل الظل ونبيّض الورقة بهدوء (بدون تحويل أبيض وأسود قاسي) ----------
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

  // mode: "color" | "gray" | "original"
  function enhance(srcCanvas, mode) {
    const w = srcCanvas.width, h = srcCanvas.height;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.drawImage(srcCanvas, 0, 0);
    if (mode === "original") return cv;
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    // الإضاءة: نقدّرها على صورة صغيرة (أسرع) ونكبّرها
    const sk = Math.min(1, 600 / Math.max(w, h));
    const sw = Math.max(8, Math.round(w * sk)), sh = Math.max(8, Math.round(h * sk));
    const small = document.createElement("canvas");
    small.width = sw; small.height = sh;
    small.getContext("2d").drawImage(srcCanvas, 0, 0, sw, sh);
    const sg = grayOf(small.getContext("2d").getImageData(0, 0, sw, sh).data, sw * sh);
    const r = Math.max(4, Math.round(Math.max(sw, sh) / 30));
    const b1 = boxBlur(sg, sw, sh, r);
    const lifted = new Uint8ClampedArray(sw * sh);
    for (let i = 0; i < sw * sh; i++) lifted[i] = Math.max(sg[i], b1[i]);
    const bg = boxBlur(lifted, sw, sh, r);
    for (let y = 0, j = 0; y < h; y++) {
      const by = Math.min(sh - 1, (y * sk) | 0);
      for (let x = 0; x < w; x++, j += 4) {
        const bgv = Math.max(60, bg[by * sw + Math.min(sw - 1, (x * sk) | 0)]);
        const f = 248 / bgv;
        let rr = d[j] * f, gg = d[j + 1] * f, bb = d[j + 2] * f;
        if (mode === "gray") rr = gg = bb = (rr * 77 + gg * 150 + bb * 29) / 256;
        // تباين ناعم: الورقة بيضا والحبر غامق، والوسط (الشعارات والختم) يضل واضح
        const curve = (c) => { let v = (c - 18) / (246 - 18); v = v < 0 ? 0 : v > 1 ? 1 : v; return 255 * Math.pow(v, 1.12); };
        d[j] = curve(rr); d[j + 1] = curve(gg); d[j + 2] = curve(bb);
      }
    }
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

  // نقص شوي لجوّا عشان ما يطلع طرف الطاولة على حدود الورقة
  const inset = (qq, f) => {
    const cx = qq.reduce((a, p) => a + p[0], 0) / 4, cy = qq.reduce((a, p) => a + p[1], 0) / 4;
    return qq.map(p => [p[0] + (cx - p[0]) * f, p[1] + (cy - p[1]) * f]);
  };
  const fullQuad = (c) => [[0, 0], [c.width, 0], [c.width, c.height], [0, c.height]];

  function findQuad(full) {
    const { k, data } = smallFrame(full);
    const q = detectBest(data);
    return q ? inset(q.map(p => [p[0] / k, p[1] / k]), 0.008) : null;
  }

  // صورة كاملة → النتيجة (للاختبار ولمسار الملف)
  function processCanvas(full, mode) {
    const q = findQuad(full);
    const flat = warp(full, q || fullQuad(full));
    return { found: !!q, quad: q, flat, out: enhance(flat, mode || "color") };
  }

  // ---------- قراءة QR الفاتورة الضريبية (هيئة الزكاة: TLV بصيغة base64) ----------
  const loadScript = (src) => new Promise((res) => {
    const s = document.createElement("script"); s.src = src;
    s.onload = () => res(true); s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  let zxReady = null, jsqrReady = null;
  function loadZX() {
    if (!zxReady) zxReady = (window.ZXingWASM ? Promise.resolve(true) : loadScript(ZX_BASE + "iife/reader/index.js")).then((ok) => {
      if (!ok || !window.ZXingWASM) { zxReady = null; return false; }
      try { ZXingWASM.prepareZXingModule({ overrides: { locateFile: (p) => ZX_BASE + "reader/" + p }, fireImmediately: true }); } catch (e) {}
      return true;
    });
    return zxReady;
  }
  function loadJsQR() {
    if (!jsqrReady) jsqrReady = (window.jsQR ? Promise.resolve(true) : loadScript(JSQR_URL)).then(ok => { if (!ok) jsqrReady = null; return ok && !!window.jsQR; });
    return jsqrReady;
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

  function scaled(src, scale) {
    const k = Math.min(scale, 3200 / Math.max(src.width, src.height));
    if (k === 1) return src;
    const cv = document.createElement("canvas");
    cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
    return cv;
  }
  const imgDataOf = (cv) => cv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height);

  // canvases: من الأوضح للأضعف (الصورة المعدّلة بدقتها، المحسّنة، الإطار الأصلي)
  async function readQr(canvases) {
    const list = canvases.filter(Boolean);
    if (await loadZX()) {
      for (const cv of list) {
        try {
          const r = await ZXingWASM.readBarcodes(imgDataOf(cv), { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 1 });
          const hit = (r || []).find(x => x.isValid && x.text);
          if (hit) return parseZatca(hit.text) || { raw: hit.text };
        } catch (e) { /* نكمل */ }
      }
    }
    if (await loadJsQR()) {
      for (const cv of list) for (const s of [1, 1.7]) {
        const c = scaled(cv, s), d = imgDataOf(c);
        const code = window.jsQR(d.data, d.width, d.height, { inversionAttempts: "dontInvert" });
        if (code && code.data) return parseZatca(code.data) || { raw: code.data };
        await new Promise(res => setTimeout(res, 0));
      }
    }
    return null;
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
      e.target.value = "";
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

  // صورة بدقة الكاميرا الكاملة إذا المتصفح يدعم (أندرويد)، وإلا إطار الفيديو
  async function captureStill() {
    const track = stream && stream.getVideoTracks()[0];
    if (track && window.ImageCapture) {
      try {
        const ic = new ImageCapture(track);
        const blob = await Promise.race([ic.takePhoto(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000))]);
        const bmp = await createImageBitmap(blob);
        const k = Math.min(1, 4200 / Math.max(bmp.width, bmp.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
        cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
        // نفس اتجاه الفيديو؟ (بعض الأجهزة ترجّع الصورة مقلوبة الأبعاد)
        if ((cv.width > cv.height) === (video.videoWidth > video.videoHeight)) return cv;
      } catch (e) { /* نرجع لإطار الفيديو */ }
    }
    return frameCanvas();
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
    const q = detectBest(ctx.getImageData(0, 0, cv.width, cv.height));
    const full = q ? q.map(p => [p[0] / k, p[1] / k]) : null;
    drawQuad(full, vw, vh);
    if (!full) { stableCount = 0; lastQuad = null; hint("وجّه الكاميرا على الفاتورة"); return; }
    const moved = lastQuad ? Math.max(...full.map((p, i) => dist(p, lastQuad[i]))) : Infinity;
    lastQuad = full;
    if (moved < vw * 0.02) stableCount++; else stableCount = 0;
    if (!auto) { hint("لقطنا الفاتورة — اضغط الزر"); return; }
    hint(stableCount >= 3 ? "ثبّت الجوال…" : "قرّب الفاتورة");
    if (stableCount >= STABLE_FRAMES) shoot();
  }

  async function shoot() {
    if (busy || !video || !video.videoWidth) return;
    busy = true;
    hint("جاري المسح…");
    const videoQuad = lastQuad;
    try {
      const still = await captureStill();
      let q = findQuad(still);
      if (!q && videoQuad) { const s = still.width / video.videoWidth; q = inset(videoQuad.map(p => [p[0] * s, p[1] * s]), 0.008); }
      review(still, q);
    } catch (e) { busy = false; hint("⚠ ما زبط — جرّب مرة ثانية"); }
  }

  async function fromFile(file) {
    busy = true;
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 4200 / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      review(cv, findQuad(cv));
    } catch (e) { busy = false; showToast("⚠ ما قدرنا نقرأ الصورة — جرّب مرة ثانية"); }
  }

  // ---------- المراجعة: الصورة + نوع التحسين + تعديل الحواف + قراءة الفاتورة ----------
  function review(still, quad) {
    const box = el.querySelector(".dscan-review");
    let q = quad || fullQuad(still);
    // الصورة الأصلية بس (مقصوصة ومعدولة) — بدون فلاتر ألوان
    let mode = "original", flat = null, out = null, readSeq = 0;
    const state = { qr: null, ai: null, dataUrl: "" };

    const render = () => {
      flat = warp(still, q);
      out = enhance(flat, mode);
      state.dataUrl = out.toDataURL("image/jpeg", 0.9);
      box.classList.remove("hidden");
      box.innerHTML = `
        <div class="dscan-review-img"><img src="${state.dataUrl}" alt="الفاتورة"></div>
        ${quad ? "" : '<div class="dscan-note">ما لقطنا حدود الورقة تلقائياً — اضغط «✂️ الحواف» وحددها</div>'}
        <div class="dscan-modes">
          <button type="button" class="dscan-chip" data-act="crop">✂️ الحواف</button>
        </div>
        <div class="dscan-qr">🔎 جاري قراءة الفاتورة…</div>
        <div class="dscan-review-actions">
          <button type="button" class="dscan-btn" data-act="retake">↺ إعادة</button>
          <button type="button" class="dscan-btn primary" data-act="use">✓ استخدم</button>
        </div>`;
      box.querySelector('[data-act="crop"]').addEventListener("click", () => adjust(still, q, (nq) => { q = nq; quad = nq; render(); }));
      box.querySelector('[data-act="retake"]').addEventListener("click", () => {
        box.classList.add("hidden"); box.innerHTML = ""; busy = false; stableCount = 0; lastQuad = null;
        if (!stream) el.querySelector(".dscan-gallery input").click();
      });
      box.querySelector('[data-act="use"]').addEventListener("click", () => {
        const cb = opts.onDone;
        // القراءة الآلية لسا ما خلصت؟ نكمّل بالخلفية وتتعبّى البيانات لما توصل
        const res = { dataUrl: state.dataUrl, qr: state.qr, ai: state.ai, aiLater: !state.ai && state.aiPromise ? state.aiPromise : null };
        close();
        if (cb) cb(res);
      });
      read();
    };

    // القراءة تعاد بس لما تتغير الحواف (مو لما يتغير اللون)
    let readFor = null;
    const read = () => {
      const qrBox = box.querySelector(".dscan-qr");
      const key = q.map(p => p.map(Math.round).join(",")).join(";");
      if (readFor === key) { qrBox.innerHTML = summaryHtml(state); return; }
      readFor = key;
      const seq = ++readSeq;
      state.qr = null; state.ai = null; state.aiPromise = null;
      const flatNow = flat, outNow = out;
      readQr([flatNow, outNow, still]).then(async (r) => {
        if (seq !== readSeq) return;
        state.qr = r && r.seller ? r : null;
        const live = () => seq === readSeq && qrBox.isConnected ? box.querySelector(".dscan-qr") : null;
        let tgt = live(); if (tgt) tgt.innerHTML = summaryHtml(state, opts.ai && aiAvailable());
        if (opts.ai && aiAvailable()) {
          const p = readWithAi(outNow);
          state.aiPromise = p;
          const ai = await p;
          // الحواف تغيّرت أثناء القراءة؟ النتيجة القديمة ما تنكتب على الجديدة
          if (seq !== readSeq) return;
          state.ai = ai;
          tgt = live(); if (tgt) tgt.innerHTML = summaryHtml(state);
        }
      }).catch(() => { const t = box.querySelector(".dscan-qr"); if (t && seq === readSeq) t.innerHTML = summaryHtml(state); });
    };
    render();
  }

  const fmt = (n) => (n === null || n === undefined || n === "" || isNaN(Number(n)) ? "" : Number(n).toFixed(2));
  function summaryHtml(st, aiPending) {
    const q = st.qr, a = st.ai && !st.ai.error ? st.ai : null;
    const parts = [];
    if (q) parts.push(`✅ <b>${escHtml(q.seller)}</b>${q.total !== null ? ` · الإجمالي <b>${fmt(q.total)}</b>` : ""}${q.vat !== null ? ` · الضريبة ${fmt(q.vat)}` : ""}${q.date ? ` · ${q.date}` : ""} <small>(من رمز QR)</small>`);
    if (a) {
      const lines = Array.isArray(a.lines) ? a.lines.length : 0;
      parts.push(`🤖 ${a.supplier && !q ? `<b>${escHtml(a.supplier)}</b> · ` : ""}${a.invoice_no ? `فاتورة #${escHtml(a.invoice_no)} · ` : ""}${!q && a.total !== null && a.total !== undefined ? `الإجمالي <b>${fmt(a.total)}</b> · ` : ""}${lines ? `${lines} صنف` : ""}`);
      if (q && q.total !== null && q.total !== undefined && a.total !== null && a.total !== undefined && Math.abs(Number(a.total) - Number(q.total)) > 0.05) parts.push(`⚠ القراءة طلعت إجمالي ${fmt(a.total)} والـ QR ${fmt(q.total)} — نعتمد الـ QR`);
    } else if (st.ai && st.ai.error) parts.push("ما قدرنا نقرأ تفاصيل الفاتورة — كمّل بإيدك");
    if (aiPending) parts.push("🤖 جاري قراءة تفاصيل الفاتورة…");
    if (!parts.length) return "ما لقينا رمز QR — اكتب المبلغ بإيدك";
    return parts.join("<br>");
  }

  // ---------- تعديل الحواف باليد ----------
  function adjust(still, q, done) {
    const pane = document.createElement("div");
    pane.className = "dscan-adjust";
    pane.innerHTML = `
      <div class="dscan-adjust-stage"><canvas></canvas></div>
      <div class="dscan-adjust-hint">اسحب النقاط الأربع على زوايا الفاتورة</div>
      <div class="dscan-review-actions">
        <button type="button" class="dscan-btn" data-act="cancel">إلغاء</button>
        <button type="button" class="dscan-btn primary" data-act="ok">✓ تم</button>
      </div>`;
    el.appendChild(pane);
    const stage = pane.querySelector(".dscan-adjust-stage"), cv = pane.querySelector("canvas");
    const pts = q.map(p => p.slice());
    let s = 1, ox = 0, oy = 0, drag = -1;
    const layout = () => {
      const r = stage.getBoundingClientRect();
      s = Math.min(r.width / still.width, r.height / still.height);
      cv.width = Math.round(r.width * devicePixelRatio); cv.height = Math.round(r.height * devicePixelRatio);
      cv.style.width = r.width + "px"; cv.style.height = r.height + "px";
      ox = (r.width - still.width * s) / 2; oy = (r.height - still.height * s) / 2;
      draw();
    };
    const draw = () => {
      const ctx = cv.getContext("2d"), d = devicePixelRatio;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(still, ox, oy, still.width * s, still.height * s);
      ctx.beginPath();
      pts.forEach((p, i) => { const x = ox + p[0] * s, y = oy + p[1] * s; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
      ctx.fillStyle = "rgba(242,190,34,.22)"; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = "#f2be22"; ctx.stroke();
      pts.forEach(p => { ctx.beginPath(); ctx.arc(ox + p[0] * s, oy + p[1] * s, 13, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#f2be22"; ctx.stroke(); });
    };
    const toImg = (e) => {
      const r = cv.getBoundingClientRect();
      return [Math.max(0, Math.min(still.width, (e.clientX - r.left - ox) / s)), Math.max(0, Math.min(still.height, (e.clientY - r.top - oy) / s))];
    };
    cv.addEventListener("pointerdown", (e) => {
      const p = toImg(e);
      let bi = -1, bd = Infinity;
      pts.forEach((c, i) => { const dd = dist(c, p) * s; if (dd < bd) { bd = dd; bi = i; } });
      if (bd < 48) { drag = bi; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    cv.addEventListener("pointermove", (e) => { if (drag < 0) return; pts[drag] = toImg(e); draw(); e.preventDefault(); });
    const end = () => { drag = -1; };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    pane.querySelector('[data-act="cancel"]').addEventListener("click", () => pane.remove());
    pane.querySelector('[data-act="ok"]').addEventListener("click", () => { pane.remove(); done(orderQuad(pts)); });
    requestAnimationFrame(layout);
  }

  // ---------- القراءة بالذكاء الاصطناعي (بالسيرفر، إذا مفعّلة) ----------
  let aiOff = false;
  try { aiOff = sessionStorage.getItem("ph_invoice_ai_off") === "1"; } catch (e) {}
  const aiAvailable = () => !aiOff && typeof SupaEngine !== "undefined" && typeof SupaEngine.readInvoice === "function";
  async function readWithAi(canvas) {
    try {
      const k = Math.min(1, 1800 / Math.max(canvas.width, canvas.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(canvas.width * k); cv.height = Math.round(canvas.height * k);
      cv.getContext("2d").drawImage(canvas, 0, 0, cv.width, cv.height);
      const r = await SupaEngine.readInvoice(cv.toDataURL("image/jpeg", 0.88));
      if (r && r.off) { aiOff = true; try { sessionStorage.setItem("ph_invoice_ai_off", "1"); } catch (e) {} return null; }
      return r && r.invoice ? r.invoice : { error: true };
    } catch (e) {
      // السيرفر رد إن القراءة فشلت → نقول للموظف. انقطاع نت أو نسخة المعاينة → بصمت
      return /ai_failed|limit/.test(String(e && e.message)) ? { error: true } : null;
    }
  }

  function close() {
    clearInterval(timer); timer = 0;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; torchOn = false;
    if (el) el.remove();
    el = null; video = null; overlay = null; busy = false; lastQuad = null; stableCount = 0;
    document.removeEventListener("visibilitychange", onHidden);
  }
  const onHidden = () => { if (document.hidden && !busy) close(); };

  async function open(o) {
    if (el) close();
    opts = o || {};
    auto = true;
    ui();
    loadZX(); loadJsQR(); loadCV();
    document.addEventListener("visibilitychange", onHidden);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no camera api");
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 4032 }, height: { ideal: 3024 } }
      });
      if (!el) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      const caps = track && track.getCapabilities ? track.getCapabilities() : {};
      if (caps.torch) el.querySelector('[data-act="torch"]').classList.remove("hidden");
      if (caps.focusMode && caps.focusMode.includes("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      timer = setInterval(tick, 150);
    } catch (e) {
      // بدون كاميرا مباشرة (صلاحية مرفوضة أو متصفح قديم) → كاميرا الجوال العادية ونسوي السكان على الصورة
      const inp = el.querySelector(".dscan-gallery input");
      inp.setAttribute("capture", "environment");
      hint("اضغط 🖼️ وصوّر الفاتورة");
      el.classList.add("dscan-nocam");
      inp.click();
    }
  }

  return { open, close, _test: { detect, detectCV, loadCV, processCanvas, parseZatca, readQr, enhance, warp } };
})();
