# تصنيف أسطر فواتير المشتريات لمواد خام (inv_materials) وأحجام العبوات (inv_aliases) — يشتغل محلياً على ملف أسطر (lines.json) ويطلع catalog.json.
# الاستخدام: python3 -I classify.py <مجلد فيه lines.json>  — الملفات الناتجة ما تنرفع للمستودع (فيها أسعار).
import json, re, sys, statistics
from collections import defaultdict
D = sys.argv[1]
rows = json.load(open(D + '/lines.json'))

# (id, الاسم, التصنيف بالمخزون, وحدة الأساس, regex)  — الترتيب مهم (الأدق أول)
R = [
 ('protein_bar','بار بروتين وسناكات','حلويات ومخبوزات','وحدة', r'بار بروتين|جالكسي'),
 # بروتين
 ('chicken_breast','صدور دجاج (تندر)','بروتين','جم', r'(صدور|تندر).*دجاج|دجاج.*(صدور|تندر)'),
 ('chicken_whole','دجاج كامل','بروتين','جم', r'دجاج.*(كامل|900|1000|سيارا|هلال|التنمية|بريدكس)|الدجاج الكامل|كامل دجاج'),
 ('beef_fillet','فيليه بقر','بروتين','جم', r'(في?لي?ه|فلية).*بقر|بقر.*(في?لي?ه|فلية)|بقري فيليه'),
 ('beef_striploin','ستربلوين بقر','بروتين','جم', r'استربليون|ستربلوين'),
 ('beef_brisket','بريسكت بقر','بروتين','جم', r'بريسكت'),
 ('beef_forequarter','لحم بقر فوركوارتر','بروتين','جم', r'فوركوارتر'),
 ('beef_mince','لحم مفروم','بروتين','جم', r'مفروم'),
 ('beef_liver','كبدة بقر','بروتين','جم', r'كبدة'),
 ('salmon','سالمون فيليه','بروتين','جم', r'سالمون'),
 ('fish_fillet','سمك فيليه','بروتين','جم', r'سمك|فليه سمك'),
 ('shrimp','جمبري منظف','بروتين','جم', r'جمبري'),
 ('turkey','ديك رومي مدخن / تركي','بروتين','جم', r'ديك رومي|تركي (بيبي|مدخن)|SMKD TRKY|SMOKED TURKEY|مرتديلا'),
 ('pepperoni','بيبروني','بروتين','جم', r'بيبروني'),
 ('tuna','تونة معلبة','بروتين','حبة', r'تونة|TUNA'),
 ('eggs','بيض','بروتين','حبة', r'(^|\s)بيض(\s|$|×|—)|EGG'),
 # نشويات
 ('rice','رز','نشويات','جم', r'(^|\s)رز(\s|$)|RICE'),
 ('pasta','مكرونة','نشويات','جم', r'مكرونة|PENNE|فيتوتشيني|LASAGNA|بيرفيتو'),
 ('potato','بطاطس','نشويات','جم', r'^بطاطس'),
 ('flour','دقيق','نشويات','جم', r'دقيق|FLOUR'),
 ('oats','شوفان','نشويات','جم', r'OATS|شوفان(?! باريستا)'),
 ('bread_samoli','خبز صامولي','مخبوزات','حبة', r'صامولي|SAMOLI'),
 ('bread_burger','خبز برجر / بريوش','مخبوزات','حبة', r'^(?!.*جبنة).*(برجر|BURGER|BRIOCHE|بريوش|HOT DOG)'),
 ('tortilla','تورتيلا','مخبوزات','حبة', r'تورتيلا|TORTILLA'),
 ('toast','توست وخبز شرائح','مخبوزات','وحدة', r'توست|TOAST|SLICED BREAD|خبز نخالة|BRAN BREAD|خبز بذور|SEEDS BRD|عريكة'),
 ('rice_ital','رز','نشويات','جم', r'ريس شطاف'),
 # ألبان
 ('mozzarella','جبنة موزاريلا','ألبان','جم', r'موزاريلا'),
 ('cheddar','جبنة شيدر','ألبان','جم', r'شيدر'),
 ('feta','جبنة فيتا','ألبان','جم', r'فيتا|FETA'),
 ('halloumi','جبنة حلوم','ألبان','جم', r'حلوم'),
 ('cream_cheese','جبنة قشدة / كيري / فيلادلفيا','ألبان','جم', r'قشدة|Philadelphia|كيري|KIRI|كريمية'),
 ('parmesan','جبنة بارميزان','ألبان','جم', r'PARMESAN|بارميزان'),
 ('cheese_slices','جبنة شرائح ومربعات','ألبان','وحدة', r'جبنة.*(شرائح|مربعات)|شرائح جبنة|جبنة بيضاء'),
 ('butter','زبدة','ألبان','جم', r'زبدة|BUTTER(?!MILK)'),
 ('cooking_cream','كريمة طبخ','ألبان','مل', r'كريمة (ال)?طبخ|COOKING CREAM|CREAM CHANTILLE|ALMARAI COOKING'),
 ('qishta','قشطة','ألبان','حبة', r'قشطة|KISTA|PUK|PUCK|ANALOGUE CREAM|HALA CREAM'),
 ('yogurt','زبادي','ألبان','جم', r'زبادي|YOG|YOGHURT|YOGURT'),
 ('laban','لبن','ألبان','مل', r'لبن|LABAN'),
 ('milk','حليب','ألبان','مل', r'^(?!.*(CONDENSED|POWDER|NIDO|Alpro|Oatly|شوفان|جوز الهند)).*(حليب|MILK|NEW MIL)'),
 ('plant_milk','حليب نباتي (باريستا)','مشروبات','مل', r'Alpro|Oatly|حليب (جوز|شوفان)'),
 # زيوت وصوصات
 ('olive_oil','زيت زيتون','زيوت وصوصات','مل', r'زيت (ال)?زيتون|OLIVE OIL'),
 ('corn_oil','زيت ذرة / قلي','زيوت وصوصات','مل', r'زيت ذرة|CORN OIL|زيت عافية'),
 ('mayo','مايونيز','زيوت وصوصات','مل', r'مايونيز|MAYONNAISE'),
 ('bbq','صوص باربكيو','زيوت وصوصات','مل', r'باربي?كيو|BARBECUE'),
 ('ketchup','كاتشب','زيوت وصوصات','جم', r'كا?تشب|KETCHUP|TOM KET'),
 ('hot_sauce','شطة / صوص حار','زيوت وصوصات','جم', r'شطة|HOT S\w*CE|صوص رنا حار'),
 ('mustard','خردل','زيوت وصوصات','مل', r'خردل|MUSTARD'),
 ('soy','صوص صويا / محار','زيوت وصوصات','مل', r'صويا|SOY|محار|OYSTER'),
 ('tahini','طحينة','زيوت وصوصات','جم', r'طحينة|THAHINA'),
 ('tomato_paste','معجون طماطم','زيوت وصوصات','جم', r'معجون طماطم|TOMATO PASTE'),
 ('pepper_paste','معجون فلفل','زيوت وصوصات','جم', r'PEPPER PASTE|معجون فلفل'),
 ('stock','مرقة دجاج / ديمي جلاس','زيوت وصوصات','جم', r'مرقة|STOCK|DEMI GLACE|ديمي جلاس'),
 ('vinegar','خل','زيوت وصوصات','مل', r'VINEGAR|خل '),
 ('lemon_juice','عصير ليمون','زيوت وصوصات','مل', r'LEMON JUICE'),
 ('pomegranate_molasses','دبس رمان','زيوت وصوصات','مل', r'دبس|DIBS'),
 ('syrups','شيرة وصوصات حلى','حلويات ومخبوزات','وحدة', r'شراب|شيرة|SYRUP|ARABIC SWEET'),
 ('jalapeno','هالبينو','معلبات','جم', r'هالبينو|JALAPENO'),
 ('olives','زيتون شرائح','معلبات','جم', r'OLIVE BK|زيتون أسود'),
 ('corn','ذرة حلوة','معلبات','جم', r'SWEET CORN|ذرة حلوة'),
 ('mushroom','مشروم','معلبات','جم', r'MUSHROOM|مشروم'),
 ('molokhia','ملوخية','معلبات','جم', r'ملوخية|MOLOKHIA'),
 ('chickpeas_beans','حمص وفول وبقوليات','معلبات','وحدة', r'CHICKPEAS|حمص|فول|KIDNEY|QUINOA'),
 # حلويات ومكونات
 ('sugar','سكر','حلويات ومخبوزات','جم', r'سكر(?! محلي)|SUGAR(?!.*STEVI)'),
 ('honey','عسل','حلويات ومخبوزات','جم', r'عسل|HONEY'),
 ('cocoa_choc','كاكاو وشوكولاتة','حلويات ومخبوزات','وحدة', r'كاكاو|COCOA|شوكولا|CHOCO|نوتيلا|NUTELLA'),
 ('dates_paste','معجون تمر','حلويات ومخبوزات','جم', r'معجون تمر|TAMARA'),
 ('baking','بيكنج باودر / خميرة / فانيلا','حلويات ومخبوزات','وحدة', r'BAKING|YEAST|خميرة|VANILLA|فانيلا|Cake Gel|Pancake|PANCAKE|CONDENSED|NIDO|RAISINS|PRUNES|برقوق|BERRIES|COCONUT POWDER|دايجستف'),
 ('cornflakes','كورن فليكس','حلويات ومخبوزات','جم', r'كورن فليكس|CONFLEX'),
 ('protein_bar','بار بروتين وسناكات','حلويات ومخبوزات','وحدة', r'بار بروتين|جالكسي'),
 ('sweetener','محلي ستيفيا','مشروبات','وحدة', r'STEVI|ستيفيانا|Steviana'),
 # مشروبات
 ('coffee','بن (قهوة)','مشروبات','جم', r'بن |Suwaa|Soil|بن$|COFFEE(?! Filter)'),
 ('juice','عصائر سانتي ومعلبة','مشروبات','حبة', r'عصير|عصائر|JUICE'),
 ('soft_drinks','مشروبات غازية','مشروبات','حبة', r'كوكاكولا|سبرايت|COLA'),
 ('water','مياه','مشروبات','وحدة', r'مياه|ماء|WATER'),
 ('tea','شاي','مشروبات','وحدة', r'شاي|TEA'),
 # بهارات
 ('salt','ملح','بهارات','جم', r'ملح|SALT'),
 ('ajinomoto','أجينوموتو','بهارات','جم', r'AJI|اجينوموتو'),
 ('paprika','بابريكا','بهارات','جم', r'PAPRIKA|بابريكا'),
 ('spices','بهارات متنوعة','بهارات','وحدة', r'.'),  # أي شي ثاني بتصنيف بهارات
]
VEG = [
 ('potato','بطاطس','نشويات','جم', r'بطاطس'),
 ('veg_more','خضار (كوسة، باذنجان، ملفوف…)','خضار وفواكه','وحدة', r'كوسة|باذنجان|ملفوف|قرع|شمندر|فجل|فلفل حار|فلفل أحمر حار'),
 ('cherry_tomato','طماطم شيري','خضار وفواكه','وحدة', r'شيري|Cherry'),
 ('tomato','طماطم','خضار وفواكه','وحدة', r'طماطم(?! شيري)|^TOMATO'),
 ('onion','بصل','خضار وفواكه','وحدة', r'بصل'),
 ('lettuce','خس','خضار وفواكه','وحدة', r'خس|LETTUCE'),
 ('peppers','فلفل رومي (أخضر/ألوان)','خضار وفواكه','وحدة', r'رومي|Pepper'),
 ('cucumber','خيار','خضار وفواكه','وحدة', r'خيار'),
 ('carrot','جزر','خضار وفواكه','وحدة', r'جزر|CARROT'),
 ('lemon','ليمون','خضار وفواكه','وحدة', r'ليمون|Lemon'),
 ('herbs','أعشاب (بقدونس، كزبرة، نعناع، جرجير…)','خضار وفواكه','وحدة', r'بقدونس|كزبرة|نعناع|جرجير|شبت|ريحان|روزماري|Rosemary|كرفس|كيل|Kale|NANA'),
 ('broccoli_cauli','بروكلي وزهرة','خضار وفواكه','وحدة', r'بروكلي|زهرة'),
 ('garlic','ثوم','خضار وفواكه','وحدة', r'ثوم'),
 ('fruits','فواكه','خضار وفواكه','وحدة', r'موز|تفاح|عنب|رمان|فاكهة|أفوكادو|AVOCADO'),
 ('veg_other','خضار أخرى','خضار وفواكه','وحدة', r'.'),
]
PACK = [
 ('pk_microwave','علب ميكرويف','تغليف','وحدة', r'MICROWAVE|ميكرويف|هوتباك'),
 ('pk_cutlery','أطقم ملاعق ومناديل','تغليف','وحدة', r'SPOON|ملعقة'),
 ('pk_sauce_cup','كاسات صوص','تغليف','وحدة', r'SAUCE CUP|كوب صوص'),
 ('pk_containers','علب وصحون (ورق/بلاستيك)','تغليف','وحدة', r'CONTAINER|BASE RECT|BOWL|AREEKA|علب|علبة|صحن|صينية'),
 ('pk_cups','أكواب وأغطية','تغليف','وحدة', r'Cups|CUP|Lids|كوب|غطاء|أكواب'),
 ('pk_gloves','قفازات','تغليف','وحدة', r'GLOVES|قفاز'),
 ('pk_film_foil','سلوفان وألمنيوم وورق زبدة','تغليف','وحدة', r'CLING|FOIL|BAKING PAPER|ألمنيوم|رول بلاستيك|PLISTIC ROLL'),
 ('pk_bags','أكياس','تغليف','وحدة', r'BAG|KEES|كيس|أكياس'),
 ('pk_tissue','مناديل','تغليف','وحدة', r'TISSUE|مناديل|Blue Roll|AIJEEN'),
 ('pk_other','تغليف ومستلزمات أخرى','تغليف','وحدة', r'.'),
]
CLEAN = [('cleaning','منظفات','منظفات وأدوات','وحدة', r'.')]
TOOLS = [('tools','أدوات مطبخ','منظفات وأدوات','وحدة', r'.')]
NONFOOD = [('nonfood','غير غذائي (ورق، فحم، بنزين…)','منظفات وأدوات','وحدة', r'A4|ورق طابعة|فحم|FAHAM|بنزين|TOOTH|أعواد|NOSIL|Filter|فلتر|Stirrer')]
SUMMARY = re.compile(r'مشتريات —|مشتريات حسب|غير مفصل|غير مذكور|غير محدد|غير واضح|غير مقروء|الوصف مقطوع|صنفان|تسوية|ألبان ومواد|لبن وزبادي وحليب|جبنة وزبدة|أغراض للشيف|عصير ولبنة|خبز و تركي|ماء ونعناع|ملوخية وزبدة|زيت عافية وزيت|مواد غذائية|خضروات$|^VEGETABLE|منتج مخبز|فاتورة مختلطة|^ACEE|عصائر سانتي$|^مياه$')

