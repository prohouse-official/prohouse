// تقرير الشيف (طلبية الغد) عربي + بنقالي — من كود التطبيق بوضع التجربة بعد تعبئة قاعدة التجربة بالبيانات الحقيقية
// الاستعمال: DATE=<تاريخ الطلبية> node tools/subs-day/chef.js <مجلد الشغل>
//   افتراضياً: اشتراكات كل الأيام (chef-data.json → boq) مجموعة بعمود "اشتراكات توصيل" مدموجة مع أصناف الفروع
//   BOTH=1: يومين بعمودين (اليوم الأول غامق والتاني مفرغ) — متل طلبية السبت (اشتراكات السبت + الأحد)
const pw = require("playwright"), fs = require("fs"), path = require("path"), http = require("http"), { spawn } = require("child_process");
const W = path.resolve(process.argv[2] || "."), H = process.env.SUBS_HOME || "/tmp/subs-day", ROOT = path.join(__dirname, "../..");
const data = JSON.parse(fs.readFileSync(path.join(W, "chef-data.json"), "utf8"));
const DATE = process.env.DATE, BOTH = process.env.BOTH === "1";
const next = (d, k) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const up = () => new Promise(r => http.get("http://127.0.0.1:8765/", res => { res.resume(); r(true); }).on("error", () => r(false)));
(async () => {
  if (!(await up())) { spawn("python3", ["-m", "http.server", "8765"], { cwd: ROOT, detached: true, stdio: "ignore" }).unref(); await new Promise(r => setTimeout(r, 1500)); }
  const b = await pw.chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } } : {});
  const page = await (await b.newContext({ viewport: { width: 1400, height: 1000 }, timezoneId: "Asia/Riyadh" })).newPage();
  await page.route("**/html2canvas.min.js", r => r.fulfill({ path: H + "/libs/node_modules/html2canvas/dist/html2canvas.min.js", contentType: "application/javascript" }));
  await page.route("**/jspdf.umd.min.js", r => r.fulfill({ path: H + "/libs/node_modules/jspdf/dist/jspdf.umd.min.js", contentType: "application/javascript" }));
  const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("dialog", d => d.accept());
  const login = async () => { if (!(await page.isVisible("#loginPinInput").catch(() => false))) return; await page.fill("#loginPinInput", "1111"); await page.click("#loginSubmitBtn"); await page.waitForTimeout(2500); };
  await page.goto("http://localhost:8765/?demo=1", { waitUntil: "load" }); await page.waitForTimeout(1500); await login();
  // كتابة وهمية لحتى تنحفظ قاعدة التجربة بالـ sessionStorage
  await page.evaluate(async () => { await fetch(SUPABASE_URL + "/rest/v1/takrar_boq", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ date: "2000-01-01", items: [] }) }).catch(() => {}); });
  const days = Object.keys(data.byDay || {}).sort();
  const boqRows = BOTH ? [[DATE, (data.byDay || {})[days[0]] || []], [next(DATE, 1), (data.byDay || {})[days[1]] || []]] : [[next(DATE, 1), data.boq]];
  await page.evaluate(({ d, rows }) => {
    const KEY = "ph_demo_db_v6", db = JSON.parse(sessionStorage.getItem(KEY));
    db.items = d.items; db.tomorrow_orders = d.orders.map((o, i) => ({ id: i + 1, ...o, employee_name: "", saved_at: new Date().toISOString() }));
    db.tomorrow_meta = []; db.daily_entries = []; db.day_meta = [];
    db.takrar_boq = rows.map(([date, items]) => ({ date, items, locked: false }));
    sessionStorage.setItem(KEY, JSON.stringify(db));
  }, { d: data, rows: boqRows });
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(1500); await login();
  const out = await page.evaluate(async ({ date, both }) => {
    setActiveTab("report"); await new Promise(r => setTimeout(r, 800));
    document.getElementById("tomorrowReportDate").value = date;
    document.getElementById("tomorrowReportBranch").value = "";
    tomorrowReportCombined = true; tomorrowReportSubTouched = true; tomorrowReportSubBoth = both; tomorrowReportSubSameDay = both;
    await runTomorrowReport(); await new Promise(r => setTimeout(r, 1500));
    const b64 = (blob) => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(",")[1]); fr.readAsDataURL(blob); });
    return { ar: await b64(await buildTomorrowReportPdf(false)), bn: await b64(await buildTomorrowReportPdf(true)), sheets: lastTomorrowReportSheets.map(s => ({ branches: s.branches, rows: s.rows.length })) };
  }, { date: DATE, both: BOTH });
  fs.writeFileSync(path.join(W, "chef_ar.pdf"), Buffer.from(out.ar, "base64"));
  fs.writeFileSync(path.join(W, "chef_bn.pdf"), Buffer.from(out.bn, "base64"));
  console.log(JSON.stringify(out.sheets), errs.slice(0, 5));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
