# سحب تلقائي لمبيعات فوديكس (Foodics Sync) — فروع الروضة والشاطئ

سكربت آلي يسجل الدخول تلقائياً إلى لوحة تحكم فوديكس (console.foodics.com) كل 30 دقيقة ويسحب تقارير المبيعات لفرعي **الروضة** و **الشاطئ**:
1. **المبيعات حسب التصنيف**: (دجاج، لحم، بحري، ساندويتشات، السلطات).
2. **المبيعات حسب المنتج**: لسحب مبيعات العصيرات (لشاشة جرد العصيرات) واحتساب ساندويتشات أم علي (كل حبتين = ساندويتش).
3. **الإرسال السحابي المباشر**: إرسال البيانات فوراً لقاعدة بيانات Supabase (جدول 	absense_sales و juice_sales) لتظهر فوراً في شاشات الجرد والتقارير بموقع Pro House.

---

## 1. التشغيل السحابي عبر GitHub Actions (بدون تشغيل كمبيوترك)

السكربت مبرمج ليعمل تلقائياً كل 30 دقيقة على GitHub Actions:

1. افتح مستودع المشروع على GitHub: https://github.com/prohouse-official/prohouse
2. اذهب إلى: **Settings** ⬅️ **Secrets and variables** ⬅️ **Actions**
3. اضغط على **New repository secret**
4. الاسم: FOODICS_CONFIG_JSON
5. القيمة: انسخ محتوى ملف config.json والصقه هناك، واضغط **Add secret**.
6. اذهب إلى تبويب **Actions** ⬅️ اختر **Foodics 30-Min Sync** واضغط **Run workflow** للتجربة الفورية.

---

## 2. التشغيل المحلي والتجربة اليدوية على جهازك

1. افتح موجه الأوامر (PowerShell أو CMD) داخل هذا المجلد:
   `ash
   cd foodics-sync
   npm install
   npm run install-browser
   `
2. شغّل السكربت يدوياً:
   `ash
   node pull-foodics.js
   `
3. لتجربة تاريخ محدد:
   `ash
   node pull-foodics.js 2026-09-27
   `

---

## 3. التشغيل اليومي عبر جدولة مهام ويندوز (Windows Task Scheduler)

1. افتح أداة **Task Scheduler** من قائمة Start في ويندوز.
2. اضغط **Create Basic Task** وسَمِّها: Pro House Foodics Sync.
3. اضبط التكرار يومياً في وقت مناسب.
4. في **Action**: اختر **Start a program**.
5. في خانة البرنامج: اختر un_hidden.vbs أو un-foodics-sync.bat داخل مجلد oodics-sync.