def pick(r):
    n, c = r['n'], r['c']
    if SUMMARY.search(n) and not re.search(r'\d+\s*(كجم|جم|لتر|مل|KG|GM|LTR)', n, re.I) and c != 'لحوم':
        return ('misc_' + c, 'غير مفصّل — ' + c, 'غير مفصّل', 'قيمة')
    if c == 'لحوم' and 'بروتينات' in n: return next(x[:4] for x in R if x[0] == 'chicken_whole')
    for rule in NONFOOD:
        if re.search(rule[4], n, re.I): return rule[:4]
    groups = {'خضراوات': VEG + R, 'بقالة': R[:-1] + VEG[:-1] + PACK[:-1] + [R[-1]], 'بلاستيك وتغليف': PACK, 'منظفات': CLEAN, 'أدوات طبخ': TOOLS}
    for rule in groups.get(c, R if c != 'بهارات' else R):
        if c == 'بلاستيك وتغليف' or re.search(rule[4], n, re.I):
            if rule[0] == 'spices' and c != 'بهارات': continue
            if c == 'بلاستيك وتغليف':
                for p in PACK:
                    if re.search(p[4], n, re.I): return p[:4]
            return rule[:4]
    if c == 'مشروبات':
        for p in PACK:
            if p[0] != 'pk_other' and re.search(p[4], n, re.I): return p[:4]
    return ('other_' + c, 'أخرى — ' + c, 'أخرى', 'وحدة')

