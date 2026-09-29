#!/usr/bin/env bash
# One-command install/update on a fresh Ubuntu/Debian VPS (run as root):
#   curl -fsSL https://raw.githubusercontent.com/Inforteuz/eviza-extension-with-telegram-bot/claude/affectionate-archimedes-yzozwx/deploy.sh -o deploy.sh
#   bash deploy.sh your.domain.uz
# Values may be passed as environment variables instead of prompts:
#   TELEGRAM_BOT_TOKEN, ADMIN_IDS, OPENAI_API_KEY, CARD_NUMBER, CARD_HOLDER, PAYMENT_PROVIDER_TOKEN, BRANCH
# Re-running the script updates the code and keeps server/.env and the database.
set -euo pipefail

REPO="https://github.com/Inforteuz/eviza-extension-with-telegram-bot.git"
BRANCH="${BRANCH:-claude/affectionate-archimedes-yzozwx}"
DIR="${DIR:-/opt/evisa}"
say(){ printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn(){ printf '\n\033[1;33m[!]\033[0m %s\n' "$*"; }
die(){ printf '\n\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
ask(){ local prompt="$1" secret="${2:-}" value; if [ -n "$secret" ]; then read -rsp "$prompt" value </dev/tty; echo >&2; else read -rp "$prompt" value </dev/tty; fi; printf '%s' "$value"; }

[ "$(id -u)" = 0 ] || die "Skriptni root sifatida ishga tushiring."

say "Kerakli dasturlar"
if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | sh; fi
docker compose version >/dev/null 2>&1 || die "docker compose topilmadi."
command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }

say "Kod: $REPO ($BRANCH) -> $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

ENV_FILE=server/.env
[ -f "$ENV_FILE" ] || { cp server/.env.example "$ENV_FILE"; }
chmod 600 "$ENV_FILE"
get_env(){ grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true; }
set_env(){
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  if grep -qE "^$key=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' "$ENV_FILE" >"$tmp"
  else
    cat "$ENV_FILE" >"$tmp"; printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  cat "$tmp" >"$ENV_FILE"; rm -f "$tmp"
}

# Domain
DOMAIN="${1:-}"
[ -n "$DOMAIN" ] || DOMAIN="$(grep -E '^DOMAIN=' .env 2>/dev/null | cut -d= -f2- || true)"
[ -n "$DOMAIN" ] || DOMAIN="$(ask 'Domen (masalan evisa.example.uz): ')"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "Domen noto'g'ri: $DOMAIN"
printf 'DOMAIN=%s\n' "$DOMAIN" > .env
SERVER_IP="$(curl -fsS -4 https://api.ipify.org 2>/dev/null || true)"
DOMAIN_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [ -n "$SERVER_IP" ] && [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
  warn "$DOMAIN -> ${DOMAIN_IP:-topilmadi}, bu server esa $SERVER_IP. HTTPS sertifikati olinmaydi — DNS A yozuvini tekshiring."
fi

# Telegram bot token
TOKEN="${TELEGRAM_BOT_TOKEN:-$(get_env TELEGRAM_BOT_TOKEN)}"
[ -n "$TOKEN" ] || TOKEN="$(ask 'Telegram bot tokeni (@BotFather): ' secret)"
ME="$(curl -fsS "https://api.telegram.org/bot$TOKEN/getMe")" || die "Bot tokeni ishlamadi yoki Telegram'ga ulanib bo'lmadi."
BOT_USERNAME="$(printf '%s' "$ME" | grep -o '"username":"[^"]*"' | head -n1 | cut -d'"' -f4)"
set_env TELEGRAM_BOT_TOKEN "$TOKEN"
say "Bot: @$BOT_USERNAME"

# Administrator Telegram ID: taken from the latest private message to the bot.
ADMINS="${ADMIN_IDS:-$(get_env ADMIN_IDS)}"
if [ -z "$ADMINS" ]; then
  docker compose stop server >/dev/null 2>&1 || true
  curl -fsS "https://api.telegram.org/bot$TOKEN/deleteWebhook" >/dev/null || true
  echo; echo "Telegram'da @$BOT_USERNAME botiga /start yozing (administrator akkauntidan), so'ng shu yerda Enter bosing."
  read -r _ </dev/tty
  UPDATES="$(curl -fsS "https://api.telegram.org/bot$TOKEN/getUpdates")"
  ADMINS="$(printf '%s' "$UPDATES" | grep -o '"chat":{"id":[0-9]*,[^}]*"type":"private"' | tail -n1 | grep -o '"id":[0-9]*' | head -n1 | cut -d: -f2 || true)"
  if [ -n "$ADMINS" ]; then
    NAME="$(printf '%s' "$UPDATES" | grep -o "\"chat\":{\"id\":$ADMINS,\"first_name\":\"[^\"]*\"" | tail -n1 | cut -d'"' -f8 || true)"
    CONFIRM="$(ask "Administrator: $ADMINS ${NAME:+($NAME)}. To'g'rimi? [Y/n] ")"
    [[ "$CONFIRM" =~ ^[Nn] ]] && ADMINS=""
  fi
  [ -n "$ADMINS" ] || ADMINS="$(ask 'Administrator Telegram ID (raqam, @userinfobot): ')"
fi
[[ "$ADMINS" =~ ^[0-9]+([ ,]+[0-9]+)*$ ]] || die "ADMIN_IDS noto'g'ri: $ADMINS"
set_env ADMIN_IDS "$ADMINS"

# OpenAI key (optional: without it only the portrait is cut, text is typed manually)
if [ -n "${OPENAI_API_KEY:-}" ]; then set_env OPENAI_API_KEY "$OPENAI_API_KEY"; fi
if [ -z "$(get_env OPENAI_API_KEY)" ]; then
  KEY="$(ask "OpenAI API kaliti (pasportni o'qish uchun; hozir bo'lmasa Enter): " secret)"
  [ -z "$KEY" ] || set_env OPENAI_API_KEY "$KEY"
fi

# Payment methods
if [ -n "${PAYMENT_PROVIDER_TOKEN:-}" ]; then set_env PAYMENT_PROVIDER_TOKEN "$PAYMENT_PROVIDER_TOKEN"; fi
if [ -n "${CARD_NUMBER:-}" ]; then set_env CARD_NUMBER "$CARD_NUMBER"; fi
if [ -n "${CARD_HOLDER:-}" ]; then set_env CARD_HOLDER "$CARD_HOLDER"; fi
if [ -z "$(get_env PAYMENT_PROVIDER_TOKEN)" ] && [ -z "$(get_env CARD_NUMBER)" ]; then
  CARD="$(ask "Balans to'ldirish uchun karta raqami (Click/Payme tokeni keyin qo'shiladi; hozir bo'lmasa Enter): ")"
  if [ -n "$CARD" ]; then set_env CARD_NUMBER "$CARD"; set_env CARD_HOLDER "$(ask 'Karta egasi (ism familiya): ')"; fi
fi

set_env EXTENSION_URL "https://$DOMAIN/download/evisa-auto-filler.zip"

say "Kengaytma arxivi (server manzili ichiga yozilgan)"
docker run --rm -v "$DIR:/w" -w /w node:24-bookworm-slim node extension/scripts/pack.mjs --server "https://$DOMAIN"

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi
BUSY="$(ss -ltnp 2>/dev/null | grep -E ':(80|443)\s' | grep -v docker || true)"
[ -z "$BUSY" ] || warn "80/443 port boshqa dastur tomonidan band (masalan nginx yoki pochta paneli):
$BUSY
Uni to'xtating, aks holda HTTPS ishlamaydi."

say "Ishga tushirish (birinchi marta bir necha daqiqa oladi)"
docker compose up -d --build

say "Tekshiruv"
for _ in $(seq 1 30); do
  if docker compose exec -T server node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then OK=1; break; fi
  sleep 2
done
[ "${OK:-}" = 1 ] || { docker compose logs --tail=40 server; die "Server ishga tushmadi (yuqoridagi logga qarang)."; }
for _ in $(seq 1 30); do
  if curl -fsS -m 5 "https://$DOMAIN/health" >/dev/null 2>&1; then HTTPS=1; break; fi
  sleep 3
done

echo
echo "================================================================"
echo " Bot:          https://t.me/$BOT_USERNAME   (administrator: /admin)"
echo " Server:       https://$DOMAIN   $([ "${HTTPS:-}" = 1 ] && echo '(HTTPS ishlayapti)' || echo '(HTTPS hali tayyor emas: docker compose logs caddy)')"
echo " Kengaytma:    https://$DOMAIN/download/evisa-auto-filler.zip"
echo " Sozlamalar:   $DIR/server/.env  (o'zgartirgach: cd $DIR && docker compose up -d)"
echo " Loglar:       cd $DIR && docker compose logs -f server"
echo " Yangilash:    bash $DIR/deploy.sh"
echo "================================================================"
