# Tekshiruv natijalari — 2026-09-27

## Paketdan ochilgan kod

Tekshiruv ZIP’dan yangi vaqtinchalik katalogga ochilgan manbada bajarildi. Asosiy bot jarayoni qayta ishga tushirilmadi va production bazasi o‘zgartirilmadi.

Muhit: macOS, Node.js **v24.19.0**, Python **3.9.6**. npm kutubxonalari mavjud mahalliy Mac o‘rnatishidan ulandi; yangi internet orqali `npm ci` o‘rnatishi bu safar qayta bajarilmadi.

| Tekshiruv | Natija |
|---|---|
| Arxiv CRC va manifest nazorat summalari | O‘tdi |
| `node scripts/test-agent.mjs` | **112 / 112 o‘tdi**, xato va skip yo‘q |
| `python test/detect_face_test.py` | **3 / 3 o‘tdi** |
| `node agent/platform-check.mjs` | Node, SQLite, Sharp, YuNet/OpenCV va Playwright import/yuklash o‘tdi |
| Windows paketidagi relative modul importlari | Barcha kerakli modullar paketda bor |
| YuNet modeli va litsenziyasi | Ikkalasi ham paketga kiritilgan |
| Maxfiy kalit/passport raqami literal tekshiruvi | Joriy saqlangan kalitlar va haqiqiy bazadagi passport raqamlari manba/arxivga kirmagan |
| Shaxsiy fayllar chiqarib tashlanishi | Runtime bazalari, config, pasport/portret, browser profile, log, video/kadr va `.openai` akkaunt fayli chiqarilgan |

Bajarilgan buyruqlar va natijalar `validation/` ichida. Loglardagi mahalliy shaxsiy katalog yo‘llari umumiy belgiga almashtirilgan.

## Testlarning qamrovi

Operator huquqi, eskirgan callback, ko‘p passport/intake, dublikat tekshiruvi, ariza–portrait mosligi, review navbati, restart, group confirmation, o‘chirish, AI javobi tekshiruvi, forma adapterlari, 1015/429 pauzasi, browser yopilishi va localhost userscript ko‘prigi.

## Bu natija nimani tasdiqlamaydi

- Windows’da haqiqiy o‘rnatish yoki PowerShell o‘rnatuvchining to‘liq bajarilishi.
- Saudi saytining 2026-09-27 dagi live layout’i yoki blok olib tashlangani.
- Yangi haqiqiy pasportning AI o‘qish sifati: bunday tashqi so‘rov yuborilmadi.
- Yangi brauzer kengaytmasi/PDF/bola–vasiy funksiyalari: ular qolgan vazifalar ro‘yxatida.
- Kuniga 100 pasport quvvati va barcha turdagi suratlarda xatosiz crop.
- Eski veb panel production build’i.

Yakuniy arxivga ushbu natijalar qo‘shilgach nazorat summalari va tarkib yana tekshiriladi. Bot manba kodi testdan keyin o‘zgartirilmaydi; yakuniy yig‘ish faqat hujjat va test natijalarini qo‘shadi.
