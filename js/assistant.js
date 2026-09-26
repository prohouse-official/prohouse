// ==================== 💬 المساعد: يجاوب الموظف على أسئلة استخدام التطبيق ====================
// مجاني بالكامل: الأجوبة مكتوبة هنا وتنطابق مع سؤال الموظف على الجهاز نفسه (بدون أي API).
// إذا انحط مفتاح Gemini المجاني بأسرار Supabase (GEMINI_API_KEY)، الأسئلة اللي ما لها جواب هنا
// تروح لدالة assistant وتجاوب بالذكاء الاصطناعي. بدون المفتاح يشتغل عادي بالأجوبة الجاهزة.
const ASSIST_FAQ = [
  { id: "date", tab: null, k: "تاريخ التاريخ يوم امس غلط اليوم date day yesterday today wrong তারিখ আজ গতকাল",
    q: { ar: "كيف أتأكد من التاريخ؟", en: "How do I check the date?", bn: "তারিখ কীভাবে দেখব?" },
    a: { ar: "التاريخ فوق كل شاشة، ولازم يكون «اليوم». غلط؟ اضغط زر «اليوم». تبي أمس؟ اضغط «أمس». والأسهم تنقلك يوم لقدام أو لورا.",
         en: "The date is at the top of every screen and must say \"Today\". Wrong? Tap \"Today\". Need yesterday? Tap \"Yesterday\". The arrows move one day forward or back.",
         bn: "প্রতিটি স্ক্রিনের উপরে তারিখ আছে, এটা \"আজ\" হতে হবে। ভুল? \"আজ\" চাপুন। গতকাল লাগবে? \"গতকাল\" চাপুন। তীর দিয়ে এক দিন আগে/পরে যান।" } },
  { id: "branch", tab: null, k: "فرع الفرع فرعي branch শাখা",
    q: { ar: "الفرع غلط، وش أسوي؟", en: "The branch is wrong, what do I do?", bn: "শাখা ভুল, কী করব?" },
    a: { ar: "الفرع مكتوب تحت عنوان الشاشة 🏪. كل موظف يشوف فرعه بس. إذا الفرع غلط، كلّم المدير يعدّله لك من «الموظفين».",
         en: "The branch is shown under the screen title 🏪. Each employee only sees their own branch. If it's wrong, ask the manager to fix it in \"Employees\".",
         bn: "শাখা স্ক্রিনের শিরোনামের নিচে দেখায় 🏪। প্রত্যেকে শুধু নিজের শাখা দেখে। ভুল হলে ম্যানেজারকে \"কর্মী\" থেকে ঠিক করতে বলুন।" } },
  { id: "add", tab: "receiving", k: "اضيف اضافه إضافة صنف زايد زائد جديد غير موجود مو موجود مش موجود القائمه add extra new item missing list যোগ নতুন আইটেম",
    q: { ar: "وصلني صنف مو بالقائمة، كيف أضيفه؟", en: "An item isn't on the list, how do I add it?", bn: "তালিকায় নেই এমন আইটেম কীভাবে যোগ করব?" },
    a: { ar: "انزل لآخر القسم (مثلاً دجاج) واضغط «➕ إضافة صنف». اكتب الاسم والكمية واضغط «✅ إضافة».",
         en: "Scroll to the end of the section (e.g. Chicken) and tap \"➕ Add item\". Type the name and quantity, then tap \"✅ Add\".",
         bn: "বিভাগের শেষে যান (যেমন মুরগি) এবং \"➕ আইটেম যোগ\" চাপুন। নাম ও পরিমাণ লিখে \"✅ যোগ\" চাপুন।" } },
  { id: "over", tab: "receiving", k: "اكثر من الطلب زياده ناقص اقل فرق زائد more than ordered over less short difference বেশি কম",
    q: { ar: "وصلني أكثر أو أقل من الطلب؟", en: "I got more or less than ordered?", bn: "অর্ডারের চেয়ে বেশি বা কম এসেছে?" },
    a: { ar: "اكتب الرقم اللي وصلك فعلاً. أكثر من الطلب يطلع «زائد»، وأقل يطلع «ناقص». هذا طبيعي، المهم الرقم يكون صح.",
         en: "Enter what actually arrived. More than ordered shows \"Over\", less shows \"Short\". That's fine — just make sure the number is right.",
         bn: "যা আসলে এসেছে সেটাই লিখুন। বেশি হলে \"বেশি\", কম হলে \"কম\" দেখাবে। এটা স্বাভাবিক — শুধু সংখ্যা ঠিক রাখুন।" } },
  { id: "missing", tab: "receiving", k: "ما وصل لم يصل ماوصل وصل not arrived didn't arrive never came আসেনি",
    q: { ar: "صنف ما وصل؟", en: "An item didn't arrive?", bn: "কোনো আইটেম আসেনি?" },
    a: { ar: "اضغط «لم يصل (0)» على الصنف. وإذا الصنف أصلاً ما يخص اليوم، اضغط ✕ عشان تشيله.",
         en: "Tap \"Not arrived (0)\" on the item. If the item doesn't belong to today at all, tap ✕ to remove it.",
         bn: "আইটেমে \"আসেনি (0)\" চাপুন। আইটেম আজকের না হলে ✕ চেপে সরান।" } },
  { id: "save", tab: null, k: "حفظ احفظ انحفظ يحفظ محفوظ save saved saving সংরক্ষণ",
    q: { ar: "كيف أحفظ؟", en: "How do I save?", bn: "কীভাবে সংরক্ষণ করব?" },
    a: { ar: "كل رقم تكتبه يُحفظ تلقائياً. وبالأخير اضغط «💾 حفظ» تحت عشان تتأكد إن كل شيء وصل للنظام.",
         en: "Every number you type saves automatically. At the end tap \"💾 Save\" at the bottom to make sure everything reached the system.",
         bn: "প্রতিটি সংখ্যা নিজে থেকেই সংরক্ষিত হয়। শেষে নিচের \"💾 সংরক্ষণ\" চাপুন যাতে সব সিস্টেমে যায়।" } },
  { id: "offline", tab: null, k: "نت انترنت الإنترنت شبكه اتصال طاح واي فاي offline internet wifi connection network ইন্টারনেট নেট",
    q: { ar: "النت طاح، وش يصير؟", en: "The internet dropped, what happens?", bn: "ইন্টারনেট চলে গেছে, কী হবে?" },
    a: { ar: "لا تشيل هم: الأرقام تُحفظ في الجوال وترتفع تلقائياً أول ما يرجع النت. بس لا تسكّر الصفحة قبل ما يرجع.",
         en: "Don't worry: numbers are kept on the phone and upload automatically when the internet is back. Just don't close the page before that.",
         bn: "চিন্তা নেই: সংখ্যা ফোনে থাকে এবং নেট ফিরলে নিজে থেকেই যায়। শুধু তার আগে পেজ বন্ধ করবেন না।" } },
  { id: "edit", tab: null, k: "اعدل تعديل عدل غلطت غلط خطا رقم غلط اغير edit change mistake wrong number fix ভুল বদল",
    q: { ar: "كتبت رقم غلط، كيف أعدّله؟", en: "I typed a wrong number, how do I fix it?", bn: "ভুল সংখ্যা লিখেছি, কীভাবে ঠিক করব?" },
    a: { ar: "امسح الرقم واكتب الصح، واضغط «💾 حفظ» مرة ثانية. إذا اليوم مقفول، كلّم المدير.",
         en: "Clear it, type the right number and tap \"💾 Save\" again. If the day is already closed, ask the manager.",
         bn: "মুছে সঠিক সংখ্যা লিখুন এবং আবার \"💾 সংরক্ষণ\" চাপুন। দিন বন্ধ হয়ে গেলে ম্যানেজারকে বলুন।" } },
  { id: "next", tab: null, k: "الصنف الجاي التالي الجاي اللي بعده next item পরের",
    q: { ar: "وش زر «الصنف الجاي»؟", en: "What is the \"Next item\" button?", bn: "\"পরের আইটেম\" বোতাম কী?" },
    a: { ar: "زر «⤵ الصنف الجاي» تحت يوديك مباشرة لأول صنف ما كتبت له رقم. يختفي لما تخلص كل الأصناف.",
         en: "The \"⤵ Next item\" button at the bottom jumps to the first item without a number. It disappears when everything is filled.",
         bn: "নিচের \"⤵ পরের আইটেম\" বোতাম প্রথম খালি আইটেমে নিয়ে যায়। সব পূরণ হলে এটা লুকিয়ে যায়।" } },
  { id: "remaining", tab: "remaining", k: "متبقي المتبقي باقي جرد اخر الدوام نهايه الدوام remaining leftover count end of shift বাকি গণনা",
    q: { ar: "كيف أسجّل المتبقي آخر الدوام؟", en: "How do I record what's left at end of shift?", bn: "শিফট শেষে বাকি কীভাবে লিখব?" },
    a: { ar: "افتح «المتبقي». وزّن اللي باقي من كل صنف واكتبه بالجرام، وبالأخير اضغط «💾 حفظ».",
         en: "Open \"Remaining\". Weigh what's left of each item, enter it in grams, then tap \"💾 Save\".",
         bn: "\"বাকি\" খুলুন। প্রতিটি আইটেমের বাকি ওজন গ্রামে লিখুন, তারপর \"💾 সংরক্ষণ\" চাপুন।" } },
  { id: "zero", tab: "remaining", k: "خلص نفد صفر خلصان ولا شي 0 zero finished sold out none শেষ শূন্য",
    q: { ar: "الصنف خلص، وش أكتب؟", en: "The item is finished, what do I enter?", bn: "আইটেম শেষ, কী লিখব?" },
    a: { ar: "اضغط زر «0» اللي جنب الخانة.", en: "Tap the \"0\" button next to the box.", bn: "ঘরের পাশের \"0\" বোতাম চাপুন।" } },
  { id: "sauce", tab: "remaining", k: "صوص الصوص sauce সস",
    q: { ar: "الباقي صوص مو دجاج؟", en: "What's left is sauce, not meat?", bn: "বাকিটা সস, মাংস নয়?" },
    a: { ar: "إذا الوزن اللي باقي صوص وليس دجاج أو لحم، اضغط «🥣 صوص» على الصنف قبل الحفظ.",
         en: "If the remaining weight is sauce and not chicken or meat, tap \"🥣 Sauce\" on the item before saving.",
         bn: "বাকি ওজন সস হলে (মুরগি/মাংস নয়), সংরক্ষণের আগে আইটেমে \"🥣 সস\" চাপুন।" } },
  { id: "waste", tab: "remaining", k: "هدر رمي رميت ارمي تالف خربان منتهي انرمى waste thrown throw expired spoiled বাদ ফেলে নষ্ট",
    q: { ar: "رميت شيء، كيف أسجّله؟", en: "I threw something away, how do I record it?", bn: "কিছু ফেলে দিয়েছি, কীভাবে লিখব?" },
    a: { ar: "في «المتبقي» اضغط 🗑 على الصنف، اكتب الكمية واختر السبب (تالف، وجبة موظف…) واضغط «سجّل الهدر».",
         en: "In \"Remaining\" tap 🗑 on the item, enter the quantity, choose the reason (spoiled, staff meal…) and tap \"Record waste\".",
         bn: "\"বাকি\"-তে আইটেমে 🗑 চাপুন, পরিমাণ লিখুন, কারণ বাছুন (নষ্ট, কর্মীর খাবার…) এবং \"অপচয় লিখুন\" চাপুন।" } },
  { id: "note", tab: null, k: "ملاحظه ملاحظة ملاحظات اكتب ملاحظه note notes comment নোট মন্তব্য",
    q: { ar: "كيف أكتب ملاحظة؟", en: "How do I add a note?", bn: "নোট কীভাবে লিখব?" },
    a: { ar: "اضغط 📝 على الصنف واكتب ملاحظتك. تُحفظ مع الصنف.", en: "Tap 📝 on the item and type your note. It saves with the item.", bn: "আইটেমে 📝 চাপুন এবং নোট লিখুন। এটা আইটেমের সাথে সংরক্ষিত হয়।" } },
  { id: "remove", tab: null, k: "اشيل شيل احذف حذف امسح مسح تراجع رجع ✕ remove delete undo মুছ সরাও",
    q: { ar: "شلت صنف بالغلط؟", en: "Removed an item by mistake?", bn: "ভুল করে আইটেম সরিয়েছি?" },
    a: { ar: "✕ يشيل الصنف من شاشة اليوم بس. لو شلته بالغلط، اضغط «تراجع» اللي يطلع تحت على طول.",
         en: "✕ only removes the item from today's screen. If it was a mistake, tap \"Undo\" that appears at the bottom right away.",
         bn: "✕ শুধু আজকের স্ক্রিন থেকে সরায়। ভুল হলে সাথে সাথে নিচে আসা \"ফিরিয়ে আনুন\" চাপুন।" } },
  { id: "photos", tab: "opening", k: "صوره صور توثيق كاميرا تصوير اصور photo photos camera picture documentation ছবি ক্যামেরা",
    q: { ar: "كيف أصوّر التوثيق؟", en: "How do I take the documentation photos?", bn: "ডকুমেন্টেশনের ছবি কীভাবে তুলব?" },
    a: { ar: "افتح «التوثيق بالصور». 3 مرات باليوم صوّر كل منطقة، وبالأخير اضغط «✓ اعتماد». صورة غلط؟ احذفها وصوّر من جديد.",
         en: "Open \"Photo documentation\". 3 times a day photograph each area, then tap \"✓ Approve\". Wrong photo? Delete it and take it again.",
         bn: "\"ছবি ডকুমেন্টেশন\" খুলুন। দিনে ৩ বার প্রতিটি জায়গার ছবি তুলুন, তারপর \"✓ অনুমোদন\" চাপুন। ভুল ছবি? মুছে আবার তুলুন।" } },
  { id: "custody", tab: "custody", k: "عهده العهدة كاش درج شبكه مدى اغلاق اسكر cash custody card mada close drawer নগদ কার্ড বন্ধ",
    q: { ar: "كيف أقفل العهدة؟", en: "How do I close the cash custody?", bn: "ক্যাশ হিসাব কীভাবে বন্ধ করব?" },
    a: { ar: "آخر اليوم افتح «إغلاق العهدة». اكتب الكاش اللي بالدرج والشبكة والمصاريف، واضغط «🔒 إغلاق العهدة».",
         en: "At the end of the day open \"Close custody\". Enter the cash in the drawer, card total and expenses, then tap \"🔒 Close custody\".",
         bn: "দিনের শেষে \"হিসাব বন্ধ\" খুলুন। ড্রয়ারের নগদ, কার্ড ও খরচ লিখে \"🔒 হিসাব বন্ধ\" চাপুন।" } },
  { id: "expense", tab: "custody", k: "مصروف مصاريف صرفت اشتريت فاتوره فاتورة expense expenses bought receipt invoice খরচ রসিদ",
    q: { ar: "صرفت من الكاش، وين أسجّله؟", en: "I paid from the cash, where do I record it?", bn: "নগদ থেকে খরচ করেছি, কোথায় লিখব?" },
    a: { ar: "في «إغلاق العهدة» اضغط «➕ أضف مصروف» واكتب المبلغ وعلى إيش. وسجّله أيضاً في نموذج المصروفات مع صورة الفاتورة (الرابط يطلع لك تحت).",
         en: "In \"Close custody\" tap \"➕ Add expense\" and enter the amount and what for. Also log it in the expenses form with the receipt photo (the link appears below).",
         bn: "\"হিসাব বন্ধ\"-এ \"➕ খরচ যোগ\" চাপুন, পরিমাণ ও কী জন্য লিখুন। রসিদের ছবিসহ খরচের ফর্মেও লিখুন (লিংক নিচে আসে)।" } },
  { id: "tomorrow", tab: "tomorrow", k: "طلبيه طلبية بكره بكرة الغد طلب اطلب order tomorrow আগামীকাল অর্ডার",
    q: { ar: "كيف أسوي طلبية بكرة؟", en: "How do I make tomorrow's order?", bn: "আগামীকালের অর্ডার কীভাবে দেব?" },
    a: { ar: "افتح «طلبية الغد»، تأكد إن التاريخ «بكرة» واختر الفرع. اضغط «⚡ تطبيق كل المقترحات»، عدّل اللي تبيه واضغط «💾 حفظ».",
         en: "Open \"Tomorrow's order\", check the date says \"Tomorrow\" and choose the branch. Tap \"⚡ Apply all suggestions\", edit what you need and tap \"💾 Save\".",
         bn: "\"আগামীকালের অর্ডার\" খুলুন, তারিখ \"আগামীকাল\" কিনা দেখুন ও শাখা বাছুন। \"⚡ সব পরামর্শ প্রয়োগ\" চাপুন, দরকারমতো বদলে \"💾 সংরক্ষণ\" চাপুন।" } },
  { id: "push", tab: "dashboard", k: "تنبيه تنبيهات اشعار اشعارات تذكير notification notifications reminder alert নোটিফিকেশন রিমাইন্ডার",
    q: { ar: "كيف أشغّل التنبيهات؟", en: "How do I turn on notifications?", bn: "নোটিফিকেশন কীভাবে চালু করব?" },
    a: { ar: "في «الرئيسية» اضغط «تشغيل» على كرت 🔔 التنبيهات ووافق. بالآيفون لازم أول تضيف الموقع للشاشة الرئيسية (زر المشاركة ← إضافة إلى الشاشة الرئيسية) وتفتحه من هناك.",
         en: "On \"Home\" tap \"Turn on\" in the 🔔 notifications card and allow. On iPhone, first add the site to the Home Screen (Share → Add to Home Screen) and open it from there.",
         bn: "\"হোম\"-এ 🔔 কার্ডে \"চালু\" চাপুন ও অনুমতি দিন। আইফোনে আগে সাইটটি হোম স্ক্রিনে যোগ করুন (শেয়ার → হোম স্ক্রিনে যোগ) এবং সেখান থেকে খুলুন।" } },
  { id: "lang", tab: null, k: "لغه لغة اللغة انجليزي انقليزي بنقالي بنغالي language english bangla bengali ভাষা বাংলা ইংরেজি",
    q: { ar: "كيف أغيّر اللغة؟", en: "How do I change the language?", bn: "ভাষা কীভাবে বদলাব?" },
    a: { ar: "افتح القائمة ☰ وتحت تلقى: العربية / English / বাংলা.", en: "Open the ☰ menu; at the bottom choose العربية / English / বাংলা.", bn: "☰ মেনু খুলুন; নিচে العربية / English / বাংলা বাছুন।" } },
  { id: "pin", tab: null, k: "رقم سري الرقم السري باسورد كلمه السر كلمة المرور نسيت اغير الرقم pin password passcode forgot change পিন পাসওয়ার্ড ভুলে",
    q: { ar: "نسيت الرقم السري أو أبي أغيّره؟", en: "Forgot my PIN or want to change it?", bn: "পিন ভুলে গেছি বা বদলাতে চাই?" },
    a: { ar: "لتغييره: افتح القائمة ☰ واضغط «🔑 الرقم السري». نسيته؟ كلّم المدير يعطيك رقم جديد.",
         en: "To change it: open the ☰ menu and tap \"🔑 PIN\". Forgot it? Ask the manager for a new one.",
         bn: "বদলাতে: ☰ মেনু খুলে \"🔑 পিন\" চাপুন। ভুলে গেলে ম্যানেজারের কাছে নতুন পিন চান।" } },
  { id: "refresh", tab: null, k: "تحديث حدث احدث ما تغير ما يتحدث قديم refresh reload update old রিফ্রেশ",
    q: { ar: "البيانات ما تحدّثت؟", en: "Data didn't update?", bn: "ডেটা আপডেট হয়নি?" },
    a: { ar: "اسحب الشاشة لتحت عشان تحدّثها.", en: "Pull the screen down to refresh.", bn: "রিফ্রেশ করতে স্ক্রিন নিচে টানুন।" } },
  { id: "install", tab: null, k: "تطبيق تثبيت انزل التطبيق شاشه رئيسيه ايقونه install app home screen icon অ্যাপ ইনস্টল",
    q: { ar: "كيف أحط الموقع كتطبيق بالجوال؟", en: "How do I put the site on my phone like an app?", bn: "সাইটটি অ্যাপের মতো ফোনে কীভাবে রাখব?" },
    a: { ar: "بالآيفون من Safari: زر المشاركة ← «إضافة إلى الشاشة الرئيسية». بالأندرويد من Chrome: ⋮ ← «تثبيت التطبيق».",
         en: "iPhone (Safari): Share → \"Add to Home Screen\". Android (Chrome): ⋮ → \"Install app\".",
         bn: "আইফোন (Safari): শেয়ার → \"হোম স্ক্রিনে যোগ\"। অ্যান্ড্রয়েড (Chrome): ⋮ → \"অ্যাপ ইনস্টল\"।" } },
  { id: "start", tab: "dashboard", k: "وش اسوي ايش اسوي شو اسوي ابدا ابدأ ضايع ضعت اول مره خطوه what do start first lost step কী করব শুরু",
    q: { ar: "ما أدري وش أسوي؟", en: "I don't know what to do?", bn: "কী করব বুঝতে পারছি না?" },
    a: { ar: "افتح «الرئيسية»، تقولك «الخطوة الجاية». اضغطها وتفتح لك الشاشة الصح.",
         en: "Open \"Home\" — it shows \"Next step\". Tap it and it opens the right screen.",
         bn: "\"হোম\" খুলুন — সেখানে \"পরের ধাপ\" দেখায়। চাপলে সঠিক স্ক্রিন খুলবে।" } },
  { id: "done", tab: null, k: "خلصت انتهيت كملت كم باقي باقي كم تقدم finished done progress how many left কত বাকি শেষ",
    q: { ar: "كيف أعرف إني خلصت؟", en: "How do I know I'm done?", bn: "কীভাবে বুঝব শেষ হয়েছে?" },
    a: { ar: "فوق تشوف «✏️ 5 من 14» يعني كم صنف كتبت من الكل. لما تخلص يطلع «✅ خلصت كلها»، وبعدها اضغط «💾 حفظ».",
         en: "At the top you see \"✏️ 5 of 14\" — how many items you've filled. When done it shows \"✅ All done\", then tap \"💾 Save\".",
         bn: "উপরে \"✏️ 14 এর 5\" দেখায় — কতগুলো পূরণ হয়েছে। শেষ হলে \"✅ সব শেষ\" দেখাবে, তারপর \"💾 সংরক্ষণ\" চাপুন।" } },
  { id: "status", tab: "receiving", k: "مطابق مكتمل زائد ناقص معنى يعني حاله status match over short meaning মানে",
    q: { ar: "وش يعني «مطابق» و«زائد» و«ناقص»؟", en: "What do \"Match\", \"Over\" and \"Short\" mean?", bn: "\"মিলেছে\", \"বেশি\", \"কম\" মানে কী?" },
    a: { ar: "«مطابق» يعني اللي وصل نفس الطلب. «زائد» وصل أكثر، و«ناقص» وصل أقل. الرقم اللي تكتبه هو الأهم.",
         en: "\"Match\" means what arrived equals the order. \"Over\" means more arrived, \"Short\" means less. The number you enter is what matters.",
         bn: "\"মিলেছে\" মানে অর্ডারের সমান এসেছে। \"বেশি\" মানে বেশি, \"কম\" মানে কম এসেছে। আপনার লেখা সংখ্যাই আসল।" } },
  { id: "units", tab: null, k: "جرام كيلو كيلوجرام وزن حبه علبه وحده gram grams kilo kg weight unit piece গ্রাম কেজি ওজন",
    q: { ar: "أكتب بالجرام ولا بالكيلو؟", en: "Grams or kilos?", bn: "গ্রামে না কেজিতে?" },
    a: { ar: "بالجرام دائماً، إلا إذا مكتوب جنب الصنف وحدة ثانية (حبة، علبة). مثال: كيلو ونص = 1500.",
         en: "Always grams, unless the item shows another unit (piece, box). Example: 1.5 kg = 1500.",
         bn: "সবসময় গ্রামে, যদি না আইটেমে অন্য একক থাকে (পিস, বক্স)। উদাহরণ: ১.৫ কেজি = 1500।" } },
  { id: "chef", tab: "receiving", k: "طبخه طبخة الشيف اسم الطبخه نوع الطبخه dish chef cook name রান্না শেফ",
    q: { ar: "وين أكتب اسم الطبخة؟", en: "Where do I write the dish name?", bn: "রান্নার নাম কোথায় লিখব?" },
    a: { ar: "في خانة «اسم الطبخة» اكتب اللي وصل (مثلاً: بيكانت) أو اختاره من القائمة. الأسماء تُحفظ وتطلع لك المرة الجاية.",
         en: "In the \"Dish name\" box type what arrived (e.g. Piccante) or pick it from the list. Names are saved for next time.",
         bn: "\"রান্নার নাম\" ঘরে যা এসেছে লিখুন (যেমন পিকান্তে) বা তালিকা থেকে বাছুন। নাম পরের বারের জন্য সংরক্ষিত থাকে।" } },
  { id: "yesterday", tab: null, k: "نسيت امس اليوم اللي فات ما سجلت متاخر forgot yesterday missed late গতকাল ভুলে",
    q: { ar: "نسيت أسجّل أمس؟", en: "Forgot to record yesterday?", bn: "গতকাল লিখতে ভুলে গেছি?" },
    a: { ar: "اضغط «أمس» فوق الشاشة وسجّل عادي، الأرقام تُحفظ على أمس. إذا أمس مقفول، كلّم المدير.",
         en: "Tap \"Yesterday\" at the top and enter as usual — it saves to yesterday. If yesterday is closed, ask the manager.",
         bn: "উপরে \"গতকাল\" চাপুন এবং স্বাভাবিকভাবে লিখুন — গতকালে সংরক্ষিত হবে। গতকাল বন্ধ হলে ম্যানেজারকে বলুন।" } },
  { id: "closed", tab: null, k: "مقفول مقفل قفل ما اقدر اعدل مسكر locked closed can't edit বন্ধ লক",
    q: { ar: "اليوم مقفول وما أقدر أعدّل؟", en: "The day is locked, I can't edit?", bn: "দিন বন্ধ, বদলাতে পারছি না?" },
    a: { ar: "بعد إغلاق اليوم ما يتعدّل شيء عشان الأرقام ما تتغير. كلّم المدير يفتحه لك.",
         en: "After the day is closed nothing can be edited, so numbers stay safe. Ask the manager to reopen it.",
         bn: "দিন বন্ধ হলে কিছু বদলানো যায় না। ম্যানেজারকে খুলে দিতে বলুন।" } },
  { id: "cashdiff", tab: "custody", k: "الكاش ما طابق فرق الكاش ناقص كاش زايد كاش الدرج ما يطابق cash doesn't match cash difference short over drawer নগদ মিলছে না",
    q: { ar: "الكاش ما طابق؟", en: "The cash doesn't match?", bn: "নগদ মিলছে না?" },
    a: { ar: "اكتب الرقم الصحيح اللي فعلاً بالدرج، ولا تغيّره عشان يطابق. الفرق يشوفه المدير ويتابعه.",
         en: "Enter the real amount in the drawer — don't change it to make it match. The manager sees and follows up on the difference.",
         bn: "ড্রয়ারে আসলে যা আছে সেটাই লিখুন — মেলানোর জন্য বদলাবেন না। পার্থক্য ম্যানেজার দেখবেন।" } },
  { id: "saucefrm", tab: "remaining", k: "نموذج الصوص فورم قوقل نموذج sauce form google form সস ফর্ম",
    q: { ar: "نموذج الصوص، أعبّيه؟", en: "Do I fill the sauce form?", bn: "সস ফর্ম কি পূরণ করব?" },
    a: { ar: "لا، ينرسل تلقائياً لما تحفظ «المتبقي». ما تحتاج تعبّيه بيدك.",
         en: "No — it's sent automatically when you save \"Remaining\". No need to fill it by hand.",
         bn: "না — \"বাকি\" সংরক্ষণ করলে নিজে থেকেই যায়। হাতে পূরণ করতে হবে না।" } },
  { id: "recvsrem", tab: null, k: "الفرق بين الاستلام والمتبقي استلام متبقي وش الفرق difference receiving remaining পার্থক্য গ্রহণ",
    q: { ar: "وش الفرق بين الاستلام والمتبقي؟", en: "Receiving vs Remaining?", bn: "গ্রহণ আর বাকির পার্থক্য?" },
    a: { ar: "«الاستلام» الصبح: اللي وصل من المطبخ. «المتبقي» آخر الدوام: اللي باقي عندك.",
         en: "\"Receiving\" in the morning: what arrived from the kitchen. \"Remaining\" at end of shift: what's left.",
         bn: "\"গ্রহণ\" সকালে: রান্নাঘর থেকে যা এসেছে। \"বাকি\" শিফট শেষে: যা রয়ে গেছে।" } },
  { id: "receiving", tab: "receiving", k: "استلام الاستلام الصبح وصل الطلبيه الصباحيه receiving morning delivery গ্রহণ সকাল",
    q: { ar: "كيف أسجّل الاستلام الصبح؟", en: "How do I record the morning receiving?", bn: "সকালের গ্রহণ কীভাবে লিখব?" },
    a: { ar: "افتح «الاستلام». وزّن كل صنف واكتب الرقم بالجرام. ما وصل؟ اضغط «لم يصل». وبالأخير «💾 حفظ».",
         en: "Open \"Receiving\". Weigh each item and enter grams. Didn't arrive? Tap \"Not arrived\". Then \"💾 Save\".",
         bn: "\"গ্রহণ\" খুলুন। প্রতিটি আইটেম ওজন করে গ্রামে লিখুন। আসেনি? \"আসেনি\" চাপুন। তারপর \"💾 সংরক্ষণ\"।" } },
  { id: "pushfix", tab: "dashboard", k: "التنبيه ما يوصل ما وصلني تنبيه ما يجي اشعار notification not coming didn't get notification নোটিফিকেশন আসছে না",
    q: { ar: "التنبيهات ما توصلني؟", en: "Notifications aren't arriving?", bn: "নোটিফিকেশন আসছে না?" },
    a: { ar: "بالآيفون افتح الموقع من أيقونته على الشاشة الرئيسية مو من Safari. تأكد إن التنبيهات مسموحة من إعدادات الجوال، وجرّب «جرّب تنبيه» في الرئيسية.",
         en: "On iPhone open the site from its Home Screen icon, not Safari. Make sure notifications are allowed in phone settings, then try \"Test notification\" on Home.",
         bn: "আইফোনে Safari নয়, হোম স্ক্রিনের আইকন থেকে খুলুন। ফোনের সেটিংসে নোটিফিকেশন চালু আছে কিনা দেখুন, তারপর হোমে \"পরীক্ষা\" চাপুন।" } },
  { id: "blank", tab: null, k: "فاضيه فاضية ما تحمل ما يفتح عالق معلق بطيء خطا error blank loading stuck slow not loading খালি লোড হচ্ছে না",
    q: { ar: "الشاشة فاضية أو ما تحمّل؟", en: "The screen is blank or not loading?", bn: "স্ক্রিন খালি বা লোড হচ্ছে না?" },
    a: { ar: "تأكد من النت، واسحب الشاشة لتحت عشان تتحدث. ما زبط؟ اطلع من الحساب (☰ ← «🚪 خروج») وادخل من جديد.",
         en: "Check the internet and pull the screen down to refresh. Still not working? Log out (☰ → \"🚪 Log out\") and log in again.",
         bn: "ইন্টারনেট দেখুন এবং স্ক্রিন নিচে টেনে রিফ্রেশ করুন। তবুও না হলে লগ আউট (☰ → \"🚪 লগ আউট\") করে আবার ঢুকুন।" } },
  { id: "logout", tab: null, k: "خروج اطلع تسجيل خروج اسجل خروج logout log out sign out লগ আউট",
    q: { ar: "كيف أطلع من الحساب؟", en: "How do I log out?", bn: "কীভাবে লগ আউট করব?" },
    a: { ar: "افتح القائمة ☰ واضغط «🚪 خروج».", en: "Open the ☰ menu and tap \"🚪 Log out\".", bn: "☰ মেনু খুলে \"🚪 লগ আউট\" চাপুন।" } },
  { id: "who", tab: null, k: "مين يشوف من يشوف الارقام المدير يشوف who sees who can see privacy কে দেখে",
    q: { ar: "مين يشوف اللي أكتبه؟", en: "Who sees what I enter?", bn: "আমি যা লিখি কে দেখে?" },
    a: { ar: "المدير وصاحب المطعم. كل موظف يشوف فرعه والشاشات اللي تخصه بس.",
         en: "The manager and the owner. Each employee only sees their own branch and screens.",
         bn: "ম্যানেজার ও মালিক। প্রত্যেক কর্মী শুধু নিজের শাখা ও স্ক্রিন দেখে।" } },
  { id: "guide", tab: "help", k: "شرح طريقه الاستخدام دليل تعليمات guide help how to use instructions নির্দেশিকা",
    q: { ar: "وين الشرح بالصور؟", en: "Where is the picture guide?", bn: "ছবিসহ নির্দেশিকা কোথায়?" },
    a: { ar: "في القائمة ☰ اضغط «📘 طريقة الاستخدام».", en: "In the ☰ menu tap \"📘 How to use\".", bn: "☰ মেনুতে \"📘 ব্যবহারের নিয়ম\" চাপুন।" } },
  { id: "photodel", tab: "opening", k: "احذف صوره صوره غلط امسح الصوره اعيد التصوير delete photo wrong photo retake ছবি মুছ",
    q: { ar: "صوّرت صورة غلط؟", en: "Took a wrong photo?", bn: "ভুল ছবি তুলেছি?" },
    a: { ar: "اضغط على الصورة واحذفها 🗑، وبعدها صوّر من جديد.", en: "Tap the photo and delete it 🗑, then take it again.", bn: "ছবিতে চেপে মুছে ফেলুন 🗑, তারপর আবার তুলুন।" } },
  { id: "juices", tab: "juices", k: "عصير عصيرات جرد العصيرات juice juices জুস",
    q: { ar: "كيف أجرد العصيرات؟", en: "How do I count the juices?", bn: "জুস কীভাবে গুনব?" },
    a: { ar: "افتح «جرد العصيرات»، اكتب العدد لكل عصير واضغط «💾 حفظ».", en: "Open \"Juice count\", enter the count for each juice and tap \"💾 Save\".", bn: "\"জুস গণনা\" খুলুন, প্রতিটির সংখ্যা লিখে \"💾 সংরক্ষণ\" চাপুন।" } },
  { id: "report", tab: "report", k: "تقرير تقارير report reports রিপোর্ট",
    q: { ar: "كيف أشوف التقارير؟", en: "How do I see reports?", bn: "রিপোর্ট কীভাবে দেখব?" },
    a: { ar: "من «التقارير» اختر النوع والشهر واضغط «عرض».", en: "In \"Reports\" choose the type and month and tap \"Show\".", bn: "\"রিপোর্ট\"-এ ধরন ও মাস বেছে \"দেখান\" চাপুন।" } }
];

