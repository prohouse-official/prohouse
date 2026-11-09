// ==================== مهام المطبخ اليومية (عربي + بنغالي) ====================
// دوام 10م → 10ص. كل موظف عنده قائمة مهام يومية؛ التأشير بينحفظ بالقاعدة (kitchen_task_checks) والشيف والمالك بيتابعوا.
const KT_EMPLOYEES = [
 {
  "id": "rahim",
  "ar": "رحيم",
  "bn": "রহিম",
  "titleAr": "مساعد شيف",
  "titleBn": "সহকারী শেফ",
  "tasks": [
   {
    "tAr": "10:00 م",
    "ar": "إخراج البروتين من الفريزر: دجاج، لحم، جمبري، سالمون، سمك فيليه",
    "tBn": "রাত ১০:০০",
    "bn": "ফ্রিজার থেকে মাংস বের করুন: মুরগি, গরুর মাংস, চিংড়ি, স্যামন মাছ, ফিশ ফিলে"
   },
   {
    "tAr": "10:00 م",
    "ar": "فك التلج عن البروتين (قبل التقطيع)",
    "tBn": "রাত ১০:০০",
    "bn": "বরফ গলান (কাটার আগে)"
   },
   {
    "tAr": "بعد الفك",
    "ar": "تقطيع الدجاج: 4 كجم باربكيو + 4 كجم تندر + 6 كجم دجاج مشوي، والباقي مكعبات.<br><small>مثال: 4 كراتين = 40 كجم ← المكعبات 26 كجم</small>",
    "tBn": "বরফ গলার পর",
    "bn": "মুরগি কাটুন: ৪ কেজি বারবিকিউ, ৪ কেজি টেন্ডার, ৬ কেজি গ্রিল মুরগি। বাকিটা ছোট চৌকো টুকরা (কিউব)।<br><small>উদাহরণ: ৪ কার্টন = ৪০ কেজি হলে কিউব হবে ২৬ কেজি</small>"
   },
   {
    "tAr": "",
    "ar": "تقطيع اللحم: كله مكعبات",
    "tBn": "",
    "bn": "গরুর মাংস: সবটা কিউব করে কাটুন"
   },
   {
    "tAr": "",
    "ar": "السالمون والسمك الفيليه والجمبري: بدون تقطيع",
    "tBn": "",
    "bn": "স্যামন, ফিশ ফিলে ও চিংড়ি: কাটতে হবে না"
   },
   {
    "tAr": "بعد التقطيع",
    "ar": "سلق الدجاج المكعبات بالقدر على نار هادئة<br><small>الباربكيو والتندر والمشوي لا تُسلق</small>",
    "tBn": "কাটার পর",
    "bn": "মুরগির কিউব হাঁড়িতে মৃদু আঁচে সেদ্ধ করুন<br><small>বারবিকিউ, টেন্ডার ও গ্রিল মুরগি সেদ্ধ করবেন না</small>"
   },
   {
    "tAr": "",
    "ar": "سلق اللحم على نار هادئة جداً",
    "tBn": "",
    "bn": "গরুর মাংস খুব মৃদু আঁচে সেদ্ধ করুন"
   },
   {
    "tAr": "قبل 1:00 ص",
    "ar": "الدجاج المكعبات واللحم يكونوا على النار",
    "tBn": "রাত ১:০০-এর আগে",
    "bn": "মুরগির কিউব ও গরুর মাংস চুলায় বসানো থাকতে হবে"
   },
   {
    "tAr": "",
    "ar": "تتبيل السالمون والسمك الفيليه والدجاج المشوي",
    "tBn": "",
    "bn": "স্যামন, ফিশ ফিলে ও গ্রিল মুরগিতে মশলা মাখান"
   },
   {
    "tAr": "قبل 2:00 ص",
    "ar": "كل المتبّل يكون داخل الفرن",
    "tBn": "রাত ২:০০-এর আগে",
    "bn": "মশলা মাখানো সব ওভেনে দিন"
   },
   {
    "tAr": "بعد 2:00 ص",
    "ar": "بدء الطبخ مع الشيف: يقف معه ويتعلم",
    "tBn": "রাত ২:০০-এর পর",
    "bn": "শেফের সাথে রান্না শুরু করুন: শেফের পাশে থেকে শিখুন"
   },
   {
    "tAr": "حوالي 5:00 ص",
    "ar": "بعد انتهاء الطبخ: يكمل الشغل والتنظيف مع الفريق",
    "tBn": "ভোর ৫:০০ (প্রায়)",
    "bn": "রান্না শেষ হলে দলের সাথে বাকি কাজ ও পরিষ্কার করুন"
   },
   {
    "tAr": "6:00 ص",
    "ar": "تسليم طلبية فرع عبداللطيف جميل (مع الفريق)",
    "tBn": "সকাল ৬:০০",
    "bn": "আব্দুল লতিফ জামিল শাখার অর্ডার হস্তান্তর (দলের সাথে)"
   },
   {
    "tAr": "بعد 7:00 ص",
    "ar": "لما يكون كل شيء جاهز: تنظيف مع ارمان",
    "tBn": "সকাল ৭:০০-এর পর",
    "bn": "সব কাজ তৈরি হলে আরমানের সাথে পরিষ্কার করুন"
   },
   {
    "tAr": "10:00 ص",
    "ar": "تسليم طلبية فرع الشاطئ — نهاية الدوام",
    "tBn": "সকাল ১০:০০",
    "bn": "শাতি শাখার অর্ডার হস্তান্তর — ডিউটি শেষ"
   }
  ]
 },
 {
  "id": "arman",
  "ar": "ارمان",
  "bn": "আরমান",
  "titleAr": "مساعد شيف",
  "titleBn": "সহকারী শেফ",
  "tasks": [
   {
    "tAr": "10:00 م",
    "ar": "أول ما يوصل: تقطيع البصل",
    "tBn": "রাত ১০:০০",
    "bn": "এসেই প্রথমে পেঁয়াজ কাটুন"
   },
   {
    "tAr": "بعد البصل",
    "ar": "تقطيع الدجاج واللحم مع رحيم<br><small>نفس الكميات: 4 كجم باربكيو + 4 كجم تندر + 6 كجم مشوي، والباقي مكعبات. اللحم كله مكعبات</small>",
    "tBn": "পেঁয়াজের পর",
    "bn": "রহিমের সাথে মুরগি ও মাংস কাটুন<br><small>একই পরিমাণ: ৪ কেজি বারবিকিউ, ৪ কেজি টেন্ডার, ৬ কেজি গ্রিল মুরগি, বাকিটা কিউব। গরুর মাংস সবটা কিউব</small>"
   },
   {
    "tAr": "مع رحيم",
    "ar": "سلق الدجاج المكعبات واللحم على نار هادئة (الباربكيو والتندر والمشوي لا تُسلق)",
    "tBn": "রহিমের সাথে",
    "bn": "মুরগির কিউব ও গরুর মাংস মৃদু আঁচে সেদ্ধ করুন (বারবিকিউ, টেন্ডার ও গ্রিল মুরগি সেদ্ধ করবেন না)"
   },
   {
    "tAr": "قبل 1:00 ص",
    "ar": "الدجاج المكعبات واللحم يكونوا على النار",
    "tBn": "রাত ১:০০-এর আগে",
    "bn": "মুরগির কিউব ও গরুর মাংস চুলায় বসানো থাকতে হবে"
   },
   {
    "tAr": "",
    "ar": "تتبيل السالمون والسمك الفيليه والدجاج المشوي",
    "tBn": "",
    "bn": "স্যামন, ফিশ ফিলে ও গ্রিল মুরগিতে মশলা মাখান"
   },
   {
    "tAr": "قبل 2:00 ص",
    "ar": "كل المتبّل يكون داخل الفرن",
    "tBn": "রাত ২:০০-এর আগে",
    "bn": "মশলা মাখানো সব ওভেনে দিন"
   },
   {
    "tAr": "بعد 2:00 ص",
    "ar": "بدء الطبخ مع الشيف: يقف معه ويتعلم (مع رحيم)",
    "tBn": "রাত ২:০০-এর পর",
    "bn": "শেফের সাথে রান্না শুরু করুন: রহিমের সাথে শেফের পাশে থেকে শিখুন"
   },
   {
    "tAr": "حوالي 5:00 ص",
    "ar": "بعد انتهاء الطبخ: يكمل الشغل والتنظيف مع الفريق",
    "tBn": "ভোর ৫:০০ (প্রায়)",
    "bn": "রান্না শেষ হলে দলের সাথে বাকি কাজ ও পরিষ্কার করুন"
   },
   {
    "tAr": "طوال الدوام",
    "ar": "مساعدة جميع الأقسام",
    "tBn": "পুরো ডিউটিতে",
    "bn": "সব বিভাগে সাহায্য করুন"
   },
   {
    "tAr": "6:00 ص",
    "ar": "تسليم طلبية فرع عبداللطيف جميل (مع الفريق)",
    "tBn": "সকাল ৬:০০",
    "bn": "আব্দুল লতিফ জামিল শাখার অর্ডার হস্তান্তর (দলের সাথে)"
   },
   {
    "tAr": "بعد 7:00 ص",
    "ar": "لما يكون كل شيء جاهز: تنظيف مع رحيم",
    "tBn": "সকাল ৭:০০-এর পর",
    "bn": "সব কাজ তৈরি হলে রহিমের সাথে পরিষ্কার করুন"
   },
   {
    "tAr": "10:00 ص",
    "ar": "تسليم طلبية فرع الشاطئ — نهاية الدوام",
    "tBn": "সকাল ১০:০০",
    "bn": "শাতি শাখার অর্ডার হস্তান্তর — ডিউটি শেষ"
   }
  ]
 },
 {
  "id": "bobby",
  "ar": "بوبي",
  "bn": "ববি",
  "titleAr": "مسؤول السلطات",
  "titleBn": "সালাদ ইনচার্জ",
  "tasks": [
   {
    "tAr": "10:00 م",
    "ar": "التأكد أن عندك كل المواد المطلوبة للاشتراكات والسلطات<br><small>إذا في شيء ناقص: ابعت لحسن واتساب من بكير</small>",
    "tBn": "রাত ১০:০০",
    "bn": "এসেই দেখে নিন সাবস্ক্রিপশন ও সালাদের সব জিনিস আছে কিনা<br><small>কিছু কম থাকলে আগে থেকেই হাসানকে হোয়াটসঅ্যাপে জানান</small>"
   },
   {
    "tAr": "",
    "ar": "إخراج كل الخضار المطلوبة للسلطات وساندويتشات الاشتراكات<br><small>القائمة في الصفحة الثانية</small>",
    "tBn": "",
    "bn": "সালাদ ও সাবস্ক্রিপশনের স্যান্ডউইচের সব সবজি বের করুন<br><small>তালিকা দ্বিতীয় পৃষ্ঠায়</small>"
   },
   {
    "tAr": "",
    "ar": "غسيل الخضار",
    "tBn": "",
    "bn": "সবজি ধুয়ে নিন"
   },
   {
    "tAr": "بعد الغسيل",
    "ar": "تجهيز خضار سلطات الفروع",
    "tBn": "ধোয়ার পর",
    "bn": "শাখাগুলোর সালাদের সবজি তৈরি করুন"
   },
   {
    "tAr": "قبل 2:00 ص",
    "ar": "سلطات الفروع تكون جاهزة",
    "tBn": "রাত ২:০০-এর আগে",
    "bn": "শাখার সালাদ তৈরি থাকতে হবে"
   },
   {
    "tAr": "بعدها",
    "ar": "مساعدة في الاشتراكات",
    "tBn": "তারপর",
    "bn": "সাবস্ক্রিপশনের কাজে সাহায্য করুন"
   },
   {
    "tAr": "6:00 ص",
    "ar": "تسليم طلبية فرع عبداللطيف جميل (مع الفريق)",
    "tBn": "সকাল ৬:০০",
    "bn": "আব্দুল লতিফ জামিল শাখার অর্ডার হস্তান্তর (দলের সাথে)"
   },
   {
    "tAr": "حتى 7–8 ص",
    "ar": "مساعدة في الطبخ",
    "tBn": "সকাল ৭–৮টা পর্যন্ত",
    "bn": "রান্নার কাজে সাহায্য করুন"
   },
   {
    "tAr": "بعدها",
    "ar": "تنظيف وترتيب",
    "tBn": "তারপর",
    "bn": "পরিষ্কার করুন ও সব গুছিয়ে রাখুন"
   },
   {
    "tAr": "10:00 ص",
    "ar": "تسليم طلبية فرع الشاطئ — نهاية الدوام",
    "tBn": "সকাল ১০:০০",
    "bn": "শাতি শাখার অর্ডার হস্তান্তর — ডিউটি শেষ"
   }
  ]
 },
 {
  "id": "abd",
  "ar": "عبدالرحمن",
  "bn": "আব্দুর রহমান",
  "titleAr": "مسؤول الاشتراكات والحلويات",
  "titleBn": "",
  "tasks": [
   {
    "tAr": "10:00 م",
    "ar": "طباعة ورق الاشتراكات (3 أوراق):<br>1) فاتورة الكمية<br>2) تقرير التغليف PDF<br>3) تقرير التغليف جدول إكسل",
    "tBn": "",
    "bn": ""
   },
   {
    "tAr": "",
    "ar": "فحص الثلاجة والتأكد أن كل شيء موجود",
    "tBn": "",
    "bn": ""
   },
   {
    "tAr": "قبل 11:00 م",
    "ar": "الأصناف التي تحتاج طبخ أو تدخل من الشيف: إرسالها للشيف واتساب",
    "tBn": "",
    "bn": ""
   },
   {
    "tAr": "بعد 11:00 م",
    "ar": "بدء تجهيز الاشتراكات: وضع الجاهز في الأكياس + لصق الورق على الأكياس",
    "tBn": "",
    "bn": ""
   },
   {
    "tAr": "",
    "ar": "التأكد أن كل شيء جاهز للطلبات",
    "tBn": "",
    "bn": ""
   },
   {
    "tAr": "قبل 4:00 ص",
    "ar": "إغلاق الاشتراكات جاهزة",
    "tBn": "",
    "bn": ""
   },
   {
    "tAr": "قبل 5:00 ص",
    "ar": "تسليم الاشتراكات",
    "tBn": "",
    "bn": ""
   },
   {
    "tAr": "4:00 – 8:00 ص",
    "ar": "تجهيز الحلويات وتعلّمها مع الشيف",
    "tBn": "",
    "bn": ""
   },
   {
    "tAr": "6:00 ص",
    "ar": "تسليم طلبية فرع عبداللطيف جميل (مع الفريق)",
    "tBn": "",
    "bn": ""
   },
   {
    "tAr": "بعد 8:00 ص",
    "ar": "تنظيف وترتيب مع الفريق كامل حتى نهاية الدوام",
    "tBn": "",
    "bn": ""
   },
   {
    "tAr": "10:00 ص",
    "ar": "تسليم طلبية فرع الشاطئ — نهاية الدوام",
    "tBn": "",
    "bn": ""
   }
  ]
 }
];
const KT_SALAD_LIST = [{"ar": "الورقيات", "bn": "পাতা জাতীয়", "items": [{"ar": "خس", "bn": "লেটুস"}, {"ar": "جرجير", "bn": "আরুগুলা (রকেট পাতা)"}, {"ar": "كيل", "bn": "কেল পাতা"}, {"ar": "ملفوف ملون", "bn": "লাল বাঁধাকপি"}]}, {"ar": "الخضار", "bn": "সবজি", "items": [{"ar": "خيار", "bn": "শসা"}, {"ar": "طماطم شيري", "bn": "চেরি টমেটো"}, {"ar": "جزر", "bn": "গাজর"}, {"ar": "شمندر", "bn": "বিটরুট"}, {"ar": "بصل", "bn": "পেঁয়াজ"}, {"ar": "فجل", "bn": "মুলা"}, {"ar": "بصل أخضر", "bn": "পেঁয়াজ পাতা"}, {"ar": "هالبينو", "bn": "হালাপেনো মরিচ"}]}, {"ar": "الإضافات", "bn": "অতিরিক্ত জিনিস", "items": [{"ar": "زيتون", "bn": "জলপাই"}, {"ar": "ذرة", "bn": "ভুট্টা"}, {"ar": "حمص", "bn": "ছোলা"}, {"ar": "فاصوليا حمراء", "bn": "লাল রাজমা"}]}, {"ar": "الخضار المشوية", "bn": "গ্রিল করা সবজি", "items": [{"ar": "فلفل رومي مشوي", "bn": "গ্রিল ক্যাপসিকাম"}, {"ar": "كوسة مشوية", "bn": "গ্রিল জুকিনি"}, {"ar": "باذنجان مشوي", "bn": "গ্রিল বেগুন"}, {"ar": "زهرة مشوية", "bn": "গ্রিল ফুলকপি"}, {"ar": "بطاطا حلوة مشوية", "bn": "গ্রিল মিষ্টি আলু"}, {"ar": "بروكلي مشوي", "bn": "গ্রিল ব্রকলি"}]}, {"ar": "البروتين", "bn": "প্রোটিন", "items": [{"ar": "دجاج للسلطة", "bn": "সালাদের মুরগি"}, {"ar": "جمبري للسلطة", "bn": "সালাদের চিংড়ি"}, {"ar": "سالمون للسلطة", "bn": "সালাদের স্যামন"}]}, {"ar": "التقديم والفواكه", "bn": "পরিবেশন ও ফল", "items": [{"ar": "ليمون", "bn": "লেবু"}, {"ar": "خبز محمص", "bn": "টোস্ট রুটি"}, {"ar": "رمان", "bn": "ডালিম"}, {"ar": "توت بري", "bn": "ক্র্যানবেরি"}, {"ar": "عنب", "bn": "আঙুর"}, {"ar": "شرائح تفاح أخضر", "bn": "সবুজ আপেল স্লাইস"}]}, {"ar": "الحبوب والمكرونة", "bn": "শস্য ও পাস্তা", "items": [{"ar": "كينوا", "bn": "কিনোয়া"}, {"ar": "رز سوشي", "bn": "সুশি রাইস"}, {"ar": "مكرونة", "bn": "পাস্তা"}]}, {"ar": "الأجبان", "bn": "চিজ", "items": [{"ar": "جبنة فيتا", "bn": "ফেটা চিজ"}, {"ar": "جبنة حلومي", "bn": "হালুমি চিজ"}, {"ar": "جبنة بارميزان", "bn": "পারমেজান চিজ"}]}, {"ar": "الصوصات", "bn": "সস", "items": [{"ar": "صوص سيزر", "bn": "সিজার সস"}, {"ar": "صوص رانش", "bn": "র‍্যাঞ্চ সস"}, {"ar": "صوص إيطالي", "bn": "ইতালিয়ান সস"}]}, {"ar": "إضافات عبداللطيف جميل", "bn": "আব্দুল লতিফ জামিল শাখার অতিরিক্ত", "items": [{"ar": "بيض أومليت بالجبنة", "bn": "চিজ অমলেট"}, {"ar": "بيض مسلوق", "bn": "সেদ্ধ ডিম"}, {"ar": "تيركي", "bn": "টার্কি"}, {"ar": "بيبروني", "bn": "পেপারনি"}, {"ar": "شرائح لحم", "bn": "মাংসের স্লাইস"}, {"ar": "جبنة شرائح", "bn": "চিজ স্লাইস"}]}];

