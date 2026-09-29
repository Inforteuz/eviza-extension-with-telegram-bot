# VisaBot videosi va bizning bot: taqqoslash

Sana: 2026-09-21.

## Xulosa

Videoda ko‘rsatilgan ish jarayoni va boshqaruvni mavjud loyihamiz asosida yaratish mumkin. Eng katta farq — Chrome ichida ishlaydigan, pasportlarni bevosita qabul qiladigan kengaytma. Bizning Telegram navbati, AI orqali o‘qish, portret kesish va eVisa formalarini to‘ldirish kodimiz qayta ishlatiladi.

Bu tahlil foydalanuvchi bergan `tutorial.mp4` faylining asosiy bosqichlari kadrlarini va mahalliy manba kodini solishtirishga asoslangan. Video 8 daqiqa 25 soniya. Telegram botning ochiq havolasi bu tekshiruvda yuklanmadi; uchinchi tomon botiga xabar, pasport yoki kalit yuborilmadi. Uning ichki kodi, AI modeli va serveri tekshirilmagan.

## Videoda kuzatilganlar

| Vaqt | Kuzatilgan jarayon |
|---|---|
| 00:20 | Chrome ichida “Visa Auto-Filler”: Telegram orqali ulash, qo‘lda ulash tokeni, balans va hujjat uchun narx. |
| 01:25–01:40 | Bir necha JPG/PNG faylni oynaga tashlash; 4 odamning nomi, portreti, tayyorlik holati va alohida olib tashlash/qayta ishlash belgisi. |
| 01:40 | Start, Stop, Clear tugmalari; bajarilish soni va jarayon jurnali. Ro‘yxatda “25 tadan” yozuvi bor, lekin videoda 4 odam namoyish etilgan. |
| 02:10 | Operator eVisa’da Group tugmasini bosib guruh nomini kiritadi. |
| 02:20–03:55 | Shaxsiy ma’lumot, portret, pasport, safar, sug‘urta va shartlar bosqichlari bir necha odam uchun ketma-ket to‘ldiriladi. |
| 04:00 | Voyaga yetmagan arizachining yakuniy ko‘rinishida Guardian Name va Guardian Relation maydonlari bor. Ularning aynan qanday tanlangani videodan to‘liq aniqlanmaydi. |
| 04:05–04:35 | Guruhdagi 4 ariza va umumiy to‘lovdan oldingi ko‘rinish chiqadi. Namoyishda to‘lov yakunlanmaydi. |
| 06:20 | Telegramda “Mening tokenim”, “Balans”, “To‘ldirish”, “Statistika”, “Vizalarim”, “Yordam” tugmalari va PDF viza xabari ko‘rinadi. PDF olishning barcha ichki bosqichlari ko‘rsatilmagan. |

Videodagi narx xizmatning o‘sha namoyishdagi narxidir; amaldagi tarif va API xarajati tekshirilmagan.

## Bizdagi holat

