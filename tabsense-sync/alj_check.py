"""مطابقة مجاميع ملف الطلبات (بعد التنظيف) مع الملخص PDF — لكل بند: ok أو diff أو ? (ما لقيناه بالملخص).
المستودع عام: ما يطبع ولا رقم — بس اسم البند وحالته.
python3 -I alj_check.py summary.pdf orders.xlsx
"""
import re
import sys
import unicodedata
import zipfile

import pymupdf

N = r"(-?[\d,]+\.\d+)"
# البند بالملخص ← عمود ملف الطلبات
ITEMS = [
    ("gross", "C", N + r"\s*المبيعاتإجمال"),
    ("discount", "E", N + r"\s*الخصم"),
    ("net", "D", N + r"\s*المبيعاتصاف"),
    ("vat", "I", N + r"\s*الضريبة\n"),
    ("total", "J", r"الضريبة\n" + N + r"\s*\nالإجمال"),
    ("cash", "N", r"(?m)^" + N + r"نقدي$"),
    ("mada", "O", r"(?m)^" + N + r"مدى$"),
]


def pdf_values(path):
    text = unicodedata.normalize("NFKC", "\n".join(p.get_text() for p in pymupdf.open(path)))
    # الخط يحط بعض الحروف (مثل الياء) برموز خاصة — نشيلها قبل البحث
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Co")
    out = {}
    for name, _, rx in ITEMS:
        m = re.search(rx, text)
        out[name] = float(m.group(1).replace(",", "")) if m else None
    return out


def xlsx_totals(path):
    z = zipfile.ZipFile(path)
    sheet = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
    sums = {}
    for col, val in re.findall(r'<c r="([A-Z]+)\d+"><f>[^<]*</f><v>([^<]*)</v></c>', sheet):
        sums[col] = float(val)
    return sums


def order_rows(path):
    """عدد الفواتير بالملف بعد التنظيف (بدون سطر العناوين وسطر المجموع)."""
    sheet = zipfile.ZipFile(path).read("xl/worksheets/sheet1.xml").decode("utf-8")
    rows = re.findall(r'<row\b[^>]*?\br="(\d+)"', sheet)
    has_total = "<f>" in sheet
    return max(0, len(rows) - 1 - (1 if has_total else 0))


def main(pdf, xlsx, as_json=False, dropped=0):
    p, x = pdf_values(pdf), xlsx_totals(xlsx)
    res = []
    for name, col, _ in ITEMS:
        if p[name] is None or col not in x:
            res.append(name + "=?")
        else:
            res.append(name + ("=ok" if abs(p[name] - x[col]) < 0.005 else "=diff"))
    text = " ".join(res)
    if not as_json:
        print(text)
        return
    # للموقع بس (ينبعت للداتابيس الخاصة، ما ينطبع بالسجل): أرقام الملخص + نتيجة المطابقة
    import json
    m = re.search(N + r"\s*المرتجعات", unicodedata.normalize("NFKC", "\n".join(pg.get_text() for pg in pymupdf.open(pdf))).replace("\ue915", ""))
    print(json.dumps({**p, "returns": float(m.group(1).replace(",", "")) if m else None,
                      "orders": order_rows(xlsx), "dropped": int(dropped),
                      "check_ok": all(r.endswith("=ok") for r in res), "check_text": text}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], "--json" in sys.argv, next((a.split("=")[1] for a in sys.argv if a.startswith("--dropped=")), 0))
