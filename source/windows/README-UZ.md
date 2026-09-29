# eVisa Operator — Windows

## Hozirgi holat

Bu paket Windows 11 x64 (Intel/AMD) uchun tayyorlangan. Windows qurilmasida jonli sinov hali bajarilmagan. Yangi Windows o‘rnatishida AI va Telegram kalitlari alohida ulanadi. Individual ariza hamda 2 kishilik guruh Mac’da haqiqiy saytda to‘lovgacha tekshirilgan; to‘lov bajarilmagan.

## O‘rnatish

1. ZIP faylini mas’ul odamning Windows kompyuteriga ko‘chiring va **Extract All** orqali to‘liq oching.
2. Windows’ga botdan foydalanadigan oddiy foydalanuvchi akkaunti bilan kiring. O‘rnatishni boshqa administrator akkaunti nomidan bajarmang.
3. `windows\Install.cmd` faylini ikki marta bosing. Internet va Microsoft Edge yoki Google Chrome kerak.
4. O‘rnatuvchi Node.js 24’ni rasmiy manbadan yuklab, nazorat summasini tekshiradi. Python 3.12 mavjud bo‘lmasa Windows Package Manager orqali foydalanuvchi uchun o‘rnatadi. Kutubxonalarni shu Windows uchun o‘rnatadi.
5. Mahalliy sozlamalar oynasi ochiladi: `http://127.0.0.1:47831/`. Telegram tokenini saqlang, **Telegram orqali ulash**ni bosing va mas’ul odamning Telegram hisobida **Start**ni bosing. Keyin **Ulanganini tekshirish**ni bosing.
6. **Pasportni AI orqali o‘qish** bo‘limida API kalitini saqlang. Kalitni Telegram chatiga yozmang.
7. **Ishga tushirish**ni bosing. Telegramda `/saudi` yuborib, shu Windows’da ochilgan Edge oynasida Saudi akkauntiga kiring.

O‘rnatish manzili: `%LOCALAPPDATA%\eVisa Operator`.

Desktop’da `eVisa Operator` yorlig‘i paydo bo‘ladi. Windows’ga kirilganda bot avtomatik yoqiladi; Codex, ChatGPT yoki Mac talab qilinmaydi. Windows ishlayotgan, internetga ulangan va foydalanuvchi akkauntiga kirilgan bo‘lishi kerak. Kompyuter o‘chiq yoki uyquda bo‘lsa ish bajarilmaydi.

## Ishlatish

- `/yangi`: Individual yoki Group tanlash.
- Pasportlarni bir nechta qilib yuborish mumkin. Bot ularni o‘qib turadi, lekin bitta karta va unga tegishli portretni ko‘rsatadi. **Tasdiqlash — keyingisi** bosilgach navbatdagi karta chiqadi. Yetishmagan ma’lumot bo‘lsa, shu ariza tuzatilmaguncha yoki o‘chirilmaguncha navbat o‘tmaydi.
- `/tasdiqlash`: navbatdagi kartani qayta ochish. Navbat qayta ishga tushganda saqlanadi. Ma’lumotlarni tasdiqlash Saudi saytiga yuborishni boshlamaydi; individual ariza yoki guruh o‘z tugmasi bilan boshlanadi. Saudi pauzasida ham ma’lumotlarni tekshirish mumkin.
- Jins pasportning JINSI / SEX maydoni yoki MRZ qatoridan avtomatik o‘qiladi: M / Erkak → erkak, F / Ayol → ayol. Familiya oxiridan taxmin qilinmaydi; noaniq qiymatni operator to‘ldiradi.
- Oilaviy holat bo‘sh bo‘lsa, yosh bo‘yicha taklif chiqadi: erkak 22 dan katta / ayol 20 dan katta → turmush qurgan; shu chegaradan kichik → turmush qurmagan. Aynan 22 yoshli erkak va 20 yoshli ayol uchun avtomatik taklif yo‘q. Taklif haqiqiy holatga mos bo‘lsa tasdiqlanadi; avval to‘ldirilgan holat o‘zgarmaydi.
- Group: guruh nomini yozish → pasportlarni yuborish → ma’lumotlarni tekshirish → **Pasportlar tugadi — tayyorlash**. Bot har bir odamning Review bosqichidan so‘ng, keyingi odam bo‘lsa **Save & Add Applicant**ni bosadi. Oxirgisidan keyin guruh soni va ma’lumotlarini tekshirib to‘lovgacha tayyorlaydi.
- `/guruhlar`: guruhlarni va **AI’da qayta o‘qish** tugmasini ochish.
- `/individual`: yangi pasportlarni individual rejimga o‘tkazish.
- `/saudi`: shu Windows’dagi Saudi brauzerini ochish.
- `/tozalash`: barcha pasport, portret, ariza va guruhlar sonini ko‘rsatadi. **Ha, barchasini o‘chirish** tugmasidan keyin botdagi shu ma’lumotlar o‘chadi; ulanish sozlamalari qoladi. Tasdiq 5 daqiqa amal qiladi, ro‘yxat o‘zgarsa yoki ish bajarilayotgan bo‘lsa qayta tekshirish kerak.
- Ariza kartasida **Arizani o‘chirish**, guruh kartasida **Guruhni o‘chirish** bor. Ikkinchi tasdiqdan keyin botdagi tegishli arizalar va rasmlar o‘chadi. Saudi qoralamalari va Telegram xabarlari qoladi.
- **Portret → Qayta kesish** saqlangan pasportdan rasmni qayta tayyorlaydi; OpenAI’ga qayta yuborilmaydi. YuNet mahalliy modeli yuzni va tik yo‘nalishni aniqlaydi, soch va iyak atrofida joy qoldiradi. Surat cho‘zilmaydi; 200 × 200 kvadratni to‘ldirish uchun kerak bo‘lsa yonlariga oq joy qo‘shiladi. Noaniq rasmda to‘xtaydi; avvalgi portret saqlanadi. Model va litsenziyasi paket ichida.
- To‘lovni mas’ul odam bajaradi.

