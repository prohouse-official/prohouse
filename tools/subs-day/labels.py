# ملصقات تكرار مرقّمة + ملصق لكل طلب ثابت (add) بدون باركود — الرقم على الملصق = رقم مربع الزبون بتقرير التغليف
# الاستعمال (بايثون الـ venv من setup.sh):
#   order  <مجلد> <ملف تكرار> [ملف تكرار…]          → order.json: ترتيب الزباين حسب ملصقات تكرار
#          (إذا order.json موجود بيضل ترتيبه — الزبون الجديد بياخد رقم بعد الموجودين — والطلبات الثابتة بالآخر)
#   labels <مجلد> <ملف تكرار>:<تاريخ> [ملف:تاريخ…]   → labels.pdf: كل ملصق عليه رقم مربعه، وتعديلات الزباين (days) فوق وجباتهم
import fitz, os, re, sys, json
H = os.environ.get('SUBS_HOME', '/tmp/subs-day')
MODE, W = sys.argv[1], os.path.abspath(sys.argv[2])
arch = fitz.Archive(os.path.join(H, 'fonts'))
CSS = '@font-face{font-family:A;src:url(Amiri-Regular.ttf)} @font-face{font-family:N;src:url(NotoSansArabic.ttf)} body{font-family:A;margin:0;color:#000} p{margin:0;line-height:1.2}'
st = json.load(open(os.path.join(W, 'standing.json')))
SID = re.compile(r'(\d{6,8}) -')
def sid_of(p):
    m = SID.search(p.get_text()); return m.group(1) if m else None
def spans(p):
    return [(fitz.Rect(s['bbox']), s['text']) for b in p.get_text('dict')['blocks'] for l in b.get('lines', []) for s in l['spans']]
def html(p, rect, body, size=9):
    p.insert_htmlbox(rect, f'<div dir="rtl" style="font-size:{size}pt">{body}</div>', css=CSS, archive=arch)
def serial(p, n):
    r = fitz.Rect(46, 8, 80, 33)
    p.draw_rect(r, color=(0, 0, 0), width=1.6, overlay=True)
    p.insert_htmlbox(r + (0, 2, 0, 0), f'<div style="font-family:N;font-size:14pt;font-weight:bold;text-align:center">{n}</div>', css=CSS, archive=arch)
def meal_txt(m):
    parts = [f"<b>{m['ar']}</b>"]
    if m.get('protein'): parts.append(f"({m['protein']}P)")
    if m.get('carb'): parts.append(f"+ {m['carb']} {m.get('carb_g', '')} جرام".replace('  ', ' '))
    return ' '.join(parts)
def active(s, d): return (not s.get('from') or s['from'] <= d) and (not s.get('to') or s['to'] >= d)
added = [k for k, v in st.items() if v.get('add')]

if MODE == 'order':
    of = os.path.join(W, 'order.json')
    order = [x for x in (json.load(open(of)) if os.path.exists(of) else []) if x not in added]
    for f in sys.argv[3:]:
        src = fitz.open(f)
        for i in range(1, len(src)):
            s = sid_of(src[i])
            if s and s not in order: order.append(s)
    order += added
    json.dump(order, open(of, 'w')); print(order)
    sys.exit()

order = json.load(open(os.path.join(W, 'order.json')))
num = {s: i + 1 for i, s in enumerate(order)}
out = fitz.open()
for arg in sys.argv[3:]:
    f, day = arg.rsplit(':', 1)
    src = fitz.open(f)
    for i in range(1, len(src)):
        out.insert_pdf(src, from_page=i, to_page=i); p = out[-1]
        s = sid_of(p)
        ov = ((st.get(s) or {}).get('days') or {}).get(day) if s else None
        if ov and not st[s].get('add') and ov.get('meals'):   # تعديل وجبات زبون من تكرار (متل تامر)
            for r, t in spans(p):
                if 66 <= r.y0 < 146 and not re.search(r'[A-Za-z]{3}', t): p.add_redact_annot(r)
            p.apply_redactions(images=0, graphics=0)
            html(p, fitz.Rect(16, 70, 267, 146), ''.join(f"<p>الأطباق الرئيسية: {meal_txt(m)}</p>" for m in ov['meals']), 9)
        if s not in num: print('تحذير: زبون مش بـ order.json', s)
        serial(p, num.get(s, '?'))
    tpl = next((i for i in range(1, len(src)) if not ((st.get(sid_of(src[i])) or {}).get('days'))), 1)
    for k in added:
        y = st[k]
        if not active(y, day): continue
        d = (y.get('days') or {}).get(day) or {}
        meals, ex = d.get('meals') or y.get('meals', []), d.get('extras') or y.get('extras', [])
        out.insert_pdf(src, from_page=tpl, to_page=tpl); p = out[-1]
        for r, t in spans(p):
            if r.y0 > 38 and r.x0 > 5 and not re.match(r'^\d{4}-\d\d-\d\d$', t.strip()): p.add_redact_annot(r)
        p.add_redact_annot(fitz.Rect(8, 186, 276, 283))   # مكان الباركود فاضي
        p.apply_redactions(images=0, graphics=2)
        body = f'<p style="font-size:9.5pt">{y.get("plan", "")} - {k}</p><p style="font-size:10pt"><b>{y["name"]}</b></p>' \
            + ''.join(f'<p>الأطباق الرئيسية: {meal_txt(m)}{" — بدون رز" if not m.get("carb") and "بدون رز" not in m["ar"] else ""}</p>' for m in meals) \
            + ('<p>الإضافات: ' + '، '.join(x['ar'] for x in ex) + '</p>' if ex else '')
        html(p, fitz.Rect(56, 40, 267, 150), body, 8.3)
        html(p, fitz.Rect(197, 152, 283, 167), f'<p dir="ltr" style="text-align:left">{y.get("captain", "")}</p>', 9.5)
        html(p, fitz.Rect(31, 152, 140, 167), f'<p dir="ltr" style="text-align:left">{y.get("window", "")}</p>', 8)
        html(p, fitz.Rect(31, 169, 140, 184), f'<p style="text-align:right">{y.get("city", "")}</p>', 8)
        serial(p, num.get(k, '?'))
out.save(os.path.join(W, 'labels.pdf'), garbage=3, deflate=True)
print('labels', len(out))
