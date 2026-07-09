# Onboarding — поднять окружение Pallet Packer с нуля

Проверяемый чеклист для новой машины. Архитектура — [design.md](design.md); задачи — beads.

## 0. Версии (проверено на рабочей машине 2026-07-09)
- Node **v24.16.0** (24.x), npm **11.13.0**, git **2.50.1**
- beads (bd) **1.1.0** (Homebrew); gh (GitHub CLI); Homebrew

## 1. Инструменты
```bash
# Node 24.x (nvm или офиц. установщик), git, gh — установить отдельно
brew install beads          # bd 1.1.0
```

## 2. Клон + зависимости
```bash
gh auth login               # аккаунт Shadrin-V (нужен для push и beads-синка)
git clone https://github.com/Shadrin-V/Pallet-Packer.git
cd Pallet-Packer
npm install                 # npm workspaces: @shadrin-v/engine, @shadrin-v/i18n
```

## 3. Smoke-check кода
```bash
npm test                    # ОЖИДАНИЕ на main: 39/39 passed
npm run typecheck           # 0 ошибок
npm run build               # ESM ×2 пакета
```

## 4. Восстановление реестра beads (ПРОВЕРЕНО фактически)
```bash
bd bootstrap                # клонирует Dolt из git-remote (refs/dolt/data) и подключает origin
bd ready                    # ОЖИДАНИЕ: видны задачи (qrd.4/9/11/16 … по состоянию)
bd prime                    # контекст воркфлоу beads
```
- Живая БД `.beads/embeddeddolt/` **НЕ в git**; источник восстановления — Dolt remote + `.beads/issues.jsonl`.
- `bd import` в одиночку **НЕ работает** на чистом клоне (нет issue-prefix) — используйте `bd bootstrap`.

## 5. Claude Code + Superpowers
```
/plugin install superpowers@claude-plugins-official
```
beads-интеграция уже в репозитории (CLAUDE.md + `.claude/settings.json`); после установки перезапустить Claude Code.

## 6. На будущее — qrd.19 (публикация @shadrin-v/engine в GitHub Packages)
Понадобится **локальный** `.npmrc` с токеном GitHub Packages:
```
@shadrin-v:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```
**`.npmrc` В GIT НЕ КОММИТИТЬ** — уже в `.gitignore`. Токен — через env/секрет, не в репозитории.

## Состояние на момент переезда
- **main**: закрыты qrd.1, 2, 3, 5, 9, 16. Движок: модель, валидация, вертикаль (pairwise), валидатор геометрии. Код контракта — 0.2.0.
- **wip/qrd-4**: WIP floor-упаковщик (старая эвристика, EUR=33). **ТРЕБУЕТ ПЕРЕПИСЫВАНИЯ** ([ADR-011](adr/011-order-grouping.md)): ориентация по макс-влезанию (EUR→34), гетерогенный shelf/skyline, зоны по `orderId`, `CargoType.orderId` в модель, бамп контракта 0.3.0. Ревью перед merge в main — в силе.
- **Docs впереди кода**: контракт в доках 0.3.0, в коде 0.2.0 (подтянется при переписывании qrd.4).