## Mac’dan topshirish

Bir Telegram botni ikki kompyuterda bir vaqtda ishlatmang. Windows’dagi Telegram bajaruvchisini yoqishdan oldin Mac’dagi bot xizmatini to‘xtatish kerak. Shu topshirish paytida mas’ul odamning Telegram hisobi ulanadi.

Bu paket yangi o‘rnatish uchun. U Mac’dagi tokenlar, pasportlar, bazalar yoki Saudi brauzer sessiyasini o‘z ichiga olmaydi. Hozirgi `test` guruhi va pasportlar Mac’da saqlangan. Ular kerak bo‘lsa, ma’lumotlar alohida ko‘chiriladi; ushbu o‘rnatuvchi mavjud bazani ustidan yozmaydi. Saudi akkauntiga Windows’da bir marta qayta kiriladi.

## Xatolik bo‘lsa

- Windows 10 yoki ARM kompyuter bo‘lsa, ushbu paketni moslashtirish kerak; avtomatik o‘rnatish to‘xtaydi.
- `winget` yo‘q bo‘lsa, Windows App Installer’ni yoki Python 3.12’ni o‘rnating va o‘rnatuvchini qayta ishga tushiring.
- Microsoft Edge yoki Google Chrome o‘rnatilgan bo‘lsin.
- Oldin o‘rnatilgan bot bo‘lsa, qayta o‘rnatish orqali ma’lumotlarni almashtirmang. Desktop yorlig‘ini oching.
- Jurnallar: `%LOCALAPPDATA%\eVisa Operator\logs`. Pasport yoki maxfiy kalitni ochiq joyga yubormang.

Texnik tekshiruvlar: umumiy bot testlari Mac’da o‘tdi; Windows uchun CI tekshiruv fayli tayyor, hali ishga tushirilmagan. Installer va Edge oynasi mas’ul odamning Windows kompyuterida yakuniy sinovdan o‘tishi kerak.

Manbalar: [Playwright tizim talablari](https://playwright.dev/docs/intro#system-requirements), [Node.js yuklash](https://nodejs.org/en/download), [Windows Package Manager o‘rnatish](https://learn.microsoft.com/en-us/windows/package-manager/winget/install).


## Muqobil: Tampermonkey skripti (sinov)

Bot sozlamalari `http://127.0.0.1:47831/` → **Brauzer skripti — sinov** bo‘limini oching.
Chrome yoki Edge’da rasmiy Tampermonkey kengaytmasini o‘rnating; shu bo‘limdagi skript havolasini o‘rnating. Chrome kengaytma sozlamalarida **Allow User Scripts** ruxsatini yoqing.
Skript rejimini yoqish tugmasi ulash kodini ko‘rsatadi. Uni Saudi eVisa sahifasidagi **Ulash** oynasiga kiriting, so‘ng **Ishga ruxsat**ni bosing.
Saudi akkauntiga shu brauzerda kiring. Telegramda individual ariza yoki guruh ma’lumotlarini tasdiqlab boshlang.
Bot dasturi, kompyuter va shu eVisa oynasi ochiq tursin. Bir vaqtda bitta Saudi oynasi boshqariladi.
**To‘xtatish** skript boshqaruvini to‘xtatadi. Qayta boshlashdan oldin saqlangan Saudi qoralamasini tekshiring.
Avvalgi usulga qaytish uchun sozlamalarda **Avvalgi brauzer rejimi**ni bosing; faol ariza tugashini kutish kerak.
Ulash kodi faqat mahalliy botga tegishli. Telegram tokeni yoki OpenAI kalitini skriptga kiritmang.
API balansi, operator tasdig‘i va portret talablari o‘zgarmaydi.
Skript to‘lov tugmasini avtomatik bosmaydi; CAPTCHA va sayt cheklovida to‘xtaydi.
Mahalliy aloqa va DOM sinovlari o‘tdi. Haqiqiy eVisa hamda Windows’da to‘liq userscript sinovi hali talab qilinadi.

Ko‘p pasport yuborilganda portretning tagida ism va ariza raqami chiqadi. Bir xil yoki juda o‘xshash pasport surati qayta yuborilsa, bot tekshirishni so‘raydi. Takroriy arizani o‘chirish yoki “Bu boshqa pasport — o‘qish” orqali tasdiqlash mumkin.

### Saudi 1015/429 cheklovi

Bu cheklovda bot eVisa navbatlarini to‘xtatadi, o‘zicha qayta urinmaydi. Pasportlarni yig‘ish va o‘qish davom etadi. Pauza qayta ishga tushganda saqlanadi. Biroz kuting; sayt yana ochilgach Telegramda `/saudi_davom` bilan pauzani yeching va kerakli ariza yoki guruhni kartasidan davom ettiring. Sayt qaytargan kutish muddatidan oldin davom etish bloklanadi.
