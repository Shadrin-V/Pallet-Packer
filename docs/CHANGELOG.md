# Changelog

Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/);
версионирование — [SemVer](https://semver.org/lang/ru/).

## [Unreleased]

### Added
- Фаза 1 (brainstorming) завершена: зафиксированы объём и архитектура MVP.
- Документация: `spec.md`, `design.md`, `api-contract.md`, ADR 001–008.
- Контракт API движка версии `0.1.0` (черновик, до реализации).
- Пресеты (реальные данные): LKW 13600×2430×2650; Европоддоны EPAL 1/2/3/6 + Viertel
  (см. spec.md, Приложение A). Параметры вложения — PLACEHOLDER (`LKWkalk-qrd.17`).
- ADR 008 (предложено): интеграция `@shadrin-v/engine` в Lovable — решается спайком `LKWkalk-qrd.16`.
- ADR 009 + контракт **0.2.0**: модель вложения **pairwise** (парами) — поля `nestingMode`,
  `allowUnpairedTop`, переинтерпретация `stepHeight` как h_д. Аддитивно; `sequential` по умолчанию.
- `docs/qrd-17-preset-data.md` — точка сбора реальных данных каркасов (h_д для pairwise).
- ADR 010 (итог спайка qrd.16): интеграция в Lovable — приватный scoped npm-пакет через `.npmrc`
  + build secret; ADR 008 разрешён. Браузерная модель (ADR 001) подтверждена.
- Ре-скоуп пакетов `@pallet` → `@shadrin-v` (GitHub Packages, ADR 010).
- ADR 011 + контракт **0.3.0**: группировка по заказам (`CargoType.orderId`); смешанные загрузки —
  частый кейс; ориентация упаковки — по макс-влезанию (EUR → 34). LIFO-очередность точек — вне MVP.
- `docs/onboarding.md` — чеклист поднятия окружения с нуля; восстановление реестра beads — проверенная
  команда `bd bootstrap`. `.npmrc` добавлен в `.gitignore` (для qrd.19, не коммитить).

### Планируется (эпик «Pallet Packer MVP»)
- `@shadrin-v/engine`: домен, валидация, 2D shelf-упаковщик, вертикальный расчёт, метрики.
- `@shadrin-v/i18n`: локали de/ru, форматирование единиц и чисел.
- Прототип UI в Lovable: выбор кузова, редактор заявки, вид сверху/сбоку, экспорт PDF/PNG/JSON.
- Справочники: пресеты + IndexedDB + JSON импорт/экспорт.
