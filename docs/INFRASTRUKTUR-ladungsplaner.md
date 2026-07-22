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
- **Бэкап-скрипт**: `apps/server/scripts/backup.sh` (`.backup` + tar, ротация 14 дней) — по образцу
  `/root/backup-arminia.sh`.
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

## 5. Аутентификация (MVP)

Внутренний инструмент за приватным поддоменом. MVP: **HTTP Basic Auth через Traefik** (Coolify →
Application → «Basic Auth» middleware, либо Traefik-лейблы `traefik.http.middlewares.*.basicauth.users`
с bcrypt-хэшем). Логин/пароль — в секретах Coolify, не в git. Полноценный ERPNext-SSO — в варианте A.
Допустимо стартовать без Basic Auth (по решению владельца), поддомен всё равно не публичен.

## 6. Бэкап

Данные в томе `/app/data`. Ночной бэкап — по паттерну `/root/backup-arminia.sh` (§6 общего инфра-файла):
консистентный `sqlite3 .backup` + tar тома, ротация 14 дней, в `/root/backups/`. Варианты:
- дописать том Ladungsplaner в существующий `/root/backup-arminia.sh`, **или**
- отдельный host-скрипт по образцу `apps/server/scripts/backup.sh` (в нём `sqlite3` берётся с хоста;
  путь к файлу БД — внутри named volume Docker, найти через `docker volume inspect`).
- Проверка после настройки: `ls -lh /root/backups/` показывает свежий архив Ladungsplaner.

## 7. Проверка после деплоя (smoke)

```bash
curl -s https://ladungsplaner.holz-schaefer.de/api/health          # {"status":"ok","contract":"0.9.0"}
curl -s https://ladungsplaner.holz-schaefer.de/                     # отдаёт SPA (title Ladungsplaner)
curl -s https://ladungsplaner.holz-schaefer.de/api/orders/SO-1      # 503 ERR_ERPNEXT_UNCONFIGURED (пока нет ключей)
```
(Если включён Basic Auth — с `-u user:pass`.)

## 8. Что нужно от владельца (не автоматизируется из репо)

Требует доступов (Coolify panel / Cloudflare / GitHub deploy key / SSH для cron бэкапа):
1. Создать Coolify Application (шаг §1) + добавить deploy key в GitHub-репо.
2. Задать env (§2) и volume (§3).
3. Создать A-запись в Cloudflare (§4) и домен в Coolify.
4. (Опц.) включить Basic Auth (§5).
5. Добавить том в ночной бэкап (§6).

Альтернатива автоматизации: выдать агенту **scoped Coolify API-токен** (создать под задачу, отозвать
после — §9 общего инфра-файла) + **Cloudflare API-токен** на зону — тогда шаги §1–§4 делаются через API.

## 9. Обновить общий INFRASTRUKTUR.md

После первого успешного деплоя дописать в общий справочник владельца:
- **§3 Контейнеры**: строка `ladungsplaner` (Node 22 / Fastify / better-sqlite3, лимиты 512MB/0.5CPU).
- **§5 DNS**: A-запись `ladungsplaner` → 204.168.246.13 (DNS only).
- **§6 Бэкапы**: том `/app/data` Ladungsplaner добавлен в ночной бэкап.
