# ADR 010 — Интеграция @pallet/engine в Lovable: приватный npm-пакет

Статус: Принято · Дата: 2026-07-09 · Итог спайка `LKWkalk-qrd.16` · Разрешает [ADR 008](008-lovable-engine-integration.md)

## Контекст

Прототип в Lovable (React) должен потреблять движок `@pallet/engine`. Сценарий — **приватный**
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
- Требование: пакет должен быть scoped (`@scope/name`). `@pallet/engine` — scoped. ✓
- Ограничение GitHub Packages: scope пакета обязан совпадать с владельцем (user/org) — для GitHub
  Packages имя должно быть `@shadrin-v/…`, не `@pallet/…`.
- Оговорка: в доке механизм описан для «design system» проектов-обёрток; для обычного
  Lovable-проекта как зависимости — подтвердить на практике (см. «Проверка»).
- Расчёт остаётся в браузере ([ADR 001](001-headless-ts-engine-in-browser.md)): пакет — чистая
  логика, бандлится клиентом. Приватность = контроль доступа к пакету, не секретность (бандл в
  браузере виден в любом случае).

## Решение

**Приватный scoped npm-пакет через реестр + Lovable build secret** (вариант 1). REST не нужен
(браузерная модель ADR 001 подтверждена). **Vendoring** (копия собранного ESM в Lovable) —
запасной путь, если приватная авторизация окажется неудобной.

Реестр (финал — после проверки в Lovable-воркспейсе):
- **GitHub Packages** (уже на GitHub) → требует scope = владелец → публиковать как `@shadrin-v/…`; ИЛИ
- **Lovable-managed workspace registry** / приватный npm → можно сохранить scope `@pallet`.

## Последствия

- [ADR 001](001-headless-ts-engine-in-browser.md) подтверждён; контракт `api-contract.md` 0.2.0
  остаётся браузерным.
- Конкретная публикация (реестр, `.npmrc`, build secret, возможный ре-скоуп `@pallet`→`@shadrin-v`)
  — отдельная задача, блокирует `LKWkalk-qrd.13`.

## Проверка (на стороне пользователя, в Lovable)

1. Добавить в проект `.npmrc` со scoped-строками реестра + auth.
2. Положить токен в Workspace settings → Build secrets (`NPM_TOKEN`).
3. Установить пакет, вызвать `calculateLayout` из компонента — убедиться, что бандлится и работает.
   Если не выходит — fallback на vendoring.

## Источники
- Lovable Docs — Design systems (private/scoped npm, `.npmrc`, build secrets).
- GitHub Docs — Working with the npm registry (GitHub Packages, scope = owner).
