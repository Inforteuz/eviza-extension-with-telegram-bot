# Ulanishlar va kompyuterni topshirish

## Egadan alohida olinadigan ma’lumotlar

| Ulanish | Kerakli ma’lumot |
|---|---|
| Telegram | Alohida test bot tokeni; yakuniy bot tokeni va mas’ul operatorning raqamli IDsi ishga chiqarishda. |
| AI | Yetarli balansi va kerakli modelga ruxsati bo‘lgan API kaliti; model nomi. |
| Saudi | Mavjud akkauntga yangi brauzerda kirish; email kodi/CAPTCHA’ni egasi yakunlaydi. |
| Gmail | Hozir shart emas. Keyinchalik OAuth yoki App Password va haqiqiy tasdiqlangan OTP jo‘natuvchisi. |
| Pullik kabinet | Faqat bu scope tasdiqlansa: foydalanuvchilar, tarif, to‘lov provayderi va refund/retry hisobi. |

Kalitlarni manba kodiga, ZIP yoki Telegram matniga qo‘shmang; tegishli qurilmadagi mahalliy sozlamaga egasi kiritadi. Paketdagi `.env.example` sirlarni o‘z ichiga olmaydi. Eski panel credentiallari Telegram ishiga kerak emas.

## Ma’lumotlarni ko‘chirish kerak bo‘lsa

Ushbu ZIP kod paketidir. Unda haqiqiy pasportlar, SQLite bazalari, sozlamalar va Saudi cookie/profile yo‘q. Ko‘chirish egasi bilan alohida bajariladi.

1. Amaldagi ishlar to‘xtaganini tekshiring va eski bajaruvchini to‘xtating. Bir Telegram tokeni bilan ikkita long-polling worker ishlamasin.
2. Bajaruvchi to‘liq yopilgach ma’lumotlarning zaxira nusxasini oling. Faqat `applications.sqlite`ning o‘zini nusxalash yetmaydi: unga mos `standalone/files`, `state.sqlite` va tegishli metadata kerak.
3. Maqsadli qurilmada test qilingan yangi kod o‘rnatilsin. Windows o‘rnatuvchi mavjud `agent/data`ni ustidan yozishni rad etadi; oldin o‘rnatilgan bazani paket bilan almashtirmang.
4. Fayl kalitlari, application/group IDlari, review confirmation va checkpointlar mosligini tekshiring.
5. Windows’dagi Python/Node yo‘llarini shu OSga moslang; Mac yo‘llarini config bilan ko‘chirmang.
6. Saudi akkauntiga yangi dedicated brauzerda qayta kiring. Mac profile/cookie’larini developer paketiga qo‘shmang.
7. Egasi mas’ul xodimga o‘tkazsa, operator IDsi va botni boshqarish huquqini yangi qurilmada sozlang.
8. Eski ishning natijasi noaniq bo‘lsa, saqlangan rasmiy draftni tekshirib davom eting; yangi ariza yaratib yubormang.

## Production joylashuvlari

Mac: `~/Library/Application Support/eVisa Operator`; LaunchAgent nomi `uz.evisa.operator`.

Windows: `%LOCALAPPDATA%\eVisa Operator`; interaktiv foydalanuvchi sessiyasida Desktop/login shortcut bilan supervisor.

Mahalliy DB va secretlar ishchi manba katalogidagi eski nusxadan emas, aynan o‘rnatilgan runtime’dan olinadi. Shu sabab dev ZIP ichida ular yo‘q.

## Hisob egasidan qabul qilinadigan yakuniy natija

- Windows’da dasturni ochish va Telegram/kengaytma bilan ulash uchun qisqa yo‘riqnoma.
- Bo‘sh yangi o‘rnatish va mavjud bazani saqlagan yangilash yo‘li.
- Kamida Individual va Group bo‘yicha jonli sinov dalili; hech qanday avtomatik to‘lov bo‘lmasligi.
- AI xatosi, portrait xatosi, tarmoq uzilishi va Saudi pauzasidagi aniq foydalanuvchi xabarlari.
- Versiyalangan manba va o‘rnatuvchi, qaytarish yo‘li, maxfiy kalitlar kiritilmagan arxiv.
