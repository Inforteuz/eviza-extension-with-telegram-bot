# eVisa — Telegram + AI + brauzer skripti

## Tayyorlangan variant

Telegram botdagi pasport o‘qish, portret tayyorlash, arizalar va guruhlar saqlanadi. Tampermonkey skripti eVisa sahifasini operator ochgan brauzer ichida boshqaradi. To‘lov tugmasi avtomatik bosilmaydi.

## Hozirgi Mac’da ulash

1. Chrome yoki Edge’da [Tampermonkey rasmiy sahifasi](https://www.tampermonkey.net/) orqali kengaytmani o‘rnating. Chrome kengaytma sozlamasida **Allow User Scripts**ni yoqing. [Tampermonkey ruxsat qo‘llanmasi](https://www.tampermonkey.net/faq.php?locale=en&q=Q209).
2. **Shu brauzerda** `http://127.0.0.1:47831/` manzilini oching. **Brauzer skripti — sinov** bo‘limida **eVisa skriptini o‘rnating** havolasini bosing.
3. Tampermonkey o‘rnatish oynasi chiqmasa, `evisa-operator.user.js` faylining to‘liq matnini Tampermonkey → **Create a new script** oynasiga joylashtiring va saqlang. Skriptni eVisa sahifasining konsoliga qo‘ymang.
4. Bot sozlamalarida **Skript rejimini yoqish / kodni olish**ni bosing. Ko‘rsatilgan ulash kodini nusxalang.
5. `https://visa.visitsaudi.com/Visa/Index` sahifasini oching. Past o‘ng burchakdagi **eVisa — Telegram skripti** blokida **Ulash**ni bosing, kodni kiriting, keyin **Ishga ruxsat**ni bosing. Mahalliy botga ulanish ruxsati so‘ralsa, aynan `127.0.0.1` ulanishini tekshiring.
6. Shu sahifada Saudi akkauntiga kiring. Telegramda tayyor ariza ma’lumotlarini tekshirib, odatdagi eVisa’ga tayyorlash tugmasini bosing. Guruh uchun guruh kartasidan boshlang.

Bot dasturi, kompyuter va bitta eVisa oynasi ochiq turishi kerak. Skript GPT sayti yoki Codex oynasiga bog‘liq emas.

## To‘xtatish va qaytish

- Brauzerdagi **To‘xtatish** tugmasi avtomatik boshqaruvni to‘xtatadi.
- Aloqa uzilsa, tugma qayta-qayta bosilmaydi. Saqlangan qoralamani tekshirib, Telegramdan davom eting.
- Avvalgi usulga qaytish: mahalliy sozlamalarda **Avvalgi brauzer rejimi**. Joriy ariza tugamaguncha rejim almashtirilmaydi.
- Ulash kodi OpenAI kaliti yoki Telegram tokeni emas. API kalitini va bot tokenini skriptga kiritmang.

## Windows

Yangilangan `evisa-operator-windows.zip` paketini ochib, `Ornatish.cmd`ni ishga tushiring. Windows kompyuterda Telegram va AI ulanishlarini sozlang, so‘ng yuqoridagi Tampermonkey qadamlarini bajaring. Mac’dagi botni Windows botini ishga tushirishdan oldin to‘xtating: bir Telegram botni ikki kompyuter bir vaqtda boshqarmasin.

## Tekshirilgan chegaralar — 2026-09-17

- Avvalgi 68 ta avtomatlashtirilgan test va yangi 7 ta mahalliy ulanish testi o‘tdi.
- Brauzerdagi 11 ta DOM sinovi o‘tdi: maydonlar, Umrah, portret fayli, sana taqvimi, to‘lov/nomalum tugmalarni bosmaslik, CAPTCHA va takroriy maydonlarda to‘xtash.
- Skript orqali haqiqiy eVisa arizasini boshidan to‘lovgacha tayyorlash hali jonli sinovdan o‘tmagan. Avvalgi brauzer rejimida 2 kishilik guruh to‘lovgacha tekshirildi. Userscript hamda Windows’dagi to‘liq jarayon alohida sinov talab qiladi.
- To‘lovdan keyingi API sinovi HTTP 200 va `OK` bilan yakunlandi. GPT‑4.1 ulanishi ishladi. Operator hozircha pasport yubormaslikni tanladi; ushbu tekshiruvda pasport OpenAI’ga yuborilmadi.
- Skript saytdagi cheklovlarni aylanib o‘tmaydi va bloklanmaslik kafolatini bermaydi.

0.1.1 versiya: guruhdagi **Save & Add Applicant** tugmasi qo‘shildi. Avvalgi skript o‘rnatilgan bo‘lsa, mahalliy sozlamalar havolasidan yangi versiyasini o‘rnating.