const ASSIST_UI = {
  hello: { ar: "هلا 👋 أنا مساعد برو هاوس. اسألني عن أي شيء في التطبيق، أو اختر سؤال من تحت.",
           en: "Hi 👋 I'm the Pro House assistant. Ask me anything about the app, or pick a question below.",
           bn: "হ্যালো 👋 আমি প্রো হাউস সহকারী। অ্যাপ নিয়ে যেকোনো প্রশ্ন করুন, বা নিচ থেকে একটি বাছুন।" },
  unknown: { ar: "ما لقيت جواب لهذا السؤال 🤔 جرّب تكتبه بكلمات ثانية، أو اختر من الأسئلة تحت، أو كلّم المدير.",
             en: "I couldn't find an answer 🤔 Try other words, pick a question below, or ask the manager.",
             bn: "উত্তর পাইনি 🤔 অন্য শব্দে লিখুন, নিচ থেকে প্রশ্ন বাছুন, বা ম্যানেজারকে বলুন।" },
  open: { ar: "افتح الشاشة", en: "Open screen", bn: "স্ক্রিন খুলুন" },
  also: { ar: "أسئلة ثانية:", en: "Other questions:", bn: "অন্য প্রশ্ন:" },
  ph: { ar: "اكتب سؤالك…", en: "Type your question…", bn: "আপনার প্রশ্ন লিখুন…" },
  send: { ar: "إرسال", en: "Send", bn: "পাঠান" },
  title: { ar: "💬 المساعد", en: "💬 Assistant", bn: "💬 সহকারী" },
  thinking: { ar: "لحظة…", en: "One moment…", bn: "এক মুহূর্ত…" },
  all: { ar: "📋 كل الأسئلة", en: "📋 All questions", bn: "📋 সব প্রশ্ন" },
  allTitle: { ar: "كل الأسئلة — اختر واحد:", en: "All questions — pick one:", bn: "সব প্রশ্ন — একটি বাছুন:" }
};