NUM = r'(\d+(?:[.,]\d+)?)'
def sizes(text):
    """أحجام بالنص بوحدة الأساس: (جم, مل)"""
    t = text.replace('،', ' ')
    g = [float(m.group(1).replace(',', '.')) * (1000 if m.group(2).lower() in ('كجم','kg','كيلو','k','ك') else 1)
         for m in re.finditer(NUM + r'\s*(كجم|كيلو|KG|K\b|ك\b|جم|GM|G\b|gm|جرام)', t, re.I)]
    ml = [float(m.group(1).replace(',', '.')) * (1000 if m.group(2).lower() in ('لتر','ltr','l','lit','liter','litre') else 1)
          for m in re.finditer(NUM + r'\s*(لتر|LTR|LIT\w*|L\b|مل|ML)', t, re.I)]
    g += [float(m.group(2)) * 1000 for m in re.finditer(r'(كجم|ك)\s*(\d+)(?!\s*/)', t)]
    oz = [float(m.group(1)) * 28.35 for m in re.finditer(NUM + r'\s*(أونز|OZ)', t, re.I)]
    return [x for x in g + oz if x >= 10], ml

def mult(text):
    m = re.search(r'(?<![\d.])(\d+)\s*[×xX\*]\s*\d', text) or re.search(r'[×xX\*]\s*(\d+)\b(?!\s*(?:كجم|جم|مل|لتر|GM|KG|ML|L\b))', text) or re.search(r'كرتون\s*(\d+)(?!\s*(?:كجم|جم|مل|لتر))', text)
    if m: return int(m.group(1))
    m = re.search(r'(?:Box|كرتون|C)\s*(\d+)\s*(?:Pcs|حبة|P\b|أطباق|زجاجة)', text, re.I)
    if m: return int(m.group(1)) * (30 if 'أطباق' in text else 1)
    m = re.search(r'(\d+)\s*(?:Pcs|PCS|pcs|حبة|قطعة|P\b)', text)
    if m: return int(m.group(1))
    return 1

