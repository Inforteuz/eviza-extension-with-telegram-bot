# Arxitektura va kod xaritasi

## Hozirgi oqim

Telegram pasport → alohida application ID va fayl → takroriy surat tekshiruvi → extract navbati → AI matni + mustaqil portret kesish → SQLite → bittadan tasdiqlash → Individual yoki Group ish navbati → bir Saudi brauzeri → Review/to‘lovga tayyor → operator to‘laydi.

Telegram long polling va bajaruvchi bir Node jarayonida ishlaydi. `LocalStore` barcha ishlarni lease bilan boshqaradi; bir Saudi akkauntida parallel arizalar bajarilmaydi. Bot ishlashi uchun kompyuter uyg‘oq va internetga ulangan bo‘lishi kerak.

| Fayl | Vazifa |
|---|---|
| `agent/index.mjs` | Telegram polling, job bajarish, AI/portret, brauzer, heartbeat va xabarnomalar. |
| `agent/telegram-native.mjs` | Faqat operatorning private chati; menyular, upload, tahrir, tasdiq va buyruqlar. |
| `agent/local-store.mjs` | SQLite, fayllar, APIga o‘xshash ichki request dispatcher, revision va lease tekshiruvlari. HTTP ariza serveri emas. |
| `agent/review-queue.mjs` | Bittadan review; tasdiq data+fayl fingerprintiga bog‘langan; ko‘rsatilgan karta restartda saqlanadi. |
| `agent/group-store.mjs` | Guruh a’zolari, joylashuv tartibi, revision, a’zo tasdig‘i va guruh checkpointi. |
| `agent/delete-store.mjs` | Ariza/guruh/barcha fayllarni tasdiqlab o‘chirish, tombstone va qayta kelgan eski Telegram update’larini bloklash. |
| `agent/prepare-passport.mjs` | AI matni va portretni alohida tayyorlash. Matn xatosi portret olishni avtomatik bekor qilmaydi. |
| `agent/passport-ai.mjs` | Rasm → Responses API → qat’iy JSON; standart model gpt-4.1. |
| `agent/mrz.mjs` | Pasportdagi mashina o‘qiydigan qatorlar va nazorat raqamlari. |
| `agent/passport-image.mjs` | SHA256 va butun surat fingerprinti bilan takroriy passport rasmiga signal. Yuz orqali shaxsni tanimaydi. |
| `agent/portrait.mjs`, `agent/detect-face.py` | YuNet bilan yuz yo‘nalishi/joyini aniqlash, asli suratdan 200×200 JPEG, 5–100 KB. |
| `lib/domain.ts` | Applicant maydonlari, tekshiruvlar, shablon va operatorga ko‘rsatiladigan takliflar. |
| `agent/visa.mjs` | Login, individual formalar, sug‘urta, shartlar va yakuniy ma’lumotlarni tekshirish. |
| `agent/group-visa.mjs`, `agent/group-review.mjs` | Save & Add Applicant, har bir a’zo checkpointi, umumiy guruh review tekshiruvi. |
| `agent/saudi-browser.mjs` | Botga tegishli persistent Playwright brauzeri; yopilgan tab/context holatini tiklash. |
| `agent/saudi-rate-limit.mjs` | 1015/429 aniqlash, barcha Saudi ishlarini pauza qilish va yangi operator tasdig‘i bilan pauzani yechish. |
| `agent/visa-diagnostics.mjs` | Faqat eVisa ariza sahifasining xato diagnostikasi. |
| `agent/userscript-client.mjs`, `userscript-dom.mjs` | Tampermonkey oynasi va sahifadagi ruxsat etilgan DOM amallari. |
| `agent/userscript-bridge.mjs` | 47832 localhost ko‘prik, ulash kodi, bitta tab/document va bir martalik buyruqlar. |
| `agent/setup.mjs`, `setup.html`, `config.mjs` | 47831 lokal sozlama, kalitlarni saqlash, ulanish tekshiruvlari. |
| `windows/` | O‘rnatuvchi, ishga tushiruvchi supervisor, standart konfiguratsiya. |

Eski `extract-passport.mjs`/Tesseract yordamchilari paketda qolgan, lekin faol `index.mjs` matnni AI orqali o‘qiydi; live yo‘lda mahalliy OCR fallback yo‘q.

## Ikki xil navbat

1. **Tasdiqlash navbati:** birinchi odamning ma’lumot+portreti chiqadi; boshqalari orqada tayyorlanadi. `review-confirm` Saudi ishini boshlamaydi. Yetishmagan/takroriy/noaniq ariza tuzatilmaguncha yoki o‘chirilmaguncha shu navbatda qoladi.
2. **Bajarish navbati:** `extract`, `portrait`, `visa` yoki group ishini lease bilan bajaradi. Group a’zolarining amaldagi ma’lumot/portreti oldindan tasdiqlangan bo‘lishi kerak.

Eski Telegram kartalaridagi `approve` kabi ayrim callback’lar hali oldingi yo‘lni saqlaydi; kengaytma yangi review-confirm oqimini ishlatishi kerak. Tugmalar faqat IDga emas, joriy versionga ham bog‘liq bo‘lsin.

## Fayllar va saqlash

- `agent/data/config.json`: sirlar va ulanishlar. Paketda yo‘q.
- `agent/data/state.sqlite`: Telegram offset, OTP qayta ishlash va yordamchi bajarish holati.
- `agent/data/standalone/applications.sqlite`: applications, visa_groups, metadata, events, telegram_reviews, o‘chirilgan obyekt/fayllar registri.
- `agent/data/standalone/files/<UUID>`: pasport va portretlar. Bitta umumiy `portrait.jpg` bilan barcha odamlarni almashtirmang.
- `agent/data/saudi-profile/`: Saudi brauzer sessiyasi. OSlar orasida ko‘chirish o‘rniga yangi qurilmada qayta login qiling.
- `agent/data/<id>.diagnostic.json`: xatolarda shaxsiy ma’lumot bo‘lishi mumkin; ommaviy bug reportga yubormang.

`status=payment_ready` faqat review/to‘lovga topshirishni bildiradi. Bot `AGREE & COMPLETE PAYMENT`ni bosmaydi, karta raqami kiritmaydi. Hozir to‘lov yoki berilgan viza holatini avtomatik kuzatish yo‘q.

## Kengaytma uchun boshlang‘ich yo‘l

Mavjud userscript ko‘prigini qayta ishlatish mumkin, lekin u faqat DOM buyruqlarini bajaradi. Unga yangi yuklash, ro‘yxat, tahrir, preview/tasdiq va navbat boshqarish interfeysi kerak. Yangi API’lar alohida autentifikatsiya va joriy ariza revision tekshiruvlarini saqlasin.

Kengaytma pop-up’i yopilsa ham ish holati saqlanishi kerak: holatni faqat popup xotirasida qoldirmang. Sahifa navigatsiyasi document IDni almashtiradi; eskirgan buyruq yangi odamga yuborilmasin. Amali noaniq Save/Add/Next bosishni qayta avtomatik yuborish mumkin emas — checkpoint va rasmiy ariza IDsi tekshiriladi.

Mavjud mahalliy bajaruvchi bilan birinchi variant serverga ko‘chishni talab qilmaydi. Keyinchalik faqat kengaytma va markaziy server varianti tanlansa, sirlar, foydalanuvchilar, fayllar saqlanishi va navbat izolyatsiyasi alohida loyihalanadi.
