#!/usr/bin/env bash
# One-command install/update on an Ubuntu/Debian VPS (run as root):
#   curl -fsSL https://raw.githubusercontent.com/Inforteuz/eviza-extension-with-telegram-bot/claude/affectionate-archimedes-yzozwx/deploy.sh -o deploy.sh
#   bash deploy.sh your.domain.uz            # the service owns the whole domain
#   bash deploy.sh your.domain.uz/evisa      # share a domain already served by nginx (path prefix)
# Values may be passed as environment variables instead of prompts:
#   TELEGRAM_BOT_TOKEN, ADMIN_IDS, GEMINI_API_KEY or OPENAI_API_KEY, CARD_NUMBER, CARD_HOLDER, PAYMENT_PROVIDER_TOKEN,
#   BRANCH, DIR, SERVER_PORT, PROXY (auto|caddy|nginx), REPLACE_NGINX_SITE=1
# Re-running the script updates the code and keeps server/.env and the database.
set -euo pipefail

REPO="https://github.com/Inforteuz/eviza-extension-with-telegram-bot.git"
BRANCH="${BRANCH:-claude/affectionate-archimedes-yzozwx}"
DIR="${DIR:-/opt/evisa}"
NGINX_DIR="${NGINX_DIR:-/etc/nginx}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/nginx-backup}"
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

# ---- Address: domain with an optional path prefix ----
TARGET="${1:-}"
if [ -z "$TARGET" ] && [ -f .env ]; then
  TARGET="$(grep -E '^DOMAIN=' .env | cut -d= -f2- || true)$(grep -E '^BASE_PATH=' .env | cut -d= -f2- || true)"
fi
[ -n "$TARGET" ] || TARGET="$(ask 'Domen (masalan evisa.example.uz yoki example.uz/evisa): ')"
TARGET="${TARGET#https://}"; TARGET="${TARGET#http://}"; TARGET="${TARGET%/}"
DOMAIN="${TARGET%%/*}"
BASE_PATH=""; [ "$TARGET" = "$DOMAIN" ] || BASE_PATH="/${TARGET#*/}"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "Domen noto'g'ri: $DOMAIN"
[ -z "$BASE_PATH" ] || [[ "$BASE_PATH" =~ ^/[A-Za-z0-9_-]+$ ]] || die "Yo'l noto'g'ri: $BASE_PATH (masalan /evisa)"
SERVER_IP="$(curl -fsS -4 https://api.ipify.org 2>/dev/null || true)"
DOMAIN_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [ -n "$SERVER_IP" ] && [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
  warn "$DOMAIN -> ${DOMAIN_IP:-topilmadi}, bu server esa $SERVER_IP. HTTPS sertifikati olinmaydi — DNS A yozuvini tekshiring."
fi

# ---- Telegram bot token ----
TOKEN="${TELEGRAM_BOT_TOKEN:-$(get_env TELEGRAM_BOT_TOKEN)}"
[ -n "$TOKEN" ] || TOKEN="$(ask 'Telegram bot tokeni (@BotFather): ' secret)"
ME="$(curl -fsS "https://api.telegram.org/bot$TOKEN/getMe")" || die "Bot tokeni ishlamadi yoki Telegram'ga ulanib bo'lmadi."
BOT_USERNAME="$(printf '%s' "$ME" | grep -o '"username":"[^"]*"' | head -n1 | cut -d'"' -f4)"
set_env TELEGRAM_BOT_TOKEN "$TOKEN"
say "Bot: @$BOT_USERNAME"

# ---- Administrator Telegram ID: taken from the latest private message to the bot ----
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

# ---- Passport text reader key (optional: without it only the portrait is cut) ----
# Gemini (AIza.../AQ...) or OpenAI (sk-...); the type is detected from the key itself.
if [ -n "${GEMINI_API_KEY:-}" ]; then set_env GEMINI_API_KEY "$GEMINI_API_KEY"; fi
if [ -n "${OPENAI_API_KEY:-}" ]; then set_env OPENAI_API_KEY "$OPENAI_API_KEY"; fi
if [ -z "$(get_env GEMINI_API_KEY)" ] && [ -z "$(get_env OPENAI_API_KEY)" ]; then
  KEY="$(ask "Gemini yoki OpenAI API kaliti (pasport matnini o'qish uchun; hozir bo'lmasa Enter): " secret)"
  case "$KEY" in
    "") ;;
    sk-*) set_env OPENAI_API_KEY "$KEY" ;;
    *) set_env GEMINI_API_KEY "$KEY" ;;
  esac
