# eVisa Operator — standalone Telegram bot

The bot targets the operator’s Windows computer (Windows 11 x64 installer prepared; live Windows verification pending). The current development installation runs on a Mac and processes one Saudi account serially, and stops at the official payment handoff. It does not need ChatGPT, Sites, a Mini App or a web panel.

## Windows delivery

The standalone installer is `windows/Install.cmd`; see `windows/README-UZ.md`. It downloads a checksum-verified Node.js 24 Windows runtime, installs Python/OpenCV and npm dependencies on the target, and creates a per-user desktop/login shortcut. Files live under `%LOCALAPPDATA%\eVisa Operator` with inheritable user/SYSTEM ACLs. It uses an interactive user session for the visible Edge browser and a named mutex to prevent duplicate supervisors. Initial configuration contains no account credentials or personal data.

The package is for Windows 11 x64. Windows 10/ARM need a separate compatibility decision. The Windows CI workflow is prepared but has not run. The installer and full workflow still need validation on the destination Windows computer. Stop the Mac bot before activating the same Telegram bot on Windows. Existing application data is a separate handoff, not included in the code package.

## Current installation

- `RUN_MODE=telegram`, `ENABLE_VISA_SUBMISSION=1`.
- Telegram intake, AI passport transcription, 200 × 200 portrait crop, editing, suggestions, queue, progress, history and payment links are active.
- The official personal, passport/travel, insurance, terms and review stages are implemented.
- One authorized application reached `/Visa/Review/<id>` on 15 September 2026. The bot compared 23 summary fields with the confirmed applicant and recorded `payment_ready`. Payment was not clicked.
- The latest group change passed 11 focused tests, including a three-member sequence, resume after the first review, uncertain-click protection and userscript payment guards. Daily throughput of 100 applications and OCR accuracy across varied passports have not been measured.
- Gmail is deferred. Saudi login, OTP and CAPTCHA may require the operator. A queued job waits up to 20 minutes for login in its dedicated browser, then continues.

## Operator flow

1. Send `/start` to the paired Telegram bot and upload a clear JPG/PNG passport.
2. Upload passports individually or as an album. The bot keeps reading them but presents one full card and its matching portrait at a time. Check the details and suggestions, then choose **Tasdiqlash — keyingisi** to see the next person. An incomplete card stays first until corrected or deleted. `/tasdiqlash` reopens the current card; the queue survives restart.
3. Data confirmation saves the review without starting Saudi submission, so review also works during a Saudi pause. Start an individual with **eVisaga tayyorlash** or use **Pasportlar tugadi — tayyorlash** after all group members are confirmed.
4. The bot fills and verifies the official forms, records the draft ID, accepts the authorized 95 SAR insurance coverage and the named terms checkbox, and advances to review.
5. It compares the final applicant details, purpose, hotel and dates before sending **To‘lovga tayyor** with the official payment link and displayed total.
6. The operator checks the final declaration, chooses the payment method and pays. The bot never presses `AGREE & COMPLETE PAYMENT` or enters card details.

Commands: `/tasdiqlash`, `/arizalar`, `/qidir NAME`, `/status`, `/safar`, `/saudi`, `/bekor`, `/guruhlar`, `/tozalash`.

`/saudi` opens the dedicated Edge window. It does not create an application on its own. Another browser or Telegram’s browser may need its own Saudi sign-in before opening a payment link.

## Defaults and extraction

New applications use Umrah, Hotel, Al Jabriy, arrival today in Tashkent time, and departure one calendar year minus one day later. Existing applicant values and custom trip settings are preserved. Postal code stays blank. Optional hotel city/address and Saudi contact fields remain blank when the official form allows it. The hotel name is retained as supplied; unrelated autocomplete locations are not selected.

OpenAI Responses API reads the passport image with a strict JSON schema. The default model is `gpt-4.1`; it can be changed in the local setup page. The Mac installation has a configured API key; a new Windows installation needs its own private setup. The live worker has no local OCR fallback. Printed passport labels supply names, nationality, birthplace and issue date. MRZ checks validate the passport number and dates; citizenship alone does not establish birthplace. Recognized Uzbek birthplace names map to Uzbekistan. An observed U2B OCR error is corrected only with independent printed Uzbekistan nationality and a matching issuing state.

Age-based marital status (women over 20, men over 22), None profession and birthplace-based residence appear as proposals until confirmed for that applicant. Exactly age 20/22 stays unspecified. Missing or uncertain fields are not submitted as invented facts.

Portrait extraction runs separately even if OCR fails. The bundled YuNet model locates the face and eye/nose/mouth landmarks at all four right-angle rotations, independently of the approximate GPT bounding boxes. Exactly one upright detection is required. The crop reserves space for hair, ears and chin, then fits the complete portrait inside 200 × 200 with white margins instead of stretching or cropping the head. Insufficient margins and ambiguous detections stop for review. Output is a JPEG of 5–100 KB. Recropping does not call OpenAI; it preserves the old portrait until a replacement succeeds. The model and MIT license ship in both desktop packages. Source: [OpenCV YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet).

`/tozalash` previews all local application/group counts and requires an operator-only, one-time confirmation valid for five minutes. Changed records invalidate consent; running work blocks deletion. Confirming deletes local applicants, files, groups and diagnostics through the existing deletion/tombstone cleanup. Saudi drafts, Telegram message history and account settings remain.