// الدوام 10م → 10ص: صباح اليوم الجديد (قبل 12 الظهر) لسا ضمن دوام الأمس
function ktShiftDate() {
  const now = new Date();
  return now.getHours() < 12 ? addDaysStr(todayStr(), -1) : todayStr();
}
let ktDate = ktShiftDate();
let ktEmp = "";
let ktRows = {};      // emp → {checks, updated_by, updated_at}
let ktLoadSeq = 0;
let ktWeights = {};   // chicken/meat → {before_thaw, after_thaw, after_cut, updated_by, updated_at}

const ktCanTick = () => ["owner", "chef", "kitchen"].includes(Auth.role());
const ktChecks = (id) => (ktRows[id] && ktRows[id].checks) || {};
const ktDone = (e) => e.tasks.filter((_, i) => ktChecks(e.id)[i]).length;
const ktTime = (iso) => { try { return new Date(iso).toLocaleTimeString(phLocale(), { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };

async function loadKitchenTasksView() {
  const view = document.getElementById("ktasksView");
  if (!view) return;
  if (!document.getElementById("ktBnFont")) { const l = document.createElement("link"); l.id = "ktBnFont"; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;700&display=swap"; document.head.appendChild(l); }
  const seq = ++ktLoadSeq;
  view.innerHTML = '<div class="loader">جاري التحميل…</div>';
  try {
    const [rows, wts] = await Promise.all([SupaEngine.getKitchenChecks(ktDate), SupaEngine.getKitchenWeights(ktDate).catch(() => [])]);
    ktWeights = {}; (wts || []).forEach(w => { ktWeights[w.item] = w; });
    if (seq !== ktLoadSeq) return;
    ktRows = {}; (rows || []).forEach(r => { ktRows[r.emp] = r; });
  } catch (e) {
    if (seq !== ktLoadSeq) return;
    view.innerHTML = `<div class="empty-state">⚠ تعذّر تحميل مهام المطبخ — ${escHtml(e.message || String(e))}</div>`;
    return;
  }
  renderKitchenTasksView();
}

function renderKitchenTasksView() {
  const view = document.getElementById("ktasksView");
  if (!view) return;
  const cur = KT_EMPLOYEES.find(e => e.id === ktEmp);
  view.innerHTML = `
    <h2 class="juice-page-title">👨‍🍳 مهام المطبخ اليومية</h2>
    <div class="item-card">
      <div class="inputs-row"><div class="field"><label>تاريخ الدوام (يبدأ 10 مساءً)</label><input type="date" id="ktDateInput" value="${ktDate}"></div></div>
      <div class="kt-cards">${KT_EMPLOYEES.map(e => {
        const d = ktDone(e), n = e.tasks.length, pct = Math.round(d / n * 100);
        return `<button type="button" class="kt-card ${e.id === ktEmp ? "on" : ""}" data-ktemp="${e.id}">
          <b>${escHtml(e.ar)}${e.bn ? ` · <span class="kt-bn">${e.bn}</span>` : ""}</b>
          <small>${escHtml(e.titleAr)}${e.titleBn ? ` · <span class="kt-bn">${e.titleBn}</span>` : ""}</small>
          <div class="kt-bar"><i style="width:${pct}%"></i></div><span class="kt-n">${d} / ${n}</span></button>`;
      }).join("")}</div>
    </div>
    ${ktWeightsHtml()}
    ${cur ? ktEmployeeHtml(cur) : `<div class="item-card"><div class="cust-hint">اختر موظف لتشوف مهامه.</div></div>`}`;
  bindKitchenTasksView();
}

function ktEmployeeHtml(e) {
  const ck = ktChecks(e.id), canTick = ktCanTick();
  const row = ktRows[e.id];
  return `<div class="item-card kt-list">
    <div class="kt-head"><b>${escHtml(e.ar)}${e.bn ? ` · <span class="kt-bn">${e.bn}</span>` : ""}</b>
      <span>${escHtml(e.titleAr)}${e.titleBn ? ` · <span class="kt-bn">${e.titleBn}</span>` : ""}</span>
      ${row && row.updated_by ? `<small>آخر تحديث: ${escHtml(row.updated_by)} · ${ktTime(row.updated_at)}</small>` : ""}</div>
    ${e.tasks.map((t, i) => {
      const c = ck[i];
      return `<div class="kt-row ${c ? "done" : ""}" ${canTick ? `data-kttask="${i}"` : ""}>
        <span class="kt-chk">${c ? "✓" : ""}</span>
        <div class="kt-body">
          ${(t.tAr || t.tBn) ? `<div class="kt-time">${t.tBn ? `<span class="kt-bn">${t.tBn}</span> · ` : ""}${escHtml(t.tAr)}</div>` : ""}
          ${t.bn ? `<div class="kt-bn kt-txt">${t.bn}</div>` : ""}
          <div class="kt-txt">${t.ar}</div>
          ${c ? `<small class="kt-by">✓ ${escHtml(c.by || "")} · ${ktTime(c.t)}</small>` : ""}
        </div></div>`;
    }).join("")}
    ${e.id === "bobby" ? `<details class="kt-salad"><summary>🥗 قائمة الخضار والمكونات · <span class="kt-bn">সবজি ও জিনিসের তালিকা</span></summary>
      ${KT_SALAD_LIST.map(c => `<div class="kt-sal-cat"><b>${escHtml(c.ar)} · <span class="kt-bn">${c.bn}</span></b>
        ${c.items.map(x => `<div>${escHtml(x.ar)} · <span class="kt-bn">${x.bn}</span></div>`).join("")}</div>`).join("")}</details>` : ""}
    ${canTick ? "" : `<div class="cust-hint">للمتابعة فقط.</div>`}
  </div>`;
}

// ---- أوزان الدجاج واللحم: قبل الذوبان، بعد الذوبان، بعد التقطيع (كجم) — يسجلها فريق التقطيع (رحيم وارمان) ----
const KT_WITEMS = [{ id: "chicken", ar: "الدجاج", bn: "মুরগি" }, { id: "meat", ar: "اللحم", bn: "গরুর মাংস" }];
const KT_WSTAGES = [{ k: "before_thaw", ar: "قبل الذوبان", bn: "বরফ গলার আগে" }, { k: "after_thaw", ar: "بعد الذوبان", bn: "বরফ গলার পরে" }, { k: "after_cut", ar: "بعد التقطيع", bn: "কাটার পরে" }];
const ktPct = (a, b) => (Number(a) > 0 && Number(b) > 0) ? Math.round((Number(b) - Number(a)) / Number(a) * 1000) / 10 : null;
function ktWeightsHtml() {
  const can = ktCanTick();
  return `<div class="item-card kt-w">
    <div class="kt-head"><b>⚖️ أوزان الدجاج واللحم · <span class="kt-bn">মুরগি ও মাংসের ওজন</span></b><small>بالكيلو · <span class="kt-bn">কেজিতে</span></small></div>
    ${KT_WITEMS.map(it => {
      const w = ktWeights[it.id] || {};
      const l1 = ktPct(w.before_thaw, w.after_thaw), l2 = ktPct(w.after_thaw, w.after_cut), lt = ktPct(w.before_thaw, w.after_cut);
      return `<div class="kt-wrow"><div class="kt-wname">${it.ar} · <span class="kt-bn">${it.bn}</span></div>
        <div class="kt-wins">${KT_WSTAGES.map(st => `<label><span>${st.ar}<br><span class="kt-bn">${st.bn}</span></span>
          <input type="number" inputmode="decimal" step="0.01" min="0" data-ktw="${it.id}" data-kts="${st.k}" value="${w[st.k] ?? ""}" ${can ? "" : "disabled"}></label>`).join("")}</div>
        ${(l1 !== null || l2 !== null) ? `<div class="kt-wloss">${l1 !== null ? `الذوبان: ${l1 > 0 ? "+" : ""}${l1}%` : ""}${l2 !== null ? ` · التقطيع: ${l2 > 0 ? "+" : ""}${l2}%` : ""}${lt !== null ? ` · الإجمالي: ${lt > 0 ? "+" : ""}${lt}%` : ""}</div>` : ""}
        ${w.updated_by ? `<small class="kt-by">${escHtml(w.updated_by)} · ${ktTime(w.updated_at)}</small>` : ""}
      </div>`;
    }).join("")}
    ${can ? `<button type="button" class="btn gold" id="ktWSave">💾 حفظ الأوزان · <span class="kt-bn">ওজন সেভ করুন</span></button>` : ""}
  </div>`;
}
async function ktSaveWeights(btn) {
  const who = (Auth.getEmployee() || {}).name || "";
  const rows = KT_WITEMS.map(it => {
    const r = { date: ktDate, item: it.id, updated_by: who, updated_at: new Date().toISOString() };
    KT_WSTAGES.forEach(st => {
      const el = document.querySelector(`[data-ktw="${it.id}"][data-kts="${st.k}"]`);
      const v = el && el.value.trim() !== "" ? Number(el.value) : null;
      r[st.k] = v !== null && isFinite(v) && v >= 0 ? v : null;
    });
    return r;
  }).filter(r => KT_WSTAGES.some(st => r[st.k] !== null) || ktWeights[r.item]);
  if (!rows.length) { showToast("اكتب وزن واحد على الأقل"); return; }
  btn.disabled = true;
  try {
    await SupaEngine.saveKitchenWeights(rows);
    rows.forEach(r => { ktWeights[r.item] = r; });
    showToast("✅ انحفظت الأوزان");
    renderKitchenTasksView();
  } catch (e) { showToast("ما انحفظت الأوزان: " + (e.message || e)); btn.disabled = false; }
}

function bindKitchenTasksView() {
  const $ = (id) => document.getElementById(id);
  if ($("ktDateInput")) $("ktDateInput").addEventListener("change", (e) => { if (e.target.value) { ktDate = e.target.value; loadKitchenTasksView(); } });
  document.querySelectorAll("[data-ktemp]").forEach(b => b.addEventListener("click", () => { ktEmp = ktEmp === b.dataset.ktemp ? "" : b.dataset.ktemp; renderKitchenTasksView(); }));
  document.querySelectorAll("[data-kttask]").forEach(r => r.addEventListener("click", () => ktToggle(Number(r.dataset.kttask))));
  if ($("ktWSave")) $("ktWSave").addEventListener("click", (e) => ktSaveWeights(e.currentTarget));
}

async function ktToggle(i) {
  const e = KT_EMPLOYEES.find(x => x.id === ktEmp);
  if (!e) return;
  const checks = { ...ktChecks(e.id) };
  const who = (Auth.getEmployee() || {}).name || "";
  if (checks[i]) delete checks[i]; else checks[i] = { t: new Date().toISOString(), by: who };
  const row = { date: ktDate, emp: e.id, checks, updated_by: who, updated_at: new Date().toISOString() };
  const before = ktRows[e.id];
  ktRows[e.id] = row;
  renderKitchenTasksView();
  try { await SupaEngine.saveKitchenChecks(row); }
  catch (err) { ktRows[e.id] = before; renderKitchenTasksView(); showToast("ما انحفظ التأشير: " + (err.message || err)); }
}
