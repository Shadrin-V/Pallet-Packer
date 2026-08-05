# Деплой Ladungsplaner — рунбук (Coolify / Hetzner)

App: **Ladungsplaner** (эпик `LKWkalk-66g`, задача `LKWkalk-62x`). Домен-цель:
**`ladungsplaner.holz-schaefer.de`**. Сервер и правила — общий справочник владельца `INFRASTRUKTUR.md`
(Hetzner CX23, Coolify 4.1.2, Traefik, паттерн приложения `arminia`). Секретов этот файл НЕ содержит.

## 0. Что уже готово в репозитории (сделано в 62x)

- **Dockerfile** (Node 22, multi-stage): build engine+i18n+contracts+web → `npm prune --omit=dev` →
  тонкий Fastify runtime. Слушает **`PORT` (по умолчанию 3000)**, отдаёт SPA + `/api/*`.
  `HEALTHCHECK` бьёт `/api/health`. **Порт наружу не публикуется** — только через Traefik (правило §4/§8
  общего инфра-файла: не публиковать порты, вход только через Traefik по домену).
- **Данные**: SQLite в томе `/app/data` (`DB_PATH=/app/data/app.db`), `VOLUME ["/app/data"]`.
- **Бэкап-скрипт**: `apps/server/scripts/backup.sh` — host-скрипт по образцу `/root/backup-arminia.sh`
  (снапшот `.backup()` через `docker exec` + tar тома, ротация 14 дней). Развёрнут на сервере, см. §6.
- **Ветка автодеплоя**: `main` (continuous deployment, [ADR 023](adr/023-continuous-deploy-from-main.md)): мерж/пуш в `main` → webhook → build → live. Отдельного шага релиза нет; откат — redeploy предыдущего деплоя в панели Coolify.

## 1. Coolify Application (панель https://coolify.group-schaefer.de)

1. **New Resource → Application → Private Repository (Deploy Key).** Репозиторий:
   `Shadrin-V/Pallet-Packer` (private). Добавить **deploy key** Coolify в репозиторий (read-only).
2. **Branch**: `main`. Build Pack: **Dockerfile** (в корне репо).
3. **Ports**: **не публиковать** (no ports exposed). Coolify/Traefik маршрутизирует домен → контейнер
   на **3000** (внутренний). Если Coolify спрашивает «Ports Exposes» — указать `3000` (внутренний
   таргет для Traefik), но **не** «Ports Mappings» (это публикация на хост — не нужно).
4. **Resource limits (обязательно на общем сервере):** Memory **512 MB**, CPU **0.5**.
5. **Health check**: путь `/api/health` (или полагаться на Docker `HEALTHCHECK`).

## 2. Переменные окружения (Coolify → Environment Variables)

Не-секретные (обычные env):
```
PORT=3000
STATIC_DIR=/app/web
DB_PATH=/app/data/app.db
```
Секретные (пометить как **secret**) — **ERPNext, задать ПОЗЖЕ**, когда ERPNext переедет в облако и
появятся ключи; сейчас ERPNext в локальном тест-режиме, поэтому оставить **незаданными** — тогда
`/api/orders` корректно отвечает `503 ERR_ERPNEXT_UNCONFIGURED`, остальное приложение работает:
```
ERPNEXT_URL=          # напр. https://erp.group-schaefer.de
ERPNEXT_API_KEY=      # secret
ERPNEXT_API_SECRET=   # secret
```
> Секреты — только здесь, никогда в git.

## 3. Персистентное хранилище (Volume)

- Добавить **named volume**, mount path **`/app/data`** (совпадает с `DB_PATH`/`VOLUME`).
- Это единственное место с данными (SQLite). Пересборка/редеплой контейнера данные сохраняет.

## 4. Домен и TLS

1. **Cloudflare (зона `holz-schaefer.de`)**: A-запись `ladungsplaner` → **204.168.246.13**,
   **DNS only (серое облако)** — минимум до выдачи сертификата (правило §5 общего инфра-файла).
   > Домен приложения в зоне **holz-schaefer.de** (не group-schaefer.de); сервер и панель Coolify —
   > по-прежнему на инфраструктуре group-schaefer.de.
2. В Coolify задать домен приложения: **`https://ladungsplaner.holz-schaefer.de`** → Traefik выпустит
   Let's Encrypt автоматически.
3. После выдачи сертификата оранжевое облако допустимо только с SSL mode **Full (strict)**; проще
   оставить DNS only.

## 5. Аутентификация — настроена (`LKWkalk-i6b`, 2026-07-30)

