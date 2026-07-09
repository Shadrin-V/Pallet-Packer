# ADR 010 — Интеграция @shadrin-v/engine в Lovable: приватный npm-пакет

Статус: Принято · Дата: 2026-07-09 · Итог спайка `LKWkalk-qrd.16` · Разрешает [ADR 008](008-lovable-engine-integration.md)

## Контекст

Прототип в Lovable (React) должен потреблять движок `@shadrin-v/engine`. Сценарий — **приватный**
пакет (не публиковать в public npm). [ADR 008](008-lovable-engine-integration.md) оставлял выбор
открытым: npm / vendoring / REST.

## Находки (спайк)

- Lovable подключает приватный **scoped** npm-пакет через scoped `.npmrc` + workspace build secret:
  ```
  @scope:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=${NPM_TOKEN}
  ```
  `NPM_TOKEN` — в Workspace settings → Build secrets. Поддерживаются GitHub Packages, self-hosted и
  Lovable-managed workspace registry.
- Требование: пакет должен быть scoped (`@scope/name`). `@shadrin-v/engine` — scoped. ✓
- Ограничение GitHub Packages: scope пакета обязан совпадать с владельцем (user/org) — для GitHub
  Packages имя должно быть `@shadrin-v/…`, не `@pallet/…`.
- Оговорка: в доке механизм описан для «design system» проектов-обёрток; для обычного
  Lovable-проекта как зависимости — подтвердить на практике (см. «Проверка»).
- Расчёт остаётся в браузере ([ADR 001](001-headless-ts-engine-in-browser.md)): пакет — чистая
  логика, бандлится клиентом. Приватность = контроль доступа к пакету, не секретность (бандл в
  браузере виден в любом случае).

## Решение

**Приватный scoped npm-пакет через GitHub Packages + Lovable build secret** (вариант 1).
Реестр — **GitHub Packages** (уже на GitHub). Он требует scope = владелец, поэтому пакеты
**ре-скоуплены `@pallet` → `@shadrin-v`** (`@shadrin-v/engine`, `@shadrin-v/i18n`) отдельным
коммитом. Lovable-managed workspace registry отклонён — не берём vendor-lock ради имени scope.
REST не нужен (браузерная модель ADR 001 подтверждена). **Vendoring** (копия собранного ESM в
Lovable) — запасной путь, если приватная авторизация окажется неудобной.

**Важно:** подключение из Lovable проверено **только по документации**. Практическая верификация —
критерий приёмки `LKWkalk-qrd.19`: опубликовать `0.0.1`-заглушку пораньше и вручную проверить
импорт в Lovable.

## Последствия

- [ADR 001](001-headless-ts-engine-in-browser.md) подтверждён; контракт `api-contract.md` 0.2.0
  остаётся браузерным.
- Ре-скоуп `@pallet` → `@shadrin-v` выполнен (пакеты, импорты, доки, контракт) отдельным коммитом.
- Конкретная публикация (`.npmrc`, build secret, GitHub Packages) — задача `LKWkalk-qrd.19`,
  блокирует `LKWkalk-qrd.13`; её приёмка включает ручную проверку импорта в Lovable.

## Проверка (на стороне пользователя, в Lovable)

1. Добавить в проект `.npmrc` со scoped-строками реестра + auth.
2. Положить токен в Workspace settings → Build secrets (`NPM_TOKEN`).
3. Установить пакет, вызвать `calculateLayout` из компонента — убедиться, что бандлится и работает.
   Если не выходит — fallback на vendoring.

## Источники
- Lovable Docs — Design systems (private/scoped npm, `.npmrc`, build secrets).
- GitHub Docs — Working with the npm registry (GitHub Packages, scope = owner).
