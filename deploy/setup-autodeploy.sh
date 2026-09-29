#!/usr/bin/env bash
# One-time setup of GitHub Actions auto-deploy on the VPS (run as root, after deploy.sh):
#   curl -fsSL https://raw.githubusercontent.com/Inforteuz/eviza-extension-with-telegram-bot/claude/affectionate-archimedes-yzozwx/deploy/setup-autodeploy.sh -o setup-autodeploy.sh
#   bash setup-autodeploy.sh
# Creates the "evisa-deploy" user. Its SSH key can run nothing but /usr/local/sbin/evisa-update
# (no shell, no port forwarding). Prints the values for GitHub -> Settings -> Secrets -> Actions.
# Re-running it rotates the key: the previous one stops working.
set -euo pipefail
DIR="${DIR:-/opt/evisa}"
BRANCH="${BRANCH:-claude/affectionate-archimedes-yzozwx}"
DEPLOY_USER=evisa-deploy
say(){ printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn(){ printf '\n\033[1;33m[!]\033[0m %s\n' "$*"; }
die(){ printf '\n\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Skriptni root sifatida ishga tushiring."
[ -d "$DIR/.git" ] || die "$DIR topilmadi. Avval deploy.sh bilan o'rnating."
[ -n "$(grep -E '^ADMIN_IDS=.+' "$DIR/server/.env" 2>/dev/null || true)" ] || die "server/.env to'liq emas. Avval deploy.sh ni qo'lda ishga tushiring."
command -v sshd >/dev/null 2>&1 || die "OpenSSH server (sshd) topilmadi."

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

say "Yangilash buyrug'i: /usr/local/sbin/evisa-update"
git -C "$DIR" fetch -q origin "$BRANCH"
git -C "$DIR" show "origin/$BRANCH:deploy/evisa-update.sh" >"$TMP/evisa-update"
install -m 755 -o root -g root "$TMP/evisa-update" /usr/local/sbin/evisa-update
printf 'DIR=%q\nBRANCH=%q\n' "$DIR" "$BRANCH" >/etc/evisa-deploy.env; chmod 644 /etc/evisa-deploy.env

say "Foydalanuvchi: $DEPLOY_USER"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash -c "eVisa GitHub deploy" "$DEPLOY_USER"
# No password at all; "*" (unlike "!") still allows key login.
usermod -p '*' "$DEPLOY_USER"
HOME_DIR="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/evisa-update\n' "$DEPLOY_USER" >"$TMP/sudoers"
visudo -cf "$TMP/sudoers" >/dev/null || die "sudoers tekshiruvdan o'tmadi."
install -m 440 -o root -g root "$TMP/sudoers" /etc/sudoers.d/evisa-deploy

say "SSH kaliti (faqat yangilash buyrug'i uchun)"
ssh-keygen -q -t ed25519 -N '' -C "github-actions-evisa-deploy" -f "$TMP/key"
OPTS='restrict,command="sudo -n /usr/local/sbin/evisa-update \"$SSH_ORIGINAL_COMMAND\""'
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$HOME_DIR/.ssh"
printf '%s %s\n' "$OPTS" "$(cat "$TMP/key.pub")" >"$TMP/authorized_keys"
install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$TMP/authorized_keys" "$HOME_DIR/.ssh/authorized_keys"

SSHD="$(sshd -T 2>/dev/null || true)"
PORT="$(printf '%s\n' "$SSHD" | awk '$1=="port"{print $2; exit}')"; PORT="${PORT:-22}"
if printf '%s\n' "$SSHD" | grep -qiE '^pubkeyauthentication no'; then warn "sshd: PubkeyAuthentication o'chirilgan. /etc/ssh/sshd_config da yoqing."; fi
ALLOW="$(printf '%s\n' "$SSHD" | awk '$1=="allowusers"{$1="";print}')"
if [ -n "$ALLOW" ] && ! printf '%s\n' "$ALLOW" | grep -qw "$DEPLOY_USER"; then warn "sshd: AllowUsers ro'yxatida $DEPLOY_USER yo'q ($ALLOW). Uni qo'shing va 'systemctl reload ssh' qiling."; fi

say "Tekshiruv: kalit bilan kirish"
if OUT="$(ssh -i "$TMP/key" -p "$PORT" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 "$DEPLOY_USER@127.0.0.1" check 2>&1)" && printf '%s' "$OUT" | grep -q 'evisa-update: ok'; then
  echo "OK: kalit faqat evisa-update ni ishga tushiradi."
else
  warn "Mahalliy tekshiruv o'tmadi: $(printf '%s' "$OUT" | tail -n 3)"
fi
if OUT="$(ssh -i "$TMP/key" -p "$PORT" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 "$DEPLOY_USER@127.0.0.1" id 2>&1)" && printf '%s' "$OUT" | grep -q 'uid='; then
  die "Kalit boshqa buyruqni ham bajardi — cheklov ishlamayapti. Shu natijani yuboring."
fi

IP="$(curl -fsS -4 -m 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
HOSTSPEC="$IP"; [ "$PORT" = 22 ] || HOSTSPEC="[$IP]:$PORT"
KNOWN=""
for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
  [ -f "$f" ] && KNOWN="$KNOWN$HOSTSPEC $(cut -d' ' -f1,2 "$f")"$'\n'
done

cat <<EOF

================================================================================
 GitHub: repo -> Settings -> Secrets and variables -> Actions -> New repository secret
 Quyidagi har bir qiymatni alohida secret sifatida qo'shing (nomi — chapda).
================================================================================

DEPLOY_HOST
$IP

DEPLOY_KNOWN_HOSTS
$KNOWN
DEPLOY_SSH_KEY
$(cat "$TMP/key")
$( [ "$PORT" = 22 ] || printf '\nDEPLOY_PORT\n%s\n' "$PORT" )
================================================================================
 Maxfiy kalit serverdan o'chiriladi — uni faqat GitHub'ga joylang, boshqa joyga emas.
 Keyin: GitHub -> Actions -> CI -> "Run workflow" (yoki keyingi push) — server o'zi yangilanadi.
================================================================================
EOF
