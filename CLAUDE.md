# CLAUDE.md — Pallet Packer

## О проекте

**Pallet Packer** — программа для расчёта оптимальной загрузки грузового автомобиля поддонами и деталями (задача трёхмерной упаковки, 3D bin packing).

Ключевые сущности:
- **Транспортное средство** — грузовой отсек с внутренними размерами (длина × ширина × высота). Справочник типовых кузовов + пользовательские варианты.
- **Груз (деталь / поддон)** — тип груза с размерами (длина × ширина × высота) и количеством единиц. В одной загрузке допускаются грузы разных типов.
- **Правила размещения** для каждого типа груза:
  - `nesting` — вложение единиц друг в друга (с эффективным приростом высоты на каждую вложенную единицу);
  - `stacking` — штабелирование друг на друга (с лимитом ярусов / максимальной высотой штабеля);
  - `rotation` — запрещено / только вокруг вертикальной оси (обмен L↔W) / все 6 ориентаций.
- **Раскладка** — результат расчёта: координаты и ориентация каждой единицы, количество размещённого и неразмещённого, процент заполнения объёма, визуализация.

## Статус и источники истины

- Документация проекта живёт в `docs/` и всегда актуальна:
  - `docs/spec.md` — спецификация (что делает система);
  - `docs/design.md` — дизайн-документ (как устроена);
  - `docs/api-contract.md` — контракт API движка (граница между ядром, UI и будущим MCP);
  - `docs/adr/NNN-*.md` — реестр архитектурных решений, по файлу на решение (контекст → решение → последствия);
  - `docs/CHANGELOG.md` — журнал изменений по версиям.
- **Правило «сначала документация»:** изменилось требование или API — сначала обнови spec/contract/ADR, затем код.
- Задачи, зависимости и память проекта: **beads** (`bd`). Реестр задач — только в beads; TODO в markdown и комментариях кода запрещены.
- Исходная постановка задачи: `docs/zadacha-dlya-agenta-pallet-packer.md`.
- Проект развивается итеративно: каждая итерация = эпик в beads + запись в CHANGELOG.

## Обязательный воркфлоу

Проект ведётся по методологии **Superpowers** с трекером **Beads**.

### Порядок фаз (не перескакивай)

1. **Brainstorming** — навык `brainstorming` из Superpowers. Сократический диалог с пользователем: вопросы по одному, альтернативы, проверка предположений. Все пункты из раздела «Открытые вопросы» постановки должны получить зафиксированные ответы. Решения по ним принимает пользователь, не ты.
2. **Спецификация** — дизайн-документ и spec в `docs/`, утверждаются пользователем по разделам.
3. **Планирование** — навык `writing-plans`; декомпозиция в beads: эпик → задачи с зависимостями.
4. **Реализация** — только после явной команды пользователя. TDD: сначала падающий тест, затем код.

**Пока фазы 1–3 не завершены и пользователь не дал команду — код не писать.**

### Правила работы с beads

- В начале каждой сессии: `bd ready` — посмотреть доступные задачи; `bd show <id>` перед началом работы.
- Новая работа обнаружилась по ходу — сразу `bd create` (не держи в голове и не пиши в TODO-комментарии), связывай зависимостью `bd dep add`.
- Начал задачу — `bd update <id> --status in_progress`; закончил — закрой с комментарием о результате.
- Архитектурные и продуктовые решения фиксируй через `bd remember`, чтобы они переживали сессии.
- В конце сессии: краткое резюме + актуальный `bd ready`.

### Правила из Superpowers, критичные для этого проекта

- Используй подходящий навык, если он существует; не изобретай процесс заново.
- Для нетривиальной реализации — `subagent-driven-development`: подзадачи выполняют сабагенты, ты координируешь.
- Отладка — через навык `systematic-debugging`: сначала гипотеза и воспроизведение, потом правка.
- Коммиты — маленькие, атомарные, после зелёных тестов.

## Архитектурные принципы (не нарушать)

