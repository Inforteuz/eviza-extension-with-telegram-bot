# Holat va amaliy chegaralar

## Bajarilgan

- Mustaqil Telegram bot: alohida web panel, Codex yoki ChatGPT sahifasi talab qilinmaydi.
- Faqat bitta mas’ul Telegram akkaunti; private chat, eski callback/revision va operator tasdiqlari tekshiriladi.
- Individual/Group tanlovi, guruh nomi, ko‘p pasport, tahrir, ariza/guruh/barchasini o‘chirish.
- AI matni, MRZ tekshiruvi, YuNet orqali portret yo‘nalishi va asli tasvirdan kesish.
- Tasdiqlash navbati: birinchi karta chiqadi; keyingilar o‘qilib turadi; tasdiqdan keyin keyingisi. Restartda navbat saqlanadi.
- Individual va guruh eVisa adapteri; Save & Add Applicant orqali odamlar ketma-ket qo‘shiladi; Review’dan to‘lov operatorga topshiriladi.
- Ariza raqami/IDsi, bosqich va guruh a’zolari checkpointi orqali tiklash.
- 1015/429 pauzasi: Saudi ishlari to‘xtaydi, mahalliy tayyorlash va review davom etadi.
- Tampermonkey skripti va localhost ko‘prigi; paket ichida 0.1.1 skript bor.
- Windows 11 x64 o‘rnatuvchisi va GitHub Actions tekshiruv fayli.

## Tarixiy jonli natijalar — ayni kundagi qayta sinov emas

- 2026-09-15: bir individual ariza yakuniy Review/to‘lovga tayyor bosqichga yetgan; 23 ma’lumot maydoni tekshirilgan; to‘lov bosilmagan.
- 2026-09-17: 2 kishilik guruh keyingi a’zo qo‘shish orqali to‘lovga tayyor bo‘lgan. Videodagi bot emas, shu loyihaning Mac/Playwright rejimi tekshirilgan.
- 2026-09-17: keyingi guruhda Cloudflare 1015 qayd etilgan; botga doimiy pauza va ortiqcha navigation/typing’ni kamaytirish kiritilgan.
- 2026-09-17: 112 Node testi o‘tgan. Ushbu topshirishdagi yangi paket testi natijasi `07-TEKSHIRUV.md`da.

Bu topshirishni tayyorlashda Saudi saytiga yangi ariza yuborilmaydi va haqiqiy pasport AI’ga jo‘natilmaydi. Hozirgi tashqi sayt/layout yoki cheklov bekor bo‘lganiga yangi da’vo qilinmaydi.

## Tuzatilgan xatolar va saqlanishi kerak bo‘lgan tekshiruvlar

| Muammo | Mavjud yechim |
|---|---|
| Browser/page yopilgach bringToFront xatosi | Botga tegishli session holatini yangilash va cheklangan tiklash. |
| Fuqarolik UZBEKISTAN/UZB holida kelishi | Saytdagi Uzbekistan option’iga moslash; tasdiqlangan asl data o‘zgarmaydi. |
| Guruh birinchi odamdan keyin yurmasligi | btnAddMoreToGroup / Save & Add Applicant; faqat keyingi odam mavjud bo‘lsa. |
| Bir nechta pasportda ariza–portret chalkashligi | UUID bo‘yicha fayllar; portret exact revisionga bog‘langan va o‘z kartasiga reply qilinadi. |
| Bir passport rasmining turli suratlari | Butun hujjat fingerprinti; operator tekshiruvisiz qayta yuborilmaydi. |
| Teskari yoki qisman kesilgan portret | To‘rt yo‘nalishda yuz/landmark, noaniq holatda stop; recrop eski rasmni yangi muvaffaqiyatli saqlanmaguncha o‘chirmaydi. |
| Ko‘p karta chatga birvarakay chiqishi | Persistent review queue, bir paytda bitta avtomatik karta. |
| 1015/429 | Umumiy Saudi pause, Retry-After bo‘lsa hurmat qilish, o‘zicha qayta davom etmaslik. |

## Hali tekshirilmagan / cheklangan

- Windows qurilmasida haqiqiy o‘rnatish, brauzer va to‘lovgacha end-to-end sinov.
- Tampermonkey rejimida haqiqiy eVisa end-to-end. Mahalliy ko‘prik/DOM testlari jonli sinov o‘rnini bosmaydi.
- Kuniga 100 pasport yuklamasi va turli pasportlarda aniq OCR/crop ko‘rsatkichlari.
- Bola/vasiy, viza PDF’larini olish, xizmat balansi va ko‘p foydalanuvchili kabinet.
- Menyudagi eski inline tugmalar ayrim eski flow’larni saqlaydi; yangi extension bilan yagona review shartnomasini belgilash kerak.
- Windows skripti Node 24’ning so‘nggi x64 versiyasini checksum tekshirib yuklaydi. Yetkazilgan aniq versiyani release sinovida qayd eting.
- Eski panelning production build/deployment’i ushbu topshirishda tekshirilmaydi; u faol mahsulot emas.

Asosiy runtime modullari o‘rnatilgan Mac nusxasi bilan solishtirildi: 39 fayl bir xil. `install-service.mjs` va `migrate-to-telegram.mjs` yordamchilari farq qiladi; `userscript-client.mjs`/`userscript-dom.mjs` faqat manbada, ularning qurilgan `.user.js` nusxasi runtime’da bor. Ushbu manba paket ishlab chiqish uchun joriy checkoutdan olingan. Tarixiy ko‘chirish/yordamchi skriptlarini mavjud production ma’lumotlarida tekshirmay ishga tushirmang.
