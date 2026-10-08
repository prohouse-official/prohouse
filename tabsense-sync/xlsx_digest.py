"""بصمة ملف Excel للمقارنة بدون طباعة أرقام: قيم كل الخلايا (مرتبة) + شكل الأعمدة والتنسيق."""
import hashlib, json, re, sys, zipfile


def cells(path):
    z = zipfile.ZipFile(path)
    strings = []
    if "xl/sharedStrings.xml" in z.namelist():
        ss = z.read("xl/sharedStrings.xml").decode("utf-8")
        strings = [re.sub(r"<[^>]+>", "", m) for m in re.findall(r"<si>(.*?)</si>", ss, re.S)]
    sheet = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
    out = []
    for ref, attrs, inner in re.findall(r'<c r="([A-Z]+\d+)"([^>]*?)(?:/>|>(.*?)</c>)', sheet, re.S):
        v = re.search(r"<v>(.*?)</v>", inner or "", re.S)
        f = re.search(r"<f\b", inner or "")
        t = re.search(r'\bt="(\w+)"', attrs)
        typ = t.group(1) if t else "n"
        if t and t.group(1) == "s" and v:
            val = strings[int(v.group(1))]
        elif t and t.group(1) == "inlineStr":
            val = re.sub(r"<[^>]+>", "", inner)
        elif v:
            try:
                val = repr(round(float(v.group(1)), 6))
            except ValueError:
                val = v.group(1)
        else:
            val = ""
        if val == "" and not f:
            continue
        out.append((ref, val, "F" if f else "", typ))
    return sorted(out), sheet, z


def main(path):
    c, sheet, z = cells(path)
    h = lambda x: hashlib.sha256(json.dumps(x, ensure_ascii=False).encode()).hexdigest()[:16]
    cols = re.search(r"<cols>.*?</cols>", sheet, re.S)
    styles = z.read("xl/styles.xml").decode("utf-8")
    print(json.dumps({
        "values": h([(r, v) for r, v, _, _ in c]),
        "values_no_last_row": h([(r, v) for r, v, f, _ in c if not f]),
        "formulas": [r for r, _, f, _ in c if f],
        "byCol": {col: [h([(r, v) for r, v, f, _ in c if re.match(col + r"\d", r) and not f]), sorted(set(t for r, _, f, t in c if re.match(col + r"\d", r) and not f))]
                  for col in "ABCDEFGHIJKLMNO"},
        "G_ws": {
            "norm": h([(r, re.sub(r"\s+", " ", v).strip()) for r, v, f, _ in c if re.match(r"G\d", r)]),
            "lf": sum(v.count("\n") for r, v, f, _ in c if re.match(r"G\d", r)),
            "cr": sum(v.count("\r") for r, v, f, _ in c if re.match(r"G\d", r)),
            "x000": sum(v.count("_x000") for r, v, f, _ in c if re.match(r"G\d", r)),
            "trail": sum(1 for r, v, f, _ in c if re.match(r"G\d", r) and v != v.strip()),
            "amp": sum(v.count("&") for r, v, f, _ in c if re.match(r"G\d", r)),
        },
        "header": h([(r, v) for r, v, _, _ in c if re.match(r"[A-Z]+1$", r)]),
        "cols": h(cols.group(0) if cols else ""),
        "fonts": len(re.findall(r"<font>|<font ", styles)),
        "xfs": re.search(r'<cellXfs count="(\d+)"', styles).group(1) if re.search(r'<cellXfs count="(\d+)"', styles) else "?",
        "sheetName": re.findall(r'<sheet name="([^"]+)"', z.read("xl/workbook.xml").decode("utf-8")),
        "rtl": 'rightToLeft="1"' in sheet,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