API references: [image input](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Group mode — integration testing

`/yangi` offers Individual or Group. Group asks for a name and stores successive photos in upload order; `/individual` switches back. `/guruhlar` opens groups, member cards and the AI re-read action. Each current member revision and portrait must be confirmed before the group queues. Individual and group jobs share a single account queue.

A two-member group reached payment readiness in the live Mac bot on 17 September 2026. It resumed from the first completed review, clicked the observed `Save & Add Applicant` button (`btnAddMoreToGroup`), entered the second applicant and verified both members. The displayed total was 804.42 SAR; payment was not clicked.

The adapter reuses the individual forms, records a checkpoint for each member, verifies its review, locates the unique Save & Add Applicant control (or supported Add Another Applicant/Person label), and stops before payment. Group completion requires matching name, member count, unique official application numbers, member proofs and all expected passports on the final page. Before adding a member, the adapter checks the preceding applicant ID, application number and current group count. It uses this transition only when another member remains; the final member stops at the payment handoff. Windows and userscript end-to-end verification remain pending. An unknown layout stops for review instead of being reported as ready.

## Connect AI

Open `http://127.0.0.1:47831/` on this Mac and use **Pasportni AI orqali o‘qish**. Enter the OpenAI API key and press **AI’ni ulash**. This checks authentication/model access without sending a passport. Then use `/guruhlar` → `test` → **AI’da qayta o‘qish**. Keys are never entered in Telegram, never returned by the local status endpoint, and never included in the source archive. The key can be updated without restarting the bot. The standalone service also serves this loopback settings page; it cannot start a second worker from that page.

## Runtime and persistence

The installed runtime is under `~/Library/Application Support/eVisa Operator`; `uz.evisa.operator` is the per-user LaunchAgent. Its `agent/data/` is authoritative. Workspace runtime data, if present, is an old migration snapshot. The Mac must be awake and logged in.

- `agent/index.mjs`: Telegram polling, serial job execution, leases, progress and result persistence.
- `agent/visa.mjs`: observed official form mapping and payment handoff verification.
- `agent/saudi-browser.mjs`: owns only the dedicated bot browser, recovers closed pages and coalesces simultaneous opens.
- `agent/local-store.mjs`: private SQLite records, files, revision checks and queue authorization.
- `agent/telegram-native.mjs`: operator-only messages, field editing and buttons.
- `agent/visa-diagnostics.mjs`: bounded diagnostics for the bot’s current official application; never reads other browser windows, cookies or profiles.

A draft checkpoint preserves the official application number and UUID. Incomplete personal entry may retry before Save. Once Save may have happened, uncertain work cannot create another application automatically. A saved draft resumes at its recorded stage. Expired leases require review rather than blind replay.

The worker loads an adapter revision once per job, so releasing `visa.mjs` fixes need not close the signed-in browser. Running jobs retain their loaded revision. Credentials, browser data, OCR text, diagnostic reports and application files are private and excluded from source archives.

## Setup and validation

The existing Mac installation is already paired. Do not reinstall or re-pair it for routine use.

For a separate installation: install Node 22.13+ and the dependencies in `agent/package.json`; install the Python dependencies in `agent/requirements.txt`, set `PYTHON_BIN`, and run `node agent/setup.mjs`. The loopback setup page handles credentials and connection checks. Standalone mode uses `RUN_MODE=telegram` and the paired Telegram token/operator ID. Enable visa processing only after reviewing the configured template and authorized coverage. Never run two processes against the same browser profile.

Gmail can later use OAuth or IMAP with an App Password. The OTP reader checks the configured sender, message time and replay state. Login sessions can expire; the in-app browser session is separate from the bot’s session.

```sh
node --test test/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Tests cover OCR checks, templates, operator authorization, stale buttons, serial leases, restart behavior, browser closure, datepicker and checkbox handling, Umrah/hotel mapping, insurance fee changes, terms, summary mismatches and stopping before payment.

## Previous panel

The repository retains the earlier Next/Sites panel and migration code for reference. It is inactive and is not used by the installed Telegram bot. No panel URL, Sites credentials or Mini App is required in standalone mode.

### Ko‘p pasport va takroriy suratlar

Telegram portretlari ism va ariza raqami bilan o‘z kartasiga javob sifatida yuboriladi. Albomdagi har bir surat alohida arizada saqlanadi. Bir xil yoki juda o‘xshash pasport tasviri tekshirish uchun to‘xtatiladi; xato ogohlantirishni operator “Bu boshqa pasport — o‘qish” orqali yechishi mumkin. Bu surat o‘xshashligini tekshiradi, shaxsni yuzidan tanimaydi. Matn va portretni ariza yuborishdan oldin operator tekshiradi.

Yo‘nalish tekshiruvi uchun qo‘shimcha test: `python3 test/detect_face_test.py`.

### Saudi 1015/429 cheklovi

Bu cheklovda bot eVisa navbatlarini to‘xtatadi, o‘zicha qayta urinmaydi. Pasportlarni yig‘ish va o‘qish davom etadi. Pauza qayta ishga tushganda saqlanadi. Biroz kuting; sayt yana ochilgach Telegramda `/saudi_davom` bilan pauzani yeching va kerakli ariza yoki guruhni kartasidan davom ettiring. Sayt qaytargan kutish muddatidan oldin davom etish bloklanadi.