> 🔓 **ВРЕМЕННО ОТКЛЮЧЕНА с 2026-08-03 по просьбе владельца (`LKWkalk-p7v`, задача открыта).**
> Middleware `ladungsplaner-auth` снят с https-роутера в панели Coolify; `gzip` оставлен. Прод сейчас
> **открыт всем в интернете** без авторизации, `curl` без `-u` отдаёт `200`. Сохранённый блок Labels
> (в нём bcrypt-хэш — восстановлению не подлежит, только замене) лежит у владельца; возврат = вставить
> его обратно в Configuration → Labels + Redeploy. Всё, что описано ниже, — конфигурация, к которой
> нужно вернуться, а НЕ текущее состояние прода.

Внутренний инструмент за приватным поддоменом. Включён **HTTP Basic Auth через Traefik**; полноценный
ERPNext-SSO — вариант A.

| Что | Значение |
|---|---|
| Как включено | **`custom_labels` приложения** через Coolify API (scoped-токен, отозван после) |
| Middleware | `ladungsplaner-auth` (basicauth), на https-роутере: `gzip,ladungsplaner-auth` — `gzip` сохранён |
| Логин | `Vladimir`; bcrypt-хэш — в `custom_labels`, пароль — только у владельца |
| HTTP-роутер | не тронут (`redirect-to-https` — весь HTTP уходит в HTTPS, auth на https-стороне) |

**Почему нельзя менять по SSH.** Лейблы контейнера под управлением Coolify (`coolify.managed=true`):
правка через `docker` затирается ближайшим редеплоем, а мерж в `main` = редеплой (ADR 023). Менять
только в **панели Coolify** (Configuration → Labels) или через **Coolify API** (`PATCH
/api/v1/applications/<uuid>`, поле `custom_labels`, base64 от переносов-строк). После правки нужен
Redeploy — лейблы применяются пересозданием контейнера.

Грабли, снятые с реального включения (2026-07-30, Coolify 4.1.2):

1. **Нативный флаг Basic Auth в этой версии декоративный**: API принимает
   `is_http_basic_auth_enabled`/`http_basic_auth_username`/`http_basic_auth_password`, поля
   сохраняются в БД, но генератор лейблов их игнорирует — auth не включается. Выключен обратно,
   чтобы не было второго «источника правды». Реальный механизм — только `custom_labels`.
2. **`$` в bcrypt-хэше НЕ удваивать.** Coolify сам экранирует `$`→`$$` при рендере `custom_labels`
   в compose. Если задать `$$` (классическая compose-грабля), в yaml окажется `$$$$`, в лейбле
   контейнера — `$$…`, и Traefik отдаёт 401 на верный пароль. В `custom_labels` кладётся **сырой**
   хэш; проверка: в лейбле работающего контейнера должно быть `$2y$…` с одинарными `$`.
3. `custom_labels` **замещает весь** сгенерированный набор лейблов — задавать полный список
   (снятый с рабочего compose: `/data/coolify/applications/<uuid>/docker-compose.yaml`), иначе
   снесётся маршрутизация/TLS. У scoped-токена без права `deploy` редеплой запускается кнопкой в панели.