def candidates(r, base):
    n, u = r['n'], r['u'] or ''
    ul = u.strip().lower()
    if base == 'وحدة' or base == 'قيمة': return [1]
    if base == 'حبة':
        m = mult(u + ' ' + n)
        if re.search(r'بيض', n):
            if re.search(r'كرتون|CASE', u + n, re.I): m = max(m, 300) if 'أطباق' not in u else m
            if '30×10' in n: m = 300
            am = re.search(r'(\d+)\s*أطباق', u)
            if am: m = int(am.group(1)) * 30
            if re.search(r'^(بيض|EGG PIECE)', n) and m == 1 and r.get('pu', 0) > 50: m = 300
        return [m] + ([1] if m != 1 else [])
    if r.get('mid') == 'potato' and re.search(r'كيس', u):
        return [10000, 20000]
    if r.get('mid') == 'chicken_whole':
        return [9000, 10000, 900, 1000]
    g, ml = sizes(u + ' ' + n)
    vals = g if base == 'جم' else ml
    if base == 'مل' and not vals and g: vals = g  # كثافة قريبة من 1
    if base == 'جم' and not vals and ml: vals = ml
    if ul in ('كجم','kg','kilogram','كيلو','كجم/وحدة'): return [1000]
    if ul in ('جرام','gm','g'): return [1]
    if ul in ('لتر','ltr','l'): return [1000]
    m = mult(u + ' ' + n)
    out = []
    for v in vals:
        out += [v * m, v]
    gal = re.match(r'(\d+)\s*(gallon|جالون)', ul)
    if gal and vals: out.insert(0, vals[0] * int(gal.group(1)) * (1 if m > 1 else 1))
    out += [1000]
    return [x for i, x in enumerate(out) if x and x not in out[:i]]