fi

# ---- Payment methods ----
if [ -n "${PAYMENT_PROVIDER_TOKEN:-}" ]; then set_env PAYMENT_PROVIDER_TOKEN "$PAYMENT_PROVIDER_TOKEN"; fi
if [ -n "${CARD_NUMBER:-}" ]; then set_env CARD_NUMBER "$CARD_NUMBER"; fi
if [ -n "${CARD_HOLDER:-}" ]; then set_env CARD_HOLDER "$CARD_HOLDER"; fi
if [ -z "$(get_env PAYMENT_PROVIDER_TOKEN)" ] && [ -z "$(get_env CARD_NUMBER)" ]; then
  CARD="$(ask "Balans to'ldirish uchun karta raqami (Click/Payme tokeni keyin qo'shiladi; hozir bo'lmasa Enter): ")"
  if [ -n "$CARD" ]; then set_env CARD_NUMBER "$CARD"; set_env CARD_HOLDER "$(ask 'Karta egasi (ism familiya): ')"; fi
fi

# ---- Reverse proxy: our own Caddy when 80/443 are free, otherwise the host's nginx ----
# Local port for the server container: explicit SERVER_PORT, else the one saved by an earlier run,
# else the first free port from 8787. Ports held by our own container (docker-proxy) count as free.
port_busy(){ ss -ltnp 2>/dev/null | awk -v p=":$1" '$4 ~ p"$"' | grep -v docker || true; }
SAVED_PORT="$(grep -E '^SERVER_PORT=' .env 2>/dev/null | cut -d= -f2- || true)"
if [ -n "${SERVER_PORT:-}" ]; then
  PORT_BUSY="$(port_busy "$SERVER_PORT")"
  [ -z "$PORT_BUSY" ] || die "$SERVER_PORT-port boshqa dastur tomonidan band:
$PORT_BUSY
Boshqa port tanlang yoki SERVER_PORT ni bermang (bo'sh port o'zi topiladi)."
else
  SERVER_PORT="${SAVED_PORT:-8787}"
  if [ -n "$(port_busy "$SERVER_PORT")" ]; then
    for candidate in $(seq 8787 8899); do
      if [ -z "$(port_busy "$candidate")" ]; then warn "$SERVER_PORT-port band, $candidate ishlatiladi."; SERVER_PORT="$candidate"; break; fi
    done
    [ -z "$(port_busy "$SERVER_PORT")" ] || die "8787–8899 oralig'ida bo'sh port topilmadi."
  fi
fi
BUSY="$(ss -ltnp 2>/dev/null | grep -E ':(80|443)\s' | grep -v docker || true)"
PROXY="${PROXY:-auto}"
if [ "$PROXY" = auto ]; then
  if [ -z "$BUSY" ]; then PROXY=caddy
  elif printf '%s' "$BUSY" | grep -q nginx; then PROXY=nginx
  else die "80/443 portlar band, lekin nginx emas:
$BUSY
Shu dasturni to'xtating yoki menga shu natijani yuboring."
  fi
fi
if [ "$PROXY" = caddy ] && [ -n "$BASE_PATH" ]; then
  warn "Domen to'liq shu xizmatga beriladi (Caddy), $BASE_PATH yo'li ishlatilmaydi."
  BASE_PATH=""
fi
PUBLIC_BASE="https://$DOMAIN$BASE_PATH"
printf 'DOMAIN=%s\nBASE_PATH=%s\nSERVER_PORT=%s\n' "$DOMAIN" "$BASE_PATH" "$SERVER_PORT" > .env
set_env EXTENSION_URL "$PUBLIC_BASE/download/evisa-auto-filler.zip"

say "Kengaytma arxivi (server manzili: $PUBLIC_BASE)"
docker run --rm -v "$DIR:/w" -w /w node:24-bookworm-slim node extension/scripts/pack.mjs --server "$PUBLIC_BASE"

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

