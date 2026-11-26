#!/bin/bash
# تجهيز أدوات أوراق الاشتراكات (مرة وحدة بكل جلسة جديدة): خطوط + مكتبات بايثون + مكتبات تقرير الشيف
# الاستعمال: bash tools/subs-day/setup.sh   → كل شي بينحط بـ $SUBS_HOME (افتراضياً /tmp/subs-day)
set -e
H=${SUBS_HOME:-/tmp/subs-day}; mkdir -p "$H/fonts" "$H/libs"
[ -x "$H/venv/bin/python" ] || { python3 -m venv "$H/venv" && "$H/venv/bin/pip" -q install pymupdf; }
cd "$H/fonts"; [ -f NotoSansArabic.ttf ] || {
  npm i -s --no-save @expo-google-fonts/amiri @expo-google-fonts/noto-sans-arabic @expo-google-fonts/noto-sans-bengali >/dev/null
  N=node_modules/@expo-google-fonts
  cp $N/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf NotoSansArabic.ttf
  cp $N/noto-sans-bengali/400Regular/NotoSansBengali_400Regular.ttf NotoSansBengali-Regular.ttf
  cp $N/noto-sans-bengali/700Bold/NotoSansBengali_700Bold.ttf NotoSansBengali-Bold.ttf
  cp $N/amiri/400Regular/Amiri_400Regular.ttf Amiri-Regular.ttf; }
cd "$H/libs"; [ -d node_modules/jspdf ] || npm i -s --no-save html2canvas@1.4.1 jspdf@2.5.2 >/dev/null
echo "جاهز: $H"
