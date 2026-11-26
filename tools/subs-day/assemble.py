# الملف النهائي بالترتيب المعتمد: فاتورة ع، فاتورة ب، تغليف ع، تغليف ب، ورقة الطلبات الثابتة، ملصقات تكرار، طلبية الغد للشيف ع/ب
# الاستعمال: assemble.py <مجلد> <اسم الملف الناتج.pdf>   (أي جزء مش موجود بينتخطى)
import fitz, os, sys
W, NAME = os.path.abspath(sys.argv[1]), sys.argv[2]
P = lambda f: os.path.join(W, f)
s = fitz.open(P('sheets.pdf')); o = fitz.open()
# sheets.pdf بالترتيب: تغليف ع · تغليف ب · فاتورة ع · فاتورة ب · الطلبات الثابتة (كل قسم صفحة أو أكتر) · ملصقات احتياطية (صغيرة، بتنشال)
# الأقسام بتنفصل بتغيّر اللغة (عربي/بنقالي)
runs = []
for i, p in enumerate(s):
    if p.rect.width < 400: continue
    t = p.get_text()   # بنقالي = حروفه أكتر من العربي (ورقة الطلبات الثابتة عربي وفيها ترجمة بنقالي صغيرة)
    bn = sum('\u0980' <= c <= '\u09ff' for c in t) > sum('\u0600' <= c <= '\u06ff' or '\ufb50' <= c <= '\ufeff' for c in t)
    if not runs or runs[-1][0] != bn: runs.append((bn, []))
    runs[-1][1].append(i)
for k in [2, 3, 0, 1, 4]:
    for i in (runs[k][1] if k < len(runs) else []): o.insert_pdf(s, from_page=i, to_page=i)
for f in ['labels.pdf', 'chef_ar.pdf', 'chef_bn.pdf']:
    if os.path.exists(P(f)): o.insert_pdf(fitz.open(P(f)))
o.save(P(NAME), garbage=3, deflate=True); print(NAME, len(o), 'صفحة')
