"""ملف طلبات تكرار (orders.xlsx) → مبيعات كل يوم حسب طريقة الدفع (المدفوع بس).
يطبع JSON للسكربت — ما ينطبع بالسجل.  python3 -I parse_orders.py orders.xlsx
"""
import json
import sys
from collections import defaultdict

import openpyxl

ws = openpyxl.load_workbook(sys.argv[1], data_only=True).active
rows = list(ws.iter_rows(values_only=True))
head = [str(h or "").strip().upper() for h in rows[0]]
col = {h: i for i, h in enumerate(head)}
need = ["CREATED AT", "IS PAID", "TOTAL AMOUNT", "PAYMENT-PROVIDER"]
missing = [h for h in need if h not in col]
if missing:
    sys.exit("columns missing: " + ",".join(missing))
CH = {"tamara": "اشتراكات تكرار — تمارا", "tabby": "اشتراكات تكرار — تابي"}
days = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
for r in rows[1:]:
    paid = r[col["IS PAID"]]
    amt = r[col["TOTAL AMOUNT"]] or 0
    if str(paid).lower() not in ("true", "1", "yes") or not float(amt):
        continue
    day = str(r[col["CREATED AT"]])[:10]  # الوقت بتوقيت الرياض (+03:00) بالملف
    ch = CH.get(str(r[col["PAYMENT-PROVIDER"]] or "").lower(), "اشتراكات تكرار — بطاقة")
    days[day][ch][0] += 1
    days[day][ch][1] += float(amt)
print(json.dumps({d: [{"channel": c, "transactions": n, "amount": round(a, 2)} for c, (n, a) in chs.items()] for d, chs in sorted(days.items())}, ensure_ascii=False))
