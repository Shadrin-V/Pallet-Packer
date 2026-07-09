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
- ADR 008 (предложено): интеграция `@pallet/engine` в Lovable — решается спайком `LKWkalk-qrd.16`.

### Планируется (эпик «Pallet Packer MVP»)
- `@pallet/engine`: домен, валидация, 2D shelf-упаковщик, вертикальный расчёт, метрики.
- `@pallet/i18n`: локали de/ru, форматирование единиц и чисел.
- Прототип UI в Lovable: выбор кузова, редактор заявки, вид сверху/сбоку, экспорт PDF/PNG/JSON.
- Справочники: пресеты + IndexedDB + JSON импорт/экспорт.