1. **Headless-ядро.** Движок упаковки — самостоятельный пакет без зависимостей от UI. Вход и выход — чистый JSON по контракту из `docs/api-contract.md`. Вся доменная логика (валидация, упаковка, метрики) — только в ядре, никогда в UI.
2. **UI — заменяемый слой.** ⚠️ **Пивот (2026-07-14, [ADR 015](docs/adr/015-fullstack-app-erpnext.md)):** Lovable отвергнут; UI строится в этом же репо как **`apps/web`** (Vite React SPA) + `apps/server` (Fastify+SQLite), полноценное приложение с интеграцией **ERPNext** (вариант B→A). Движок (`packages/engine`) и локали (`packages/i18n`) — переиспользуются; SPA ходит за данными только через интерфейс `DataProvider`. Дизайн-цель — `docs/lovable/*-reference.html` + `design-system.md`. Правки логики — по-прежнему только в ядре. Ломающее изменение контракта API требует ADR и обновления `docs/api-contract.md` до реализации.
3. **i18n с первого коммита.** Ни одной пользовательской строки в коде — только ключи локалей. Стартовые локали: `ru`, `en`; структура словарей должна позволять добавление языков без изменений кода. Локализуются также единицы измерения, форматы чисел и тексты отчётов. Сообщения об ошибках движка возвращаются кодами, перевод — на стороне UI.
4. **MCP-готовность.** API движка проектируется так, чтобы позже обернуться в MCP-сервер без рефакторинга ядра: операции = будущие инструменты (`list_vehicles`, `add_cargo`, `calculate_layout`, `get_layout_report`), входы/выходы описываются JSON-схемами уже сейчас. Реализация MCP-сервера — отдельный будущий эпик в beads, в MVP не входит.

## Технические договорённости

> Зафиксированы по итогам брейншторма (фаза 1). Полные обоснования — в `docs/adr/`.

- Язык/стек: **TypeScript**, изоморфный npm-пакет `@shadrin-v/engine` (без DOM/Node); UI — Lovable/React.
- Единицы измерения: внутренне — **целые миллиметры**; конвертация только на границе UI ([ADR 002](docs/adr/002-integer-millimeters.md)).
- Учёт веса: **вне MVP** (опц. поля в контракте есть, логика не реализуется).
- Алгоритм упаковки: **2.5D** — 2D shelf-упаковка по полу + вертикальный расчёт вложения; за интерфейсом `Packer` ([ADR 003](docs/adr/003-2p5d-computation-model.md), [ADR 004](docs/adr/004-packer-interface-shelf-heuristic.md)).
- Основной режим: **«Размести заявку»** (список типов + количества), `fill` покрывает «сколько влезет» ([ADR 005](docs/adr/005-order-fulfillment-mode.md)).
- Состояние: **Verschachtelt/Entschachtelt** на уровне типа поддона.
- Хранение справочников: **пресеты + IndexedDB браузера** + JSON импорт/экспорт ([ADR 007](docs/adr/007-browser-local-storage.md)).
- Визуализация: **вид сверху + вид сбоку**; экспорт PDF/PNG/JSON.
- i18n: локали **de, ru** (en — позже); движок возвращает коды ошибок ([ADR 006](docs/adr/006-i18n-de-ru-error-codes.md)).
- Где выполняется расчёт: **в браузере** (движок-пакет вызывается из Lovable); REST/MCP — поверх того же ядра позже ([ADR 001](docs/adr/001-headless-ts-engine-in-browser.md)).

## Доменные инварианты (соблюдать всегда)

- Ни одна единица груза не выходит за пределы кузова и не пересекается с другой.
- Правила `nesting` / `stacking` / `rotation` конкретного типа груза не нарушаются никогда, даже ради лучшего заполнения.
- Вложенная стопка (nested stack) занимает высоту: `H_базовой + (n − 1) × прирост`, а не `n × H`.
- Ориентация груза — одна из разрешённых для его типа; при запрете вращения используется исходная ориентация.
- Результат расчёта детерминирован при одинаковом вводе (фиксируй seed, если алгоритм стохастический).

## Тестирование

- Обязательные тесты движка упаковки:
  - тривиальные случаи с известным точным ответом (например, кузов 2×2×2, груз 1×1×1 → ровно 8);
  - проверка отсутствия пересечений и выхода за габариты на каждом результате (property-based, если стек позволяет);
  - кейсы на каждое правило: nesting, лимит ярусов, каждый режим rotation;
  - смешанные типы грузов; кейс «ничего не помещается».
- Раскладка проверяется валидатором геометрии, а не сравнением с эталонной картинкой.

## Стиль общения

- Отвечай пользователю по-русски; код, идентификаторы и коммиты — по-английски.
- Не принимай продуктовые решения молча — фиксируй как вопрос пользователю или `bd create` с меткой `question`.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
