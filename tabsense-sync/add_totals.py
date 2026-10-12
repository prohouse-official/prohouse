"""تنظيف ملف طلبات تابسنس + سطر المجموع تحته:
١) أي سطر بدون رقم فاتورة (عمود B) ينحذف — مرتجع أو طلب ما دخل السيستم، وما لازم ينحسب.
٢) سطر المجموع لكل أعمدة المبالغ (إجمالي، صافي، خصم، ضرائب، المجموع، الرسوم، نقدي، مدى)
   معادلات محسوبة من الفواتير نفسها بالملف — ما نكتب ولا رقم من الملخص، وتطلع مطابقة له بالهللة.
باقي الملف بدون أي تغيير.
python3 -I add_totals.py orders.xlsx
المستودع عام: ما يطبع أرقام مبيعات — بس عدد الأسطر المحذوفة ورقم سطر المجموع.
"""
import re
import sys
import zipfile
import shutil
import tempfile

SHEET = "xl/worksheets/sheet1.xml"
COLS = ["C", "D", "E", "I", "J", "K", "L", "M", "N", "O"]
ROW_RE = re.compile(r'<row\b[^>]*?\br="(\d+)"[^>]*?(?:/>|>.*?</row>)', re.S)


def cell_text(row_xml, ref, strings):
    m = re.search(r'<c r="%s"([^>]*?)(?:/>|>(.*?)</c>)' % ref, row_xml, re.S)
    if not m:
        return None
    attrs, inner = m.group(1), m.group(2) or ""
    v = re.search(r"<v>(.*?)</v>", inner, re.S)
    t = re.search(r'\bt="(\w+)"', attrs)
    if t and t.group(1) == "s" and v:
        return strings[int(v.group(1))]
    if t and t.group(1) == "inlineStr":
        return re.sub(r"<[^>]+>", "", inner)
    return v.group(1) if v else None


def col_values(kept, col, strings):
    out = []
    for old, new, xml in kept:
        if new < 2:
            continue
        try:
            out.append(float(str(cell_text(xml, "%s%d" % (col, old), strings)).replace(",", "")))
        except (TypeError, ValueError):
            pass
    return out


def renumber(row_xml, old, new):
    if old == new:
        return row_xml
    row_xml = re.sub(r'(<row\b[^>]*?\br=")%d(")' % old, r"\g<1>%d\2" % new, row_xml, count=1)
    return re.sub(r'(<c r="[A-Z]+)%d(")' % old, r"\g<1>%d\2" % new, row_xml)


def main(path):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        files = {n: z.read(n) for n in names}
        infos = {n: z.getinfo(n) for n in names}
    sheet = files[SHEET].decode("utf-8")
    if "<f>" in sheet:
        print("totals: already")
        return
    if "</sheetData>" not in sheet:
        print("totals: no orders")
        return
    strings = []
    if "xl/sharedStrings.xml" in files:
        ss = files["xl/sharedStrings.xml"].decode("utf-8")
        strings = [re.sub(r"<[^>]+>", "", m) for m in re.findall(r"<si>(.*?)</si>", ss, re.S)]
    rows = [(int(m.group(1)), m.group(0)) for m in ROW_RE.finditer(sheet)]

    # ١) نحذف الأسطر اللي ما لها رقم فاتورة، والباقي يترقّم من جديد بالترتيب
    kept, removed, nxt = [], 0, 2
    for r, xml in rows:
        if r < 2:
            kept.append((r, r, xml))
            continue
        if not str(cell_text(xml, "B%d" % r, strings) or "").strip():
            removed += 1
            continue
        kept.append((r, nxt, xml))
        nxt += 1
    last = nxt - 1
    if last < 2:
        print("totals: no orders (removed %d)" % removed)
        return

    # ٢) سطر المجموع من الفواتير نفسها
    sums = {c: 0.0 for c in COLS}
    for old, new, xml in kept:
        if new < 2:
            continue
        for c in COLS:
            raw = cell_text(xml, "%s%d" % (c, old), strings)
            try:
                sums[c] += float(str(raw).replace(",", ""))
            except (TypeError, ValueError):
                pass
    tot = last + 1
    # تابسنس يقرّب كل فاتورة لهللتين، والملخص يجمع قبل التقريب — فلو جمعنا الأعمدة زي ما هي
    # يطلع فرق هللات. الحل من الفواتير نفسها: المجموع (J) دقيق، فالصافي = المجموع ÷ ١.١٥ والضريبة الباقي،
    # والإجمالي قبل الخصم = أسعار الفواتير شاملة الضريبة (مضاعفات ٠.٠٥) ÷ ١.١٥، والخصم = (الإجمالي − المجموع) ÷ ١.١٥ قبل التقريب.
    rng = lambda c: "%s2:%s%d" % (c, c, last)
    gross_incl = sum(round(float(v) * 1.15 * 20) / 20 for v in col_values(kept, "C", strings))
    net = round(sums["J"] / 1.15 + 1e-9, 2)
    gross = round(gross_incl / 1.15 + 1e-9, 2)
    special = {
        "C": ("ROUND(SUMPRODUCT(ROUND(%s*1.15*20,0))/20/1.15,2)" % rng("C"), gross),
        "D": ("ROUND(SUM(%s)/1.15,2)" % rng("J"), net),
        # الخصم يتقرّب لحاله (زي الملخص) — مو الإجمالي المقرّب ناقص الصافي المقرّب (يفرق هللة أحياناً)
        "E": ("ROUND((SUMPRODUCT(ROUND(%s*1.15*20,0))/20-SUM(%s))/1.15,2)" % (rng("C"), rng("J")), round((gross_incl - sums["J"]) / 1.15 + 1e-9, 2)),
        "I": ("ROUND(J%d-D%d,2)" % (tot, tot), round(sums["J"] - net, 2)),
    }
    def total_cell(c):
        f, v = special.get(c, ("SUM(%s)" % rng(c), round(sums[c], 2)))
        return '<c r="%s%d"><f>%s</f><v>%s</v></c>' % (c, tot, f, repr(v))
    body = "".join(renumber(xml, old, new) for old, new, xml in kept)
    body += '<row r="%d">%s</row>' % (tot, "".join(total_cell(c) for c in COLS))

    open_end = sheet.index(">", sheet.index("<sheetData")) + 1
    sheet = sheet[:open_end] + body + sheet[sheet.index("</sheetData>"):]
    sheet = re.sub(r'(<dimension ref="[A-Z]+\d+:[A-Z]+)(\d+)("/>)', lambda m: m.group(1) + str(tot) + m.group(3), sheet, count=1)
    files[SHEET] = sheet.encode("utf-8")
    # سلسلة الحساب القديمة (لو موجودة) ما تعود تطابق الأسطر — Excel يبنيها من جديد
    if "xl/calcChain.xml" in files:
        names.remove("xl/calcChain.xml")
        ct = files["[Content_Types].xml"].decode("utf-8")
        files["[Content_Types].xml"] = re.sub(r'<Override[^>]*calcChain[^>]*/>', "", ct).encode("utf-8")
        rel = "xl/_rels/workbook.xml.rels"
        if rel in files:
            files[rel] = re.sub(r'<Relationship[^>]*calcChain[^>]*/>', "", files[rel].decode("utf-8")).encode("utf-8")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp.close()
    with zipfile.ZipFile(tmp.name, "w") as out:
        for name in names:
            out.writestr(infos[name], files[name])
    shutil.move(tmp.name, path)
    print("totals: added row %d, removed %d without invoice no (%s)" % (tot, removed, "dropped-rows" if removed else "clean"))


if __name__ == "__main__":
    main(sys.argv[1])
