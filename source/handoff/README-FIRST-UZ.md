# Dasturchi: shu fayldan boshlang

Topshirish sanasi: **2026-09-27**. Loyiha: **eVisa Operator**.

## Vazifa

Mavjud Telegram botni yakunlash va referens videodagi kabi brauzer kengaytmasi bilan boshqarish imkonini qo‘shish. Operator pasportlarni yuboradi/yuklaydi, ma’lumot va portretlarni tekshiradi; tizim bir Saudi akkauntida Individual yoki Group arizalarni to‘lovgacha tayyorlaydi. To‘lovni operator bajaradi. Yakuniy ish joyi — mas’ul xodimning Windows kompyuteri. Ilova Codex yoki ChatGPT saytiga bog‘liq bo‘lmasligi kerak.

## Paket ichida

- `source/` — barcha manba kodlari, lock fayllar, testlar, Windows o‘rnatuvchi va eski panel kodi.
- `docs/01-ISHGA-TUSHIRISH.md` — ishlab chiqish muhiti va yangi Windows o‘rnatish.
- `docs/02-ARXITEKTURA.md` — asosiy modullar, ma’lumotlar va ishlash oqimi.
- `docs/03-QOLGAN-ISHLAR.md` — ustuvor vazifalar va qabul mezonlari.
- `docs/04-HOLAT-VA-CHEGARALAR.md` — bajarilgan ishlar, tekshirilmagan qismlar va oldingi xatolar.
- `docs/05-VIDEO-TAQQOSLASH.md` — referens videoning funksiyalari va vaqt belgilari.
- `docs/06-ULANISHLAR-VA-TOPSHIRISH.md` — kalitlar, operator va kompyuterni almashtirish.
- `docs/07-TEKSHIRUV.md` va `validation/` — shu paket tekshiruvlari va ularning amaliy chegaralari.
- `docs/08-SKRIPT-QOLLANMA.md` — mavjud Tampermonkey varianti.
- `artifacts/evisa-operator-windows.zip` — Windows 11 x64 uchun mavjud o‘rnatuvchi paket.
- `artifacts/evisa-operator.user.js` — mavjud Tampermonkey skripti, **tayyor Chrome kengaytmasi emas**.
- `FILE-MANIFEST.json`, `SHA256SUMS.txt`, `verify-package.py` — fayllar to‘liqligi va nazorat summalari.

Paketga maxfiy kalitlar, shaxsiy bazalar, pasport/portretlar, brauzer sessiyalari va ularda shaxsiy ma’lumotlar ko‘rinadigan video/kadrlar qo‘shilmagan. Bu yangi ishlab chiqish nusxasi. Haqiqiy sozlamalar egasidan alohida olinadi. Referens video o‘rniga uning yozma tahlili bor.

## Boshlash tartibi

1. ZIP’ni to‘liq oching. Python bilan `python verify-package.py` buyrug‘ini bajaring.
2. `docs/01-ISHGA-TUSHIRISH.md` bo‘yicha `source/agent` kutubxonalarini o‘rnating.
3. `source/` ichida `node scripts/test-agent.mjs` va Python testlarini bajaring. Bunga haqiqiy Telegram yoki AI kaliti kerak emas.
4. `docs/03-QOLGAN-ISHLAR.md` bo‘yicha mavjud skript ko‘prigidan boshlab kengaytmani yarating.
5. Alohida test Telegram botidan foydalaning; bir xil bot tokeni bilan Mac va Windows’da ikki bajaruvchini yoqmang.
6. Yakuniy Windows qurilmasida Individual, Group, uzilishdan tiklash va operatorga to‘lovni topshirishni tekshiring.

**Asosiy kirish nuqtasi: `source/agent/index.mjs`.** Ildizdagi `source/package.json` eski veb panelga tegishli; Telegram botni ishga tushirish uchun `source/agent/package.json` ishlatiladi.

Kodning joriy holati birinchi navbatda Telegram boshqaruviga mo‘ljallangan. Videodagi alohida brauzer kengaytmasi, bola–vasiy va PDF vizalarni olish hali bajarilmagan. “To‘lovga tayyor” holati viza berilganini yoki pul to‘langanini anglatmaydi.