const assistLang = () => (typeof PhLang !== "undefined" && ASSIST_UI.hello[PhLang]) ? PhLang : "ar";
const assistT = (key) => ASSIST_UI[key][assistLang()];

// ---- الأسئلة بعد تعديلات المالك (محفوظة بالإعدادات: assistant_faq) ----
// كل تعديل: {id, q, a, k, en_q, en_a, bn_q, bn_a, hidden}. الأسئلة الأصلية تنعدّل بنفس الـ id، والجديدة id يبدأ بـ c_
function assistCustom() {
  try { const v = JSON.parse((typeof currentSettings !== "undefined" && currentSettings.assistant_faq) || "[]"); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
function assistMerge(f, c) {
  // إذا المالك غيّر النص العربي وما كتب ترجمة، الترجمة القديمة ما عادت صحيحة فنعرض كلامه هو
  const pick = (lang, part) => (c && c[lang + "_" + part]) || (c && c[part] && c[part] !== (f && f[part].ar) ? c[part] : (f ? f[part][lang] : c[part]));
  const q = { ar: (c && c.q) || f.q.ar, en: pick("en", "q"), bn: pick("bn", "q") };
  const a = { ar: (c && c.a) || f.a.ar, en: pick("en", "a"), bn: pick("bn", "a") };
  return { id: (f || c).id, tab: f ? f.tab : (c.tab || null), k: ((f && f.k) || "") + " " + ((c && c.k) || ""), q, a, hidden: !!(c && c.hidden), edited: !!(f && c), custom: !f };
}
function assistFaq(includeHidden) {
  const custom = assistCustom();
  const byId = new Map(custom.map(c => [c.id, c]));
  const list = ASSIST_FAQ.map(f => assistMerge(f, byId.get(f.id)));
  custom.filter(c => !ASSIST_FAQ.some(f => f.id === c.id) && c.q && c.a).forEach(c => list.push(assistMerge(null, c)));
  return list.filter(f => (includeHidden || !f.hidden) && (!f.tab || typeof tabAllowed !== "function" || tabAllowed(f.tab)));
}

// توحيد الحروف: بدون تشكيل، أ/إ/آ ← ا، ى ← ي، ة ← ه
function assistNorm(s) {
  return String(s || "").toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{M}\p{N}\s✕]/gu, " ").replace(/\s+/g, " ").trim();
}
// الكلمة مع وبدون البادئات (ال، و، ب، ل، ف، بال، وال…)
const ASSIST_PREFIXES = ["وبال", "وال", "بال", "فال", "كال", "لل", "ال", "و", "ب", "ل", "ف"];
function assistVariants(w) {
  const out = [w];
  for (const p of ASSIST_PREFIXES) if (w.startsWith(p) && w.length - p.length >= 2) out.push(w.slice(p.length));
  return out;
}

