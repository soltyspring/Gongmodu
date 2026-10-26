# BlueCL 공모두 API

기본 주소는 `https://bluecl.cloud/gongmodu`입니다. 공모두 전용 Node 24 프로세스는 `127.0.0.1:18824`에서 실행하고 기존 BlueCL HTTPS 서버에 `/gongmodu/api/` 경로만 추가합니다. 기존 홈페이지·다른 앱·DNS·방화벽·인증서는 변경하지 않습니다.

## 서버 배치

- 소스: `/home/solty/dev/gongmodu/releases/<release>`
- 현재 릴리스: `/home/solty/dev/gongmodu/current`
- Node 런타임: `/home/solty/dev/gongmodu/node`
- 서버 전용 환경: `/home/solty/dev/gongmodu/.env`, 소유자만 읽기
- 서비스: `systemctl --user status gongmodu.service`

Node 24 설치 및 `npm ci --omit=dev --ignore-scripts` 후 서비스를 시작합니다. API는 키가 없는 `api.env`에서 HOST·PORT·ALLOWED_ORIGINS·DART_SNAPSHOT_PATH만 읽습니다. 수집기만 기존 `.env`의 인증키를 읽습니다.

스냅샷은 `/home/solty/dev/gongmodu/data/dart-schedule.json`에 보관합니다. data 디렉터리는 700, 데이터와 환경 파일은 600으로 유지합니다. API 요청은 수집을 실행하지 않습니다.

`gongmodu-sync.service`와 `gongmodu-sync.timer`를 `~/.config/systemd/user/`에 설치한 뒤 `systemctl --user daemon-reload`, `systemctl --user enable --now gongmodu-sync.timer`로 활성화합니다. 한국 시간 0·6·12·18시에 수집하며 Persistent=true로 놓친 실행을 부팅 후 한 번 보충합니다. 동일 service와 flock으로 중복 실행을 방지합니다. 수집 실패 시 기존 데이터는 유지되고 다음 정기 실행을 기다립니다. 최초 설치 검증 시 한 번만 `systemctl --user start gongmodu-sync.service`를 실행할 수 있습니다.

운영 확인:

```sh
systemctl --user list-timers gongmodu-sync.timer
systemctl --user status gongmodu.service gongmodu-sync.service
journalctl --user -u gongmodu-sync.service -n 30 --no-pager
```

로그아웃 후에도 실행하려면 사용자의 Linger=yes가 필요합니다. 현재 solty 계정은 활성화되어 있습니다.

## HTTPS 최초 연결 — 운영자가 한 번 실행

`install-proxy.sh`의 고정 경로와 내용을 검토한 뒤 서버에서 실행합니다.

```sh
sudo bash /home/solty/dev/gongmodu/current/deploy/bluecl/install-proxy.sh
```

이 작업에는 nginx 설정 권한이 필요합니다. 일반 sudo 무암호 권한을 추가하지 않으며, 비밀번호를 수집하지 않습니다. 기존 설정은 `/var/backups/gongmodu/<UTC timestamp>/`에 보존합니다. `nginx -t`에 실패하면 변경 전 설정을 복구하며, 검사가 통과한 경우에만 nginx를 reload합니다.

## 확인

```sh
curl -f https://bluecl.cloud/gongmodu/api/health
curl -f https://bluecl.cloud/gongmodu/api/status
curl -f -H 'Origin: https://gongmodu.apps.tossmini.com' https://bluecl.cloud/gongmodu/api/schedule
```

저장 데이터가 전혀 없을 때만 `503 SCHEDULE_UNAVAILABLE`을 반환합니다. 정상 저장 파일이 있으면 수집 중에도 200을 반환합니다. 응답의 `events`, `fetchedAt`, `source` 및 CORS 응답을 확인합니다. HTTPS 연결 전의 내부 프로세스 실행만으로 배포 완료라고 표시하지 않습니다.

## 후속 업데이트·복구

새 릴리스에서 의존성을 설치하고 검증한 뒤 `current`를 교체하고 사용자 서비스를 재시작합니다. 이전 릴리스와 공시 스냅샷은 보관합니다. 문제가 생기면 이전 `current`로 되돌리고 `systemctl --user restart gongmodu.service`를 실행합니다. nginx 경로는 API 포트가 바뀌지 않으면 재설치할 필요가 없습니다.

프록시 복구가 필요하면 위 백업을 원래 경로로 복사한 뒤 `nginx -t`를 통과시킨 후 reload합니다. 다른 서비스가 후에 설정을 바꿨다면 백업 전체를 덮어쓰지 말고 공모두 include와 snippet만 검토해 복구합니다.