| Funksiya | Holat va qolgan ish |
|---|---|
| Ko‘p pasport qabul qilish | Telegramda mavjud; kengaytma ichida fayl tanlash va sudrab tashlash qo‘shiladi. |
| Pasport matnini o‘qish, portret olish | Mavjud. Har bir fayl alohida ariza va portretga bog‘lanadi. |
| Individual va Group to‘ldirish | Mavjud. Mac’da individual va 2 kishilik guruh to‘lovga tayyor bosqichgacha tekshirilgan; 3 kishilik takrorlanish avtomatik testda tekshirilgan. |
| Bir akkauntdagi tayyor ochiq brauzerda ishlash | Tampermonkey skripti va mahalliy ko‘prik mavjud. Videodagidek alohida kengaytma, fayllar ro‘yxati va boshqaruv oynasi hali yo‘q. |
| Ma’lumotlarni ko‘rib tasdiqlash | Telegramda bittadan karta bilan mavjud. Shu tekshiruvni kengaytmaga moslashtirish kerak. |
| Start / Stop / Clear va jarayon jurnali | Ayrim imkoniyatlari Telegram va skriptda mavjud; videodagidek yagona oynaga yig‘ish, ish paytida to‘xtatish va davom ettirishni tekshirish kerak. |
| Bola va vasiy | Hozirgi Applicant modelida vasiy maydonlari yo‘q. Haqiqiy vasiy ma’lumotlarini kiritish, bog‘lash va eVisa’da tekshirish qo‘shiladi. |
| Viza PDF’ini olish va Telegramga yuborish | Hozir yo‘q. Viza berilgach uni aniqlash, tegishli arizachiga bog‘lash va rasmiy PDF’ni olish alohida bosqich. |
| Balans, tarif, foydalanuvchi kabineti | Hozir bitta operatorga mo‘ljallangan. Pullik xizmat sifatida aynan shu funksiyalar kerak bo‘lsa, hisob-kitob va foydalanuvchilar tizimi qo‘shiladi. |
| Statistika | Joriy arizalar va navbat soni bor; alohida davriy hisobot menyusi yo‘q. |
| Windows | Paket mavjud, lekin maqsadli Windows kompyuterida o‘rnatish va to‘liq jarayon sinovi hali qolgan. |

Manba kodlari: `agent/telegram-native.mjs`, `agent/review-queue.mjs`, `agent/visa.mjs`, `agent/group-visa.mjs`, `agent/userscript-client.mjs`, `agent/userscript-bridge.mjs`, `lib/domain.ts`.

## Tavsiya etilgan ketma-ketlik

1. Mavjud ishlaydigan botni saqlab, unga ulanadigan Chrome/Edge kengaytmasi: ulash, fayllarni yuklash, portretli ro‘yxat, tahrir va tasdiq, Start/Stop, taraqqiyot ko‘rsatkichi.
2. Tasdiqlangan arizalarni aynan shu ochiq eVisa oynasida Individual/Group bo‘yicha to‘ldirish; sahifa almashganda navbatni saqlash; noaniq yuborishni takrorlamaslik; to‘lovda operatorga topshirish.
3. Voyaga yetmagan arizachi va vasiy bog‘lanishi.
4. Berilgan viza PDF’larini olish va Telegramdagi arizaga biriktirish.
5. Kerakli kabinet, statistika va xizmat tarifi/balans tizimi.
6. Windows’da bir necha haqiqiy arizachi bilan operator nazoratidagi yakuniy sinov.

Boshlang‘ich variant mavjud mahalliy bajaruvchi bilan ishlashi mumkin. Kompyuterga mahalliy bajaruvchi o‘rnatmasdan, faqat kengaytma bilan ishlatish talab qilinsa, AI kalitlarini va Telegram botini saqlaydigan server alohida kerak bo‘ladi. API kalitini kengaytmaning tarqatiladigan kodiga joylamaymiz.

Brauzer kengaytmalari sahifa maydonlarini o‘qish va o‘zgartirish imkonini beradi: [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts). Chrome va Edge uchun kengaytma ishlab chiqish asoslari yaqin; moslikni maqsadli brauzerda tekshirish lozim: [Microsoft Edge extensions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/).

## Tekshirilmagan jihatlar

- Ularning qaysi AI modeli ishlashi, o‘qish aniqligi va xatolarni tiklash tartibi videodan ma’lum emas.
- Video kuniga 100 ta ariza hajmini, 25 kishilik guruhni yoki bloklanmaslikni isbotlamaydi.
- Kengaytma qilish saytning 1015/429 cheklovlarini bekor qilmaydi. Shu cheklovda to‘xtash va ruxsat etilgan yuklamaga rioya qilish saqlanadi.
- Bu safar tahlil bajarildi. Ishlayotgan botning kodi, akkaunt sozlamalari va arizalari o‘zgartirilmadi.