mats = {}
lines = []
for r in rows:
    mid, name, cat, base = pick(r)
    if mid == 'rice_ital': mid, name = 'rice', 'رز'
    mats.setdefault(mid, {'id': mid, 'name': name, 'cat': cat, 'base': base})
    q = float(r['q'] or 0); t = float(r['t'] or 0)
    r['pu'] = t / q if q else 0
    r['mid'] = mid
    lines.append((r, mid, candidates(r, base)))

# سعر مرجعي لكل مادة: من الأسطر اللي وحدتها واضحة (كجم/لتر) أو أول مرشح
ref = {}
for mid in mats:
    ps = []
    for r, m, cs in lines:
        if m != mid or not float(r['q'] or 0): continue
        ps.append(r['pu'] / cs[0])
    if ps: ref[mid] = statistics.median(ps)
    if mid == 'chicken_whole':
        ps = [r['pu'] / 9000 for r, m, cs in lines if m == mid and float(r['q'] or 0)]
        if ps: ref[mid] = statistics.median(ps)
out = []
for r, mid, cs in lines:
    q = float(r['q'] or 0); t = float(r['t'] or 0)
    base = mats[mid]['base']
    pack = cs[0]
    if q and mid in ref and len(cs) > 1 and base in ('جم','مل','حبة'):
        # المرشح اللي سعره أقرب للسعر المرجعي
        pack = min(cs, key=lambda p: abs(__import__('math').log((r['pu'] / p) / ref[mid])) if r['pu'] > 0 else 0)
    out.append({'c': r['c'], 'n': r['n'], 'u': r['u'] or '', 'mid': mid, 'pack': None if base in ('قيمة',) else pack,
                'est': None if q else (ref.get(mid) if base in ('جم','مل','حبة') else None), 'k': r['k'], 'q': q, 't': t})