# nginx location blocks for the service, under $1 (empty = domain root).
nginx_locations(){
  local prefix="$1"
  cat <<NGINX
    location ${prefix}/download/ {
        alias $DIR/extension/dist/;
    }
    location ${prefix}/ {
        proxy_pass http://127.0.0.1:$SERVER_PORT/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 12m;
        proxy_read_timeout 180s;
    }
NGINX
}
nginx_reload(){ systemctl reload nginx 2>/dev/null || nginx -s reload; }

if [ "$PROXY" = caddy ]; then
  say "Ishga tushirish: server + Caddy (HTTPS avtomatik)"
  docker compose --profile caddy up -d --build
else
  command -v nginx >/dev/null 2>&1 || die "80/443 da nginx ishlayapti, lekin 'nginx' buyrug'i topilmadi (ehtimol boshqa konteynerda). 'docker ps' va 'ss -ltnp' natijasini yuboring."
  OWN_SITE="$NGINX_DIR/conf.d/evisa-$DOMAIN.conf"
  [ -d "$NGINX_DIR/sites-enabled" ] && OWN_SITE="$NGINX_DIR/sites-available/evisa-$DOMAIN.conf"
  SNIPPET="$NGINX_DIR/snippets/evisa-$DOMAIN.conf"
  # Sites (other than ours) that already serve this domain, e.g. another app or a mail panel.
  OTHER="$(nginx -T 2>/dev/null | awk -v d="$DOMAIN" -v own="evisa-$DOMAIN.conf" '
    /^# configuration file /{file=$4; sub(/:$/,"",file); next}
    /^[[:space:]]*server_name[[:space:]]/{line=$0; gsub(/;/," ",line); n=split(line,names," "); for(i=2;i<=n;i++) if(names[i]==d && index(file,own)==0) print file}' | sort -u)"

  say "Ishga tushirish: server (127.0.0.1:$SERVER_PORT) + mavjud nginx"
  SHARE=""; [ -z "$OTHER" ] || [ -z "$BASE_PATH" ] || SHARE=1
  if [ -n "$SHARE" ]; then
    # Status codes of the existing site's own paths, compared again after the reload.
    # Taken before our container restarts, so the baseline is not affected by it.
    PROBE_PATHS="$( { echo /; for f in $OTHER; do grep -hoE '^[[:space:]]*location[[:space:]]+(=[[:space:]]*)?/[^[:space:]{]*' "$(readlink -f "$f")" || true; done; } | awk '{print $NF}' | grep -v "^$BASE_PATH" | sort -u | head -n 15 || true)"
    # A 5xx/000 answer is re-checked a few times: the other app may be restarting on its own.
    status_of(){ local code="" i; for i in 1 2 3 4; do code="$(curl -sk -o /dev/null -m 10 --resolve "$DOMAIN:443:127.0.0.1" -w '%{http_code}' "https://$DOMAIN$1" || true)"; case "$code" in 5*|000|"") sleep 3 ;; *) break ;; esac; done; printf '%s' "${code:-000}"; }
    probe(){ local p; for p in $PROBE_PATHS; do printf '%s=%s ' "$p" "$(status_of "$p")"; done; }
    # Only paths that worked before must answer the same; a path that was already down says nothing about our change.
    changed(){ local -a b a; local i; read -ra b <<<"$1"; read -ra a <<<"$2"; for i in "${!b[@]}"; do case "${b[$i]#*=}" in 5*|000) continue ;; esac; [ "${b[$i]}" = "${a[$i]:-}" ] || printf '%s->%s ' "${b[$i]}" "${a[$i]#*=}"; done; }
    already_down(){ local p; for p in $1; do case "${p#*=}" in 5*|000) printf '%s ' "$p" ;; esac; done; }
    BEFORE="$(probe)"
  fi
  docker compose --profile caddy rm -sf caddy >/dev/null 2>&1 || true
  docker compose up -d --build server
  BACKUP_DIR="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"

  if [ -n "$SHARE" ]; then
    # Share the existing site: add our locations through one include line, keep everything else.
    say "Mavjud saytga $BASE_PATH/ qo'shilmoqda: $OTHER"
    mkdir -p "$(dirname "$SNIPPET")" "$BACKUP_DIR"
    [ ! -f "$SNIPPET" ] || cp -p "$SNIPPET" "$BACKUP_DIR/snippet.conf"
    { echo "# Generated by eVisa deploy.sh — re-running the script rewrites this file."
      echo "location = $BASE_PATH { return 301 $BASE_PATH/; }"
      nginx_locations "$BASE_PATH" | sed 's/^    //'; } >"$SNIPPET"
    TARGET_FILE="";INSERTED=""
    for f in $OTHER; do if grep -qF "include $SNIPPET;" "$(readlink -f "$f")"; then TARGET_FILE="$(readlink -f "$f")"; fi; done
    if [ -z "$TARGET_FILE" ]; then
      for f in $OTHER; do
        real="$(readlink -f "$f")"; cp -p "$real" "$BACKUP_DIR/$(basename "$real")"
        # Insert the include after server_name in the HTTPS server block of this domain.
        if awk -v d="$DOMAIN" -v inc="    include $SNIPPET;" '
          function flush(   n,i,lines,done_here){ n=split(buf,lines,"\n"); for(i=1;i<n;i++){ print lines[i]; if(want && !done_here && lines[i] ~ /^[[:space:]]*server_name[[:space:]]/){ print inc; done_here=1 } } }
          { code=$0; sub(/#.*/,"",code) }
          depth==0 && code ~ /^[[:space:]]*server[[:space:]]*\{/ { inblock=1; buf="" }
          { if(inblock) buf=buf $0 "\n"; else print }
          { opens=gsub(/\{/,"{",code); closes=gsub(/\}/,"}",code); depth+=opens-closes }
          inblock && depth==0 {
            want=0; if(!inserted){ s=buf; gsub(/;/," ; ",s); if(s ~ ("server_name[^\n]*[[:space:]]" d "[[:space:]]") && s ~ /listen[^\n]*443/){ want=1; inserted=1 } }
            flush(); inblock=0; buf=""
          }
          END{ if(inblock) printf "%s", buf; exit inserted?0:3 }' "$real" >"$real.evisa-new"; then
          cat "$real.evisa-new" >"$real"; rm -f "$real.evisa-new"; TARGET_FILE="$real"; INSERTED=1; break
        fi
        rm -f "$real.evisa-new"
      done
      [ -n "$TARGET_FILE" ] || die "$DOMAIN uchun HTTPS (listen 443) server bloki topilmadi: $OTHER. Faylni menga yuboring."
    fi
    # Undo: restore the site file we edited, or the previous snippet when the include already existed.
    rollback(){
      if [ -n "$INSERTED" ]; then cp -p "$BACKUP_DIR/$(basename "$TARGET_FILE")" "$TARGET_FILE"; rm -f "$SNIPPET"
      elif [ -f "$BACKUP_DIR/snippet.conf" ]; then cp -p "$BACKUP_DIR/snippet.conf" "$SNIPPET"; fi
      if nginx -t >/dev/null 2>&1; then nginx_reload; fi
    }
    if ! nginx -t; then
      rollback
      die "nginx sozlamasi xato bo'ldi — eski holatga qaytarildi. Yuqoridagi xatoni yuboring."
    fi
    nginx_reload
    sleep 1
    AFTER="$(probe)"
    CHANGED="$(changed "$BEFORE" "$AFTER")"
    if [ -n "$CHANGED" ]; then
      rollback
      die "Mavjud saytning javoblari o'zgardi: $CHANGED(oldin: $BEFORE | keyin: $AFTER) — nginx eski holatga qaytarildi. Shu natijani menga yuboring."
    fi
    say "nginx: include $SNIPPET -> $TARGET_FILE${INSERTED:+ (eski nusxa: $BACKUP_DIR)}"
    say "Mavjud sayt tekshirildi, ishlab turgan yo'llar o'zgarmadi: $AFTER"
    DOWN="$(already_down "$BEFORE")"
    [ -z "$DOWN" ] || warn "Bu yo'llar o'zgarishdan OLDIN ham javob bermayotgan edi (bizga bog'liq emas): $DOWN— keyin: $AFTER"
  else
    if [ -n "$OTHER" ]; then
      [ "${REPLACE_NGINX_SITE:-}" = 1 ] || die "$DOMAIN nginx'da allaqachon boshqa saytga biriktirilgan: $OTHER
Variantlar:
  - o'sha domenda yo'l bilan birga ishlatish (boshqa sayt saqlanadi):  bash deploy.sh $DOMAIN/evisa
  - boshqa subdomen (DNS A yozuvi shu serverga):                       bash deploy.sh evisa.${DOMAIN#*.}
  - o'sha sayt kerak bo'lmasa, uni almashtirish:                       REPLACE_NGINX_SITE=1 bash deploy.sh $DOMAIN"
      # Replace only a site that serves nothing but this domain; keep a backup of it.
      mkdir -p "$BACKUP_DIR"
      for f in $OTHER; do
        [ -e "$f" ] || die "Topilmadi: $f"
        EXTRA="$(awk '/^[[:space:]]*server_name[[:space:]]/{gsub(/;/," "); for(i=2;i<=NF;i++) print $i}' "$f" | sort -u | grep -vxF "$DOMAIN" || true)"
        [ -z "$EXTRA" ] || die "$f boshqa domenlarga ham xizmat qiladi ($(echo "$EXTRA" | tr '\n' ' ')) — uni avtomatik o'chirmayman."
        cp -L "$f" "$BACKUP_DIR/$(basename "$f")"
        rm -f "$f"
        warn "O'chirildi: $f (nusxa: $BACKUP_DIR/$(basename "$f"))"
      done
    fi
    say "nginx sayti: $OWN_SITE"
    { echo "# Generated by eVisa deploy.sh — re-running the script rewrites this file."
      echo "server {"
      echo "    listen 80;"
      echo "    listen [::]:80;"
      echo "    server_name $DOMAIN;"
      [ -z "$BASE_PATH" ] || echo "    location = $BASE_PATH { return 301 $BASE_PATH/; }"
      nginx_locations "$BASE_PATH"
      echo "}"; } >"$OWN_SITE"
    if [ -d "$NGINX_DIR/sites-enabled" ]; then ln -sf "$OWN_SITE" "$NGINX_DIR/sites-enabled/evisa-$DOMAIN.conf"; fi
    nginx -t || { rm -f "$NGINX_DIR/sites-enabled/evisa-$DOMAIN.conf" "$OWN_SITE"; die "nginx sozlamasi xato (yuqoriga qarang)."; }
    nginx_reload

    say "HTTPS sertifikati (Let's Encrypt)"
    if ! command -v certbot >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx; fi
    if ! certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect --keep-until-expiring; then
      warn "Sertifikat olinmadi. DNS A yozuvi ($DOMAIN -> $SERVER_IP) va 80-port ochiqligini tekshiring, so'ng skriptni qayta ishga tushiring."
    fi
  fi
fi

say "Tekshiruv"
for _ in $(seq 1 30); do
  if docker compose exec -T server node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then OK=1; break; fi
  sleep 2
done
[ "${OK:-}" = 1 ] || { docker compose logs --tail=40 server; die "Server ishga tushmadi (yuqoridagi logga qarang)."; }
if CV_OUT="$(docker compose exec -T server sh -c '"$PYTHON_BIN" -c "import cv2, numpy; print(\"OpenCV\", cv2.__version__, \"NumPy\", numpy.__version__)"' 2>&1)"; then say "Rasm bilan ishlash: $CV_OUT"
else warn "Konteynerda OpenCV ishlamadi — pasport rasmlari qabul qilinmaydi. Xato:
$(printf '%s' "$CV_OUT" | tail -n 5)
Shu natijani yuboring."; fi
for _ in $(seq 1 30); do
  if curl -fsS -m 5 "$PUBLIC_BASE/health" >/dev/null 2>&1; then HTTPS=1; break; fi
  sleep 3
done

echo
echo "================================================================"
echo " Bot:          https://t.me/$BOT_USERNAME   (administrator: /admin)"
echo " Server:       $PUBLIC_BASE   $([ "${HTTPS:-}" = 1 ] && echo '(HTTPS ishlayapti)' || echo "(HTTPS hali tayyor emas; proxy: $PROXY)")"
echo " Kengaytma:    $PUBLIC_BASE/download/evisa-auto-filler.zip"
echo " Sozlamalar:   $DIR/server/.env  (o'zgartirgach: cd $DIR && docker compose up -d)"
echo " Loglar:       cd $DIR && docker compose logs -f server"
echo " Yangilash:    bash $DIR/deploy.sh"
echo "================================================================"
