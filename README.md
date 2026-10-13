# رحلة | Rihla

موقع عربي من صفحتين للبحث عن الرحلات وعرض نتائج تاركو وبدر وسودانير فقط.

الرحلات والأوقات والأسعار بيانات تجريبية، وليست بيانات مباشرة أو خدمة حجز.

## التشغيل

افتح `dist/index.html` في المتصفح، أو شغّل `python -m http.server 8000 --directory dist`.

## النشر على Vercel

استورد المستودع من GitHub، واختر Framework Preset: Other وOutput Directory: dist. لا يحتاج الموقع إلى أمر بناء أو متغيرات بيئة. يتضمن المستودع vercel.json لإعداد النشر.

## الملفات

- dist/index.html: صفحة البحث
- dist/results.html: صفحة النتائج
- dist/styles.css: التنسيق المتجاوب
- dist/app.js: البحث والتصفية والفرز وعرض التفاصيل
