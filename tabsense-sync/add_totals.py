"""سطر المجموع تحت ملف طلبات تابسنس — نفس اللي كان ينضاف باليد بالإكسل:
SUM لأعمدة إجمالي المبيعات (C) وصافي المبيعات (D) والخصم (E)، بدون أي تغيير ثاني بالملف.
python3 -I add_totals.py orders.xlsx
"""
import re
import sys
import zipfile
import shutil
import tempfile
import xml.sax.saxutils as sx

SHEET = "xl/worksheets/sheet1.xml"
COLS = ["C", "D", "E"]


def main(path):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        files = {n: z.read(n) for n in names}
        infos = {n: z.getinfo(n) for n in names}
    sheet = files[SHEET].decode("utf-8")
    if "SUM(C2:" in sheet:
        print("totals: already")
        return
    strings = []
    if "xl/sharedStrings.xml" in files:
        ss = files["xl/sharedStrings.xml"].decode("utf-8")
        strings = [re.sub(r"<[^>]+>", "", m) for m in re.findall(r"<si>(.*?)</si>", ss, re.S)]
    rows = re.findall(r'<row[^>]*\br="(\d+)"[^>]*>(.*?)</row>', sheet, re.S)
    if not rows:
        print("totals: no rows")
        return
    last = max(int(r) for r, _ in rows)
    if last < 2:
        print("totals: no orders")
        return
    sums = {c: 0.0 for c in COLS}
    for r, body in rows:
        if int(r) < 2:
            continue
        for c in COLS:
            m = re.search(r'<c r="%s%s"([^>]*)>(.*?)</c>' % (c, r), body, re.S)
            if not m:
                continue
            attrs, inner = m.group(1), m.group(2)
            v = re.search(r"<v>(.*?)</v>", inner, re.S)
            t = re.search(r'\bt="(\w+)"', attrs)
            raw = None
            if t and t.group(1) == "s" and v:
                raw = strings[int(v.group(1))]
            elif t and t.group(1) == "inlineStr":
                raw = re.sub(r"<[^>]+>", "", inner)
            elif v:
                raw = v.group(1)
            try:
                sums[c] += float(str(raw).replace(",", ""))
            except (TypeError, ValueError):
                pass
    n = last + 1
    cells = "".join('<c r="%s%d"><f>SUM(%s2:%s%d)</f><v>%s</v></c>' % (c, n, c, c, last, repr(round(sums[c], 10))) for c in COLS)
    new_row = '<row r="%d">%s</row>' % (n, cells)
    sheet = sheet.replace("</sheetData>", new_row + "</sheetData>", 1)
    sheet = re.sub(r'(<dimension ref="[A-Z]+\d+:[A-Z]+)(\d+)("/>)', lambda m: m.group(1) + str(n) + m.group(3), sheet, count=1)
    files[SHEET] = sheet.encode("utf-8")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp.close()
    with zipfile.ZipFile(tmp.name, "w") as out:
        for name in names:
            out.writestr(infos[name], files[name])
    shutil.move(tmp.name, path)
    print("totals: added row %d" % n)


if __name__ == "__main__":
    main(sys.argv[1])