// كلمات عامة ما تفرّق بين سؤال وسؤال
const ASSIST_STOP = new Set(("كيف وش ايش شو ليش وين متى مين من في على عن الى او و ما لا هل انا ابي ابغى اسوي اللي هذا هذي ذا يا لو اذا مع بس " +
  "how do does did i to a an the is are what my me it in on of for can where when why who you your with " +
  "কীভাবে কী কি আমি আমার করব কোথায় না").split(" "));

// كل كلمة مفتاحية تطابق بداية كلمة بالسؤال = نقاط (الطويلة أكثر)
function assistMatch(question) {
  const words = assistNorm(question).split(" ").filter(w => w.length > 1 && !ASSIST_STOP.has(w)).flatMap(assistVariants).filter(w => !ASSIST_STOP.has(w));
  let best = null, bestScore = 0;
  for (const f of assistFaq()) {
    const keys = new Set(assistNorm(f.k + " " + Object.values(f.q).join(" ")).split(" ").filter(k => k.length > 1 && !ASSIST_STOP.has(k)));
    let score = 0;
    for (const k of keys) {
      if (words.includes(k)) score += k.length >= 4 ? 2 : 1.5;
      else if (k.length >= 3 && words.some(w => w.length > k.length && w.startsWith(k))) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return bestScore >= 1.5 ? best : null;
}

function assistEsc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function assistChips(list) {
  const L = assistLang();
  return list.map(f => `<button type="button" class="assist-chip" data-q="${assistEsc(f.id)}" lang="${L}">${assistEsc(f.q[L])}</button>`).join("");
}
function assistSuggestions(excludeId) {
  return assistChips(assistFaq().filter(f => f.id !== excludeId).slice(0, 5)) +
    `<button type="button" class="assist-chip all" data-all="1">${assistT("all")}</button>`;
}

function assistBubble(who, html) {
  const log = document.getElementById("assistLog");
  if (!log) return;
  log.insertAdjacentHTML("beforeend", `<div class="assist-msg ${who}" lang="${assistLang()}">${html}</div>`);
  log.lastElementChild.scrollIntoView({ block: "end", behavior: "smooth" });
}

function assistAnswer(f) {
  const btn = f.tab ? `<button type="button" class="assist-open" data-tab="${f.tab}">${assistT("open")}</button>` : "";
  assistBubble("bot", `<p>${assistEsc(f.a[assistLang()])}</p>${btn}`);
}

// الذكاء الاصطناعي (اختياري): يشتغل بس لو انحط مفتاح Gemini بالسيرفر
async function assistAskAI(question) {
  if (window.PH_DEMO || typeof SupaEngine === "undefined" || !SupaEngine.askAssistant) return null;
  // الأسئلة الجاهزة تنرسل معه عشان يجاوب من نفس الشرح
  const context = assistFaq().map(f => `- ${f.q.ar} → ${f.a.ar}`).join("\n");
  try { return await SupaEngine.askAssistant(question, assistLang(), context); } catch (e) { return null; }
}

async function assistHandle(question) {
  question = String(question || "").trim();
  if (!question) return;
  assistBubble("me", assistEsc(question));
  const f = assistMatch(question);
  if (f) { assistAnswer(f); return; }
  assistBubble("bot typing", `<p>${assistT("thinking")}</p>`);
  const ai = await assistAskAI(question);
  const typing = document.querySelector("#assistLog .assist-msg.typing");
  if (typing) typing.remove();
  if (ai) assistBubble("bot", `<p>${assistEsc(ai)}</p>`);
  else assistBubble("bot", `<p>${assistT("unknown")}</p><div class="assist-chips">${assistSuggestions()}</div>`);
}

function renderAssistantView() {
  const el = document.getElementById("assistantView");
  if (!el) return;
  if (el.dataset.ready) return; // المحادثة تضل لين يطلع من الصفحة
  el.dataset.ready = "1";
  const L = assistLang();
  const isOwner = typeof Auth !== "undefined" && Auth.role && Auth.role() === "owner";
  el.innerHTML = `
    <div class="assist-wrap">
      <div class="assist-top"><h2 class="assist-title">${assistT("title")}</h2>
        ${isOwner ? `<button type="button" class="assist-edit-btn" id="assistEditBtn">✏️ تعديل الأسئلة</button>` : ""}</div>
      <div id="assistEditor" class="assist-editor hidden"></div>
      <div class="assist-log" id="assistLog"></div>
      <form class="assist-form" id="assistForm" autocomplete="off">
        <input type="text" id="assistInput" placeholder="${assistT("ph")}" lang="${L}" enterkeyhint="send">
        <button type="submit" class="assist-send">${assistT("send")}</button>
      </form>
    </div>`;
  assistBubble("bot", `<p>${assistT("hello")}</p><div class="assist-chips">${assistSuggestions()}</div>`);
  el.addEventListener("click", (e) => {
    const all = e.target.closest(".assist-chip.all");
    if (all) { assistBubble("bot", `<p>${assistT("allTitle")}</p><div class="assist-chips">${assistChips(assistFaq())}</div>`); return; }
    const chip = e.target.closest(".assist-chip");
    if (chip) {
      const f = assistFaq().find(x => x.id === chip.dataset.q);
      if (f) { assistBubble("me", assistEsc(f.q[assistLang()])); assistAnswer(f); }
      return;
    }
    const open = e.target.closest(".assist-open");
    if (open && typeof setActiveTab === "function") { setActiveTab(open.dataset.tab); return; }
    if (e.target.closest("#assistEditBtn")) assistToggleEditor();
  });
  document.getElementById("assistForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = document.getElementById("assistInput");
    const v = inp.value; inp.value = "";
    assistHandle(v);
  });
}

// ==================== ✏️ تعديل الأسئلة (للمالك) ====================
function assistEditorRow(f) {
  const v = (x) => assistEsc(x || "");
  const c = assistCustom().find(x => x.id === f.id) || {};
  return `<details class="assist-ed-row ${f.hidden ? "is-hidden" : ""}" data-id="${v(f.id)}" data-builtin="${f.custom ? "" : "1"}">
    <summary>${f.hidden ? "🙈 " : ""}${f.custom ? "🆕 " : ""}${f.edited ? "✏️ " : ""}${v(f.q.ar)}</summary>
    <label>السؤال<input type="text" data-f="q" value="${v(f.q.ar)}"></label>
    <label>الجواب<textarea data-f="a" rows="3">${v(f.a.ar)}</textarea></label>
    <label>كلمات يكتبها الموظف (اختياري)<input type="text" data-f="k" value="${v(c.k)}" placeholder="مثال: فاتوره مصروف"></label>
    <details class="assist-ed-tr"><summary>🌐 الترجمة (اختياري)</summary>
      <label>English — Q<input type="text" dir="ltr" data-f="en_q" value="${v(c.en_q)}"></label>
      <label>English — A<textarea dir="ltr" data-f="en_a" rows="2">${v(c.en_a)}</textarea></label>
      <label>বাংলা — Q<input type="text" dir="ltr" data-f="bn_q" value="${v(c.bn_q)}"></label>
      <label>বাংলা — A<textarea dir="ltr" data-f="bn_a" rows="2">${v(c.bn_a)}</textarea></label>
    </details>
    <div class="assist-ed-actions">
      <label class="assist-ed-hide"><input type="checkbox" data-f="hidden" ${f.hidden ? "checked" : ""}> إخفاء عن الموظفين</label>
      ${f.custom ? `<button type="button" class="btn ghost" data-act="del">🗑 حذف</button>` : (f.edited ? `<button type="button" class="btn ghost" data-act="reset">↩ رجّع الأصلي</button>` : "")}
    </div>
  </details>`;
}

function assistToggleEditor(forceOpen) {
  const ed = document.getElementById("assistEditor");
  if (!ed) return;
  const open = forceOpen || ed.classList.contains("hidden");
  ed.classList.toggle("hidden", !open);
  if (!open) return;
  // المالك يشوف كل الأسئلة حتى المخفية وحتى اللي تخص شاشات الموظفين
  const custom = assistCustom();
  const byId = new Map(custom.map(c => [c.id, c]));
  const list = ASSIST_FAQ.map(f => assistMerge(f, byId.get(f.id)))
    .concat(custom.filter(c => !ASSIST_FAQ.some(f => f.id === c.id)).map(c => assistMerge(null, c)));
  ed.innerHTML = `
    <p class="assist-ed-hint">اضغط على أي سؤال عشان تعدّله. التعديل يوصل لكل الموظفين بعد الحفظ.</p>
    <div class="assist-ed-list">${list.map(assistEditorRow).join("")}</div>
    <div class="assist-ed-bottom">
      <button type="button" class="btn ghost" id="assistAddQ">➕ سؤال جديد</button>
      <button type="button" class="btn gold" id="assistSaveQ">💾 حفظ الأسئلة</button>
    </div>`;
  ed.onclick = (e) => {
    const row = e.target.closest(".assist-ed-row");
    if (e.target.closest("#assistAddQ")) {
      const id = "c_" + Date.now().toString(36);
      ed.querySelector(".assist-ed-list").insertAdjacentHTML("afterbegin",
        assistEditorRow({ id, custom: true, q: { ar: "" }, a: { ar: "" } }));
      const r = ed.querySelector(".assist-ed-row"); r.open = true; r.querySelector('[data-f="q"]').focus();
      return;
    }
    if (e.target.closest("#assistSaveQ")) { assistSaveEditor(); return; }
    const act = e.target.closest("[data-act]");
    if (act && row && act.dataset.act === "del") row.remove();
    if (act && row && act.dataset.act === "reset") {
      const f = ASSIST_FAQ.find(x => x.id === row.dataset.id);
      row.outerHTML = assistEditorRow(assistMerge(f, null));
    }
  };
}

function assistSaveEditor() {
  const ed = document.getElementById("assistEditor");
  const out = [];
  let bad = false;
  ed.querySelectorAll(".assist-ed-row").forEach(row => {
    const g = (k) => { const x = row.querySelector(`[data-f="${k}"]`); return x.type === "checkbox" ? x.checked : x.value.trim(); };
    const e = { id: row.dataset.id, q: g("q"), a: g("a"), k: g("k"), en_q: g("en_q"), en_a: g("en_a"), bn_q: g("bn_q"), bn_a: g("bn_a"), hidden: g("hidden") };
    const base = ASSIST_FAQ.find(f => f.id === e.id);
    if (!base && (!e.q || !e.a)) { if (e.q || e.a) bad = true; return; }
    if (base) {
      // نحفظ بس اللي تغيّر عن الأصل
      if (e.q === base.q.ar) delete e.q;
      if (e.a === base.a.ar) delete e.a;
    }
    Object.keys(e).forEach(k => { if (k !== "id" && !e[k]) delete e[k]; });
    if (!base || Object.keys(e).length > 1) out.push(e);
  });
  if (bad) { showToast("⚠ كل سؤال جديد يحتاج سؤال وجواب"); return; }
  const payload = { assistant_faq: JSON.stringify(out) };
  currentSettings = { ...currentSettings, ...payload };
  if (typeof Sync !== "undefined") { Sync.cacheSet("settings", currentSettings); Sync.enqueue("saveSettings:assistant_faq", "saveSettings", payload); }
  showToast("✅ تم حفظ الأسئلة");
  assistToggleEditor(true);
}
