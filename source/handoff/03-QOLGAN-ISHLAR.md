# Qolgan ishlar va qabul mezonlari

## P0 — boshlang‘ich holatni takrorlash

- [ ] Manba paketini yangi katalogda ochib dependency va testlarni o‘rnatish.
- [ ] Alohida test bot va bo‘sh test bazasi bilan upload → AI → portret → review oqimini tekshirish.
- [ ] Maqsadli Windows qurilmasida o‘rnatuvchi, Node/Python/OpenCV, Edge va restartni tekshirish.
- [ ] 1015/429 pauzasini mavjud ma’lumotlarni yo‘qotmasdan ko‘rsatish. Pauzaning o‘zi blok tugaganini bilmaydi; aniq vaqt berilmasa taxmin qilmaydi.

Qabul: avvalgi 112 Node testi va 3 Python testi o‘tadi; yangi qurilmada operator kartani ko‘radi; kalit yoki pasport test loglariga chiqmaydi.

## P1 — referensdagi brauzer kengaytmasi

- [ ] Chrome/Edge uchun manifest, background/content script va pop-up/side panel.
- [ ] Telegram operatori bilan ulash: kengaytma faqat o‘z egasining navbatiga kiradi. Telegram bot tokeni yoki AI kaliti extension bundle’iga yozilmaydi.
- [ ] Bir yoki bir necha JPG/PNG: fayl tanlash va drag-and-drop.
- [ ] Arizachilar ro‘yxati: portret, ism, pasportning ajratib turuvchi qismi, tayyor/o‘qilmoqda/xato holati.
- [ ] Individual/Group, guruh nomi, odam qo‘shish/o‘chirish, qayta o‘qish/kesish.
- [ ] Ma’lumotlarni tahrirlash va bittadan fresh revision bilan tasdiqlash; tasdiqlangan ma’lumot o‘zgarsa qayta tekshirish.
- [ ] Start/Stop/Clear; o‘chirishning aniq tasdig‘i; bajarilayotgan ishni xavfsiz to‘xtatish.
- [ ] Progress: nechta odam tugadi, qaysi odam/bosqichda, aniq xato va davom ettirish amali.
- [ ] Ochiq eVisa tabiga ulanib mavjud individual/group adapterini ishlatish.

Qabul: 6 ta turli sintetik pasport tasvirining ma’lumotlari va portretlari almashmaydi; pop-up yopilib ochilganda holat saqlanadi; ikkinchi tab birinchi ishni o‘g‘irlamaydi; eski tugma yangi odamga ta’sir qilmaydi. Egasi ruxsat bergan jonli sinovda 1 individual va kamida 3 kishilik guruh to‘lovgacha yetadi; to‘lov bosilmaydi.

## P2 — bola va vasiy

- [ ] Applicant modeliga kerakli vasiy maydonlari va guruh a’zosiga bog‘lanishni kiritish.
- [ ] Amaldagi eVisa formasida bola uchun talablar va ko‘rinadigan tanlovlarni tekshirish.
- [ ] Vasiy kimligini va qarindoshlikni operator kiritadi/tasdiqlaydi; familiya yoki yoshdan taxmin qilib rasmiy maydon yuborilmaydi.
- [ ] Guruh tartibi, mos voyaga yetgan a’zoga bog‘lash, yakuniy review va tiklashni qo‘shish.

Qabul: bola+haqiqiy vasiy bilan alohida sintetik va ruxsatli jonli ssenariy; noto‘g‘ri/guruhdan o‘chirilgan vasiy bilan yuborish bloklanadi.

## P3 — to‘lovdan keyingi PDF vizalar

- [ ] Rasmiy akkauntda berilgan viza holatini operator boshlagan tekshiruv orqali aniqlash.
- [ ] Rasmiy PDF’ni yuklash, ariza/visa raqami va pasport bilan tekshirib biriktirish.
- [ ] Telegramda “Vizalarim”, bir marta yuborish va qayta yuklash.
- [ ] Pending, rad etilgan, muddati tugagan, login kerak va yuklash xatolarini alohida ko‘rsatish.

Qabul: boshqa arizachining PDF’i yuborilmaydi; bir xil natija qayta tekshirilsa takroriy xabarlar bosmaydi; original rasmiy PDF saqlanadi. To‘lovni avtomatlashtirish talab qilinmagan.

## P4 — xizmat kabineti

- [ ] Davr bo‘yicha muvaffaqiyat/xato/tayyor arizalar statistikasi.
- [ ] Egasi xizmatni boshqalarga tarqatmoqchi bo‘lsa: foydalanuvchilar, ulash tokenlari, tarif/balans, mablag‘ to‘ldirish va sarf tarixi.
- [ ] Qaysi hodisa pulli hisoblanishini egasi bilan aniqlash; qayta urinish va dublikat uchun ikki marta yechilmasin.

Bu biznes qoidalar hali belgilanmagan. Videoda ko‘rsatilgan 2 000 so‘mni bu loyihaning tasdiqlangan tarifi deb olmang. Hozir bitta mas’ul operator va bir Saudi akkaunti mavjud.

## P5 — topshirish

- [ ] Windows loginidan keyin avtomatik start, kompyuter uyqusi/tarmoq uzilishi, brauzer yopilishi va API xatolaridan tiklash.
- [ ] AI o‘qish va rasm sifati: xira, burilgan, teskari, qisman kesilgan va takror yuborilgan rasmlar.
- [ ] Saudi cheklovi bo‘lsa avtomatik qayta hujum qilmasdan pauza; pasport tayyorlash/review davom etishi.
- [ ] Kuniga taxminan 100 pasport ehtiyoji uchun o‘qish va saytga yuborishni alohida o‘lchash. Saytning ruxsat etilgan hajmi noma’lum; kunlik quvvat tekshirilmaguncha kafolatlanmaydi.
- [ ] Paket, foydalanuvchi yo‘riqnomasi, versiya, qaytarish yo‘li va qabul sinovi natijalarini topshirish.

## Saqlanadigan kelishuvlar

- Bir Saudi akkaunti, operator aralashuvi to‘lovda; login/OTP/CAPTCHA zarur bo‘lsa operator bajaradi.
- Pasport matnini AI o‘qiydi; yuzi original pasportdan olinadi, yangi yuz yaratilmaydi.
- Standart safar maqsadi Umrah; mehmonxona Al Jabriy; pochta indeksi bo‘sh, sayt majburiy talab qilsa alohida ko‘riladi.
- Kirish sanasi ariza tayyorlash kuni; chiqish bir kalendar yil minus bir kun. Mavjud tasdiqlangan arizalardagi sanalarni yashirin o‘zgartirmang.
- None kasbi, oilaviy holat va tug‘ilgan joyga asoslangan yashash manzili — operator tekshiradigan takliflar. Tasdiqlangan mavjud qiymatlar ustidan yozilmaydi. Hozirgi chegara: erkak 22, ayol 20; aynan chegara yoshida tanlov operatorga qoladi.
- Gmail integratsiyasi kodda bor, lekin hozirgi ish uchun keyinga qoldirilgan. Ulangan deb hisoblamang.
