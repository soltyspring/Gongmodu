#!/bin/bash
# One-time, operator-run installation. No DNS, TLS or firewall changes.
set -euo pipefail
test "$(id -u)" -eq 0 || { echo 'Run this reviewed script with sudo.'; exit 1; }
site=/etc/nginx/sites-available/bluecl.cloud
snippet=/etc/nginx/snippets/gongmodu.conf
source=/home/solty/dev/gongmodu/current/deploy/bluecl/gongmodu.conf
test -f "$site" && test -f "$source"
backup="/var/backups/gongmodu/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup"
cp -a "$site" "$backup/bluecl.cloud"
if test -f "$snippet"; then cp -a "$snippet" "$backup/gongmodu.conf"; fi
install -o root -g root -m 644 "$source" "$snippet"
python3 - "$site" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]); s=p.read_text()
marker='    include /etc/nginx/snippets/aicap.conf;'
addition='    include /etc/nginx/snippets/gongmodu.conf;'
if addition not in s:
    if s.count(marker)!=1: raise SystemExit('Expected HTTPS include marker was not found uniquely.')
    p.write_text(s.replace(marker, marker+'\n'+addition))
PY
if ! nginx -t; then
    cp -a "$backup/bluecl.cloud" "$site"
    if test -f "$backup/gongmodu.conf"; then cp -a "$backup/gongmodu.conf" "$snippet"; else rm -f "$snippet"; fi
    echo "Validation failed; previous configuration restored. Backup: $backup"
    exit 1
fi
systemctl reload nginx
echo "Gongmodu HTTPS routing installed. Backup: $backup"
