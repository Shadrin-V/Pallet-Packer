# HANDOVER 2026-07-30 (сессия 3) — инфра: ночной бэкап (zbi) + Basic Auth (i6b), PR #66–#67

Сессия: `/start` → «по порядку» из очереди handover-2 → оба owner-side-бэда закрыты по SSH и
Coolify API (владелец дал SSH-разрешение и scoped-токен) → `/wrap`.

## Состояние

- **`main` = PR #67 смержен, прод обновлён и проверен**: после webhook-редеплоя `/api/health` →
  `{"status":"ok","contract":"0.14.0"}` **с кредами**; без кредов — `401`.
- **⚠️ ПРОД ЗА BASIC AUTH**: любая проверка (curl, CDP) теперь требует `-u Vladimir:<пароль>`
  (пароль у владельца). Без кредов всё отдаёт `401` — это норма, не поломка.
- **Гейты**: `typecheck` 0 · `lint` 0 · `npm test` **870/870** (код приложения не менялся).
- Закрыто: **`zbi`** (бэкап), **`i6b`** (Basic Auth). Создан: **`6zp`** (дописать ladungsplaner в
  общий INFRASTRUKTUR.md владельца — другой репозиторий).

## Что сделано и как

1. **`zbi` — ночной бэкап `/app/data`** (SQLite): host-скрипт `/root/backup-ladungsplaner.sh`
   (истина — `apps/server/scripts/backup.sh`), cron `15 3 * * *` (сдвиг от арминии 03:00), лог
   `/var/log/ladungsplaner-backup.log`, архивы `/root/backups/ladungsplaner-*.tar.gz`, ротация 14 д.
   Прежний скрипт в репо был нерабочим (звал `sqlite3` с хоста — его там нет); снапшот теперь берёт
   контейнер: `docker exec node` + `better-sqlite3` **readonly** `.backup()`.
2. **`i6b` — Basic Auth**: Traefik middleware `ladungsplaner-auth` через **`custom_labels`**
   приложения (Coolify API `PATCH /api/v1/applications/<uuid>`), https-роутер
   `gzip,ladungsplaner-auth` (gzip сохранён), HTTP-роутер (redirect) не тронут. Логин `Vladimir`.
   Auth пережил боевой webhook-редеплой после мержа #67 — `custom_labels` живут в БД Coolify.
3. Секреты передавались файлами `~/.coolify-token`, `~/.ladungsplaner-password`,
   `~/.ladungsplaner-basicauth` (не через чат) — владельцу сказано удалить их и **отозвать токен**.

## Грабли

1. **`.backup()` для этой БД обязателен**: `app.db` 4 КБ, содержимое в `app.db-wal` 37 КБ — tar
   сырых файлов тома даёт почти пустую БД.
2. **Нативный флаг Basic Auth в Coolify 4.1.2 декоративный**: API принимает
   `is_http_basic_auth_enabled`/`…_password`, поля сохраняются в БД, но генератор лейблов их
   игнорирует — auth не включается. Выключен обратно; реальный механизм — только `custom_labels`.
3. **`$` в bcrypt-хэше НЕ удваивать**: Coolify сам экранирует `$`→`$$` при рендере `custom_labels`
   в compose. Удвоение (классическая compose-грабля, была даже в нашем рунбуке из PR #66) даёт
   `$$$$` в yaml → `$$…` в лейбле → 401 на верный пароль. Проверка: в лейбле работающего контейнера
   `$2y$…` с одинарными `$`.
4. **`custom_labels` замещает ВЕСЬ сгенерированный набор лейблов** — задавать полный список (снять с
   `/data/coolify/applications/<uuid>/docker-compose.yaml`), иначе снесётся маршрутизация/TLS.
5. **Scoped-токен Coolify без права `deploy`** не может дёрнуть `/api/v1/deploy` (403) — редеплой
   кнопкой в панели. Лейблы применяются только пересозданием контейнера (Redeploy), не рестартом.
6. Классификатор разрешений сессии блокирует `gh pr merge` и часть write-запросов к Coolify API —
   мержил владелец; PATCH-скрипт запускал владелец из терминала
   (паттерн: скрипт в scratchpad → владелец запускает → агент проверяет результат).

## Что взять дальше

1. Фичи под брейншторм с владельцем (по порядку очереди): **`s17`** (deep-link `?order=SO-####`),
   **`p3p`** (автопоезд: несколько отсеков), эпик **`dwc`** (буфер стопок, P1).
2. **`6zp`** — дописать ladungsplaner в общий INFRASTRUKTUR.md владельца (другой репозиторий,
   `~/Documents/dev/IT Infrastruktur/`).
3. Визуальные из 41e (нужен настоящий Chrome + теперь `-u` для прода): `5tg`, `103`.
4. Гигиена: `tn9`, `y5j`, `e8x`, `dwc.5`, `bab`, `49c`, `wri` (P4).

## Локальный запуск и проверка

```bash
nvm use                                  # Node 22.x из .nvmrc
cd apps/web && npm run dev               # :5173
DB_PATH=/tmp/qa.db npm run dev -w apps/server   # :3000 (из корня)
```

Прод: `curl -s -u 'Vladimir:ПАРОЛЬ' https://ladungsplaner.holz-schaefer.de/api/health`.
CDP-прогоны по проду — добавлять заголовок `Authorization: Basic <base64>` либо URL-креды.
Бэкап проверять: `ssh root@204.168.246.13 'ls -lh /root/backups/'` — свежий `ladungsplaner-*`.