Проверка (выполнена, все три пункта):
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://ladungsplaner.holz-schaefer.de/api/health          # 401
curl -s -o /dev/null -w '%{http_code}\n' -u Vladimir:wrong https://ladungsplaner.holz-schaefer.de/api/health  # 401
curl -s -u Vladimir:ПАРОЛЬ https://ladungsplaner.holz-schaefer.de/api/health   # {"status":"ok",…} 200
```
Docker `HEALTHCHECK` бьёт `127.0.0.1` внутри контейнера — Basic Auth его не ломает. Но smoke-проверки
из §7 и любые CDP-прогоны по проду теперь требуют `-u`.

Пароль хранится у владельца (менеджер паролей). Смена пароля: сгенерировать новый хэш
(`docker run --rm httpd:alpine htpasswd -nbB Vladimir 'НОВЫЙ'`), заменить значение
`…basicauth.users=` в Labels в панели, Redeploy.

## 6. Бэкап — настроен (`LKWkalk-zbi`, 2026-07-30)

Ночной бэкап тома `/app/data` — **отдельный host-скрипт**, а не дописка в `backup-arminia.sh`
(независимая ротация и лог; сломанный бэкап одного приложения не уносит второй).

| Что | Значение |
|---|---|
| Скрипт на хосте | `/root/backup-ladungsplaner.sh` (истина — `apps/server/scripts/backup.sh` в репо) |
| cron | `15 3 * * *` — сдвиг от арминии (03:00), чтобы два tar-а не шли одновременно |
| Лог | `/var/log/ladungsplaner-backup.log` |
| Архивы | `/root/backups/ladungsplaner-YYYY-MM-DD.tar.gz`, ротация 14 дней |
| Том | `z7rphypy5eytfwjr58iponfd-ladungsplaner-data` → `/app/data` |

Механика и почему именно так:
- **На хосте нет `sqlite3`** — консистентный снапшот берёт сам контейнер: `docker exec … node -e`
  с `better-sqlite3` (11.10.0), соединение **readonly** (прогон бэкапа не может изменить живые данные).
- **`.backup()` обязателен, а не «желателен»**: `app.db` — единицы КБ, основное содержимое лежит в
  `app.db-wal` (замерено: 4 КБ против 37 КБ). Tar сырых файлов дал бы почти пустую БД.
- Снапшот пишется в сам том (`/app/data/backup-daily.db`), поэтому попадает в tar; перезапись
  снапшота на повторном прогоне проверена.
- Имя контейнера несёт per-deploy суффикс — скрипт ищет его по `APP_UUID` через `docker ps`,
  том — через `docker inspect` с фолбэком на константу.

Проверено при настройке: два прогона подряд + прогон в урезанном окружении cron
(`env -i PATH=/usr/bin:/bin`) — `exit 0`; из архива извлечён `backup-daily.db`, читается,
`pragma integrity_check` → `ok`, все три таблицы (`vehicle`, `loading_plan`, `article`) на месте.

Регулярная проверка: `ls -lh /root/backups/` показывает свежий архив `ladungsplaner-*`.

## 7. Проверка после деплоя (smoke)

```bash
curl -s https://ladungsplaner.holz-schaefer.de/api/health          # {"status":"ok","contract":"0.17.0"}
curl -s https://ladungsplaner.holz-schaefer.de/                     # отдаёт SPA (title Ladungsplaner)
curl -s https://ladungsplaner.holz-schaefer.de/api/orders/SO-1      # 503 ERR_ERPNEXT_UNCONFIGURED (пока нет ключей)
```
Basic Auth включён (§5) — все запросы с `-u Vladimir:ПАРОЛЬ`, без кредов ожидаем `401`.
**С 2026-08-03 auth временно снят (`LKWkalk-p7v`)**: пока он снят, `-u` не нужен, а ожидаемый код —
`200`, не `401`. Вернётся auth — вернётся и `-u` в этих командах.

## 8. Что нужно от владельца (не автоматизируется из репо)

Требует доступов (Coolify panel / Cloudflare / GitHub deploy key / SSH для cron бэкапа):
1. ✅ Создать Coolify Application (шаг §1) + добавить deploy key в GitHub-репо — сделано.
2. ✅ Задать env (§2) и volume (§3) — сделано (`DB_PATH=/app/data/app.db`, том смонтирован).
3. ✅ Создать A-запись в Cloudflare (§4) и домен в Coolify — сделано, сайт живой по HTTPS.
4. ✅ Включить Basic Auth (§5) — сделано 2026-07-30 через Coolify API + Redeploy (`LKWkalk-i6b`).
5. ✅ Добавить том в ночной бэкап (§6) — сделано 2026-07-30 по SSH (`LKWkalk-zbi`).

Альтернатива автоматизации: выдать агенту **scoped Coolify API-токен** (создать под задачу, отозвать
после — §9 общего инфра-файла) + **Cloudflare API-токен** на зону — тогда шаги §1–§4 делаются через API.

## 9. Общий INFRASTRUKTUR.md — дописан (`LKWkalk-6zp`, 2026-07-30)

Общий справочник владельца — **`INFRASTRUKTUR.md`** («INFRASTRUKTUR — сервер group-schaefer.de»),
отдельный документ владельца вне этого репозитория; рабочая копия на машине разработчика —
`~/Downloads/INFRASTRUKTUR.md`. Правится по регламенту из самого файла («дать агенту этот файл вместе
с задачей»), после правки владелец возвращает его в своё хранилище.

> Не путать с репозиторием `IT Infrastruktur` и его `infrastructure.md` — это документация офисной
> сети Kamphausstraße 10, к серверу отношения не имеет и в контур этого проекта не входит.

Дописано:
- **§3 Контейнеры** — строка `ladungsplaner` (Node 22 / Fastify / better-sqlite3, порты наружу не
  публикуются, лимиты 512 MB / 0.5 CPU) + пересчитан свободный запас RAM.
- **§4 Сеть** — блок «Ограничение доступа на уровне приложения»: Basic Auth через `custom_labels`
  Traefik, три грабли (декоративный нативный флаг, `$` не удваивать, `custom_labels` замещает всё).
- **§5 DNS** — таблица получила колонку «Зона»; запись `ladungsplaner` → 204.168.246.13 (DNS only) и
  предупреждение, что она в зоне **holz-schaefer.de**, а не group-schaefer.de.
- **§6 Бэкапы** — том и ночной бэкап (cron 03:15, отдельный скрипт, ротация 14 д) + заметки о том,
  почему `.backup()` из контейнера обязателен.
- **§8 Правила** — ветка автодеплоя теперь per-app: `production` у тикет-системы, `main` у нас.
- **§9 Доступы** — репо `Shadrin-V/Pallet-Packer`, креды Basic Auth и процедура смены пароля.
- **§10 Диагностика** — smoke-команды по домену с `-u` и ожидаемый `401` без кредов.