json.dump({'mats': list(mats.values()), 'aliases': out, 'ref': ref}, open(D + '/catalog.json', 'w'), ensure_ascii=False)
# تقرير
agg = defaultdict(lambda: [0, 0, 0, 0])
for a in out:
    m = mats[a['mid']]
    qb = a['q'] * a['pack'] if a['q'] and a['pack'] else ((a['t'] / a['est']) if a['est'] else 0)
    agg[a['mid']][0] += qb; agg[a['mid']][1] += a['t']; agg[a['mid']][2] += 1; agg[a['mid']][3] += (0 if a['q'] else a['t'])
for mid, (qb, t, k, est) in sorted(agg.items(), key=lambda x: -x[1][1]):
    m = mats[mid]; b = m['base']
    disp = f"{qb/1000:,.1f} {'كجم' if b=='جم' else 'لتر'}" if b in ('جم','مل') else (f"{qb:,.0f} {b}" if b in ('حبة','وحدة') else '')
    pr = f"{t/(qb/1000):.2f}/{'كجم' if b=='جم' else 'لتر'}" if b in ('جم','مل') and qb else (f"{t/qb:.2f}/{b}" if qb and b!='قيمة' else '')
    print(f"{m['cat'][:8]:8} {m['name'][:28]:28} {t:>9,.0f} SAR  {disp:>14}  {pr:>12}  lines={k} est={est:,.0f}")
print(len(mats), 'materials')
for a in out:
    if a['mid'].startswith('other_') or a['mid']=='veg_other': print('  OTHER', a['mid'], a['t'], '|', a['n'][:60], '|', a['u'])
