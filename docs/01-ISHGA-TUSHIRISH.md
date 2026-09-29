# Ishga tushirish

## Versiyalar va talablar

- Node.js **24.x** tavsiya etiladi. `node:sqlite` va Node orqali TypeScript’ni o‘qish ishlatiladi.
- Python **3.12** — Windows o‘rnatuvchisining maqsadli versiyasi. Joriy Mac Python tekshiruvi versiyasi `07-TEKSHIRUV.md`da.
- `agent/package-lock.json` bo‘yicha npm kutubxonalari.
- `agent/requirements.txt`: `opencv-python-headless==4.13.0.92`.
- Chromium oilasidagi brauzer: sozlamadagi `BROWSER_CHANNEL=msedge` yoki `chrome`. Windows o‘rnatuvchisi Edge’ni tanlaydi.
- YuNet ONNX modeli va MIT litsenziyasi `agent/` ichida. Modelni nusxalashda ikkalasini ham saqlang.

## Alohida ishlab chiqish nusxasi

Quyidagi buyruqlarni `source/` katalogida bajaring:

```sh
npm ci --prefix agent --no-audit --no-fund
python3 -m venv agent/.venv
agent/.venv/bin/python -m pip install -r agent/requirements.txt
node scripts/test-agent.mjs
agent/.venv/bin/python test/detect_face_test.py
```

Windows PowerShell’da Python qismi:

```powershell
py -3.12 -m venv agent/.venv
.\agent\.venv\Scripts\python.exe -m pip install -r agent/requirements.txt
node scripts/test-agent.mjs
.\agent\.venv\Scripts\python.exe test/detect_face_test.py
```

Testlar sintetik ma’lumot va vaqtinchalik bazalardan foydalanadi. Ko‘prik testlari `127.0.0.1`da vaqtinchalik port ochadi. Haqiqiy pasportni AI yoki Saudi saytiga yuborish bu buyruqlarning qismi emas.

## Lokal Telegram sinovi

1. `agent/.env.example`dan `agent/.env` nusxasini yarating.
2. `RUN_MODE=telegram`, `TELEGRAM_MINI_APP_ENABLED=0`, `ENABLE_VISA_SUBMISSION=0`, `HEADLESS=0` qo‘ying. `PANEL_URL`, `PANEL_TOKEN`, `OAI_SITES_AUTH_TOKEN` qiymatlari Telegram rejimida bo‘sh bo‘lsin.
3. `PYTHON_BIN`ga venv interpreterining to‘liq yo‘lini yozing. `BROWSER_CHANNEL=msedge` yoki `chrome` tanlang.
4. `node agent/setup.mjs`ni ishga tushiring va `http://127.0.0.1:47831/`ni oching. Telegram uchun alohida test botini ulang; operatorning raqamli Telegram IDsi tanlanadi.
5. AI kalitini mahalliy sozlamaga kiriting. Haqiqiy pasport sinovi egasi bilan kelishilgan alohida ish bo‘ladi.
6. Sozlamadan bajaruvchini ishga tushiring. Fon xizmati sifatida kerak bo‘lmasa, hozircha `install-service.mjs`ni ishlatmang.
7. Saudi sinovi uchun tayyor bo‘lgach `ENABLE_VISA_SUBMISSION`ni tegishli sozlamada yoqing va bajaruvchini qayta ishga tushiring; `/saudi` orqali aynan bot brauzerida login qiling. OTP/CAPTCHA operator tomonidan yakunlanishi mumkin.

Doimiy saqlangan sozlama: `agent/data/config.json`. `config.mjs`da o‘qish ustuvorligi bor: odatiy o‘qishda process environment → saqlangan JSON → `.env`; `preferSaved:true` bo‘lsa JSON → process environment → `.env`. `.env`ni o‘zgartirib, JSON yoki servis muhiti uni bosib ketmayotganini tekshiring. Kalitlarni logga chiqarmang.

Port 47831 — mahalliy sozlama; 47832 — brauzer skripti ko‘prigi. Bular uchun public GPT/Sites sayti kerak emas. Shu kompyuterda haqiqiy bot ishlayotgan bo‘lsa, test nusxasini boshqa kompyuterda yoki ajratilgan muhitda yoqing.

## Windows’ga o‘rnatish

`artifacts/evisa-operator-windows.zip`ni to‘liq ochib `Ornatish.cmd`ni boshlang. U `windows/Install.cmd`ni chaqiradi. `source/windows/README-UZ.md`da batafsil qadamlar bor.

O‘rnatuvchi Windows 11 x64, joriy foydalanuvchi akkaunti, Node 24, Python 3.12 va mavjud Edge’ga mo‘ljallangan. `%LOCALAPPDATA%\eVisa Operator` ichiga joylaydi, Desktop va login yorlig‘ini yaratadi. Mavjud `agent/data` ustiga qayta o‘rnatish bloklanadi. **Bu jonli Windows’da hali sinalmagan paket.** Windows boshlang‘ich konfiguratsiyasi Saudi to‘ldirishni yoqadi; ishlab chiqish sinovi uchun yuqoridagi qo‘lda o‘rnatish va `ENABLE_VISA_SUBMISSION=0`dan boshlang.

## Mavjud skriptni qayta yig‘ish

Tayyor `agent/evisa-operator.user.js` paketda bor. Uning manbalari `userscript-client.mjs` va `userscript-dom.mjs`.

```sh
npm ci --no-audit --no-fund
node scripts/build-userscript.mjs
```

Bu safar ildizdagi kutubxonalar ham o‘rnatiladi: build skripti `esbuild`ni import qiladi, u ildizdagi lock faylda transitiv bog‘liqlik sifatida bor. Kengaytma ishida bundlerni alohida bevosita devDependency sifatida belgilash yaxshi bo‘ladi. Hozirgi paketdagi qurilgan skriptni ishlatish uchun bundler kerak emas.

## Eski panel

`app/`, `components/`, `db/`, `drizzle/`, `lib/server.ts` va ildizdagi `package.json` eski veb panel manbalaridir. Faol Telegram bot ularga bog‘liq emas. Hisobga tegishli `.openai/hosting.json` bu topshirishga kiritilmadi. Eski panelni nashr qilish yoki uning eski akkauntini ulash ushbu topshirish vazifasi emas.
