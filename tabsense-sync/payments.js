// تقرير "المبيعات حسب طريقة الدفع" بتابسنس — لشاشة إغلاق العهدة (كاش مقابل مدى/شبكة)
const PAYMENT_REPORT_URL = "https://app.tabsense.ai/prohouse/dashboard/reports/sales-by-payment-method";

// ترتيب الأعمدة بالتقرير: المصدر، طريقة الدفع، عدد العمليات، المبيعات، المرتجع، الإجمالي، ...
// منعتمد على اسم العمود إذا لقيناه، وإلا على مكانه (ترتيب الأعمدة ما بيتغيّر مع العربي/الإنجليزي)
async function extractPaymentRows(page) {
  return page.evaluate(() => {
    const table = document.querySelector("table");
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll("thead th, thead td")).map(th => th.innerText.trim());
    const find = (re, fallback) => {
      const i = headers.findIndex(h => re.test(h));
      return i >= 0 ? i : fallback;
    };
    const channelIdx = find(/payment channel|قناة|طريقة/i, 1);
    const txIdx = find(/^transactions$|عمليات|المعاملات/i, 2);
    const totalIdx = find(/^total amount$|الإجمالي|المبلغ الكلي/i, 5);
    const num = (s) => parseFloat(String(s || "").replace(/,/g, "")) || 0;
    return Array.from(table.querySelectorAll("tbody tr"))
      .map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.innerText.trim()))
      .filter(tds => tds.length > totalIdx && tds[channelIdx] && !/no data|لا يوجد/i.test(tds[0]))
      .map(tds => ({ channel: tds[channelIdx], transactions: Math.round(num(tds[txIdx])), amount: num(tds[totalIdx]) }));
  });
}

module.exports = { PAYMENT_REPORT_URL, extractPaymentRows };
