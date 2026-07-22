# Continuous Deployment из `main` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрепить релиз как часть процесса: прод собирается Coolify с ветки `main`, ветка `production` ретайрится, зелёный CI-гейт защищает `main` перед мержем.

**Architecture:** Три части. (1) CI-workflow на GitHub Actions проверяет `main` и PR в него (typecheck/lint/test/build). (2) Документация фиксирует переход на continuous deployment из `main` (новый ADR-023 + правки рунбука и активных доков). (3) Owner-side cutover после мержа PR: переключение ветки в панели Coolify и удаление ветки `production`. Всё, кроме owner-side шагов, собирается в **один PR** (по решению владельца).

**Tech Stack:** GitHub Actions (Node 22), npm workspaces monorepo, Coolify/Hetzner, `gh` CLI.

## Global Constraints

- **Node 22** в CI — совпадает с Dockerfile.
- Все правки, кроме owner-side cutover, идут в **одну ветку** `fix/7jg-continuous-deploy` и **один PR** в `main`. Отдельных коммитов прямо в `main` нет.
- Коммиты внутри ветки — маленькие и атомарные, но PR один.
- Инвариант, фиксируемый решением: **`main` всегда прод-готов; шаг релиза = мерж в `main` (CI зелёный) + проверка live**.
- Исторические `docs/superpowers/HANDOVER-*.md` — дневниковые снимки, **не трогать**.
- Owner-side шаги (панель Coolify) выполняет владелец; агент их только документирует и проверяет результат.

## File Structure

- **Create** `.github/workflows/ci.yml` — CI-гейт (единственный workflow; одна job `ci`).
- **Create** `docs/adr/023-continuous-deploy-from-main.md` — запись решения.
- **Modify** `docs/INFRASTRUKTUR-ladungsplaner.md` — §0 (ветка автодеплоя), §1.2 (Branch).
- **Modify** `docs/adr/015-fullstack-app-erpnext.md` — пометка о замене в части ветки деплоя.
- **Modify** `docs/superpowers/START-PROMPT.md` — убрать инструкции push `production`.
- **Modify** `CLAUDE.md` (проектный) — раздел про деплой/релиз + заметка в Session Completion.
- **Modify** `docs/CHANGELOG.md` — запись.

---

### Task 1: CI-workflow (`.github/workflows/ci.yml`)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: GitHub-статус-чек с контекстом **`ci`** (имя job). Task 3 (branch protection) требует именно этот контекст.

- [ ] **Step 1: Создать ветку**

```bash
git checkout main && git pull --ff-only
git checkout -b fix/7jg-continuous-deploy
```

- [ ] **Step 2: Убедиться, что гейты зелёные на текущем `main` (иначе CI будет красным по реальной причине, а не из-за workflow)**

Run:
```bash
npm ci
npm run build
npm run typecheck
npm run lint
npm test
```
Expected: все пять команд завершаются кодом 0; `npm test` — «574 passed» (или больше). Если что-то падает — это существующий баг, а не задача этого плана: остановиться и завести отдельный bead, не встраивать красный гейт.

- [ ] **Step 3: Написать workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: ci

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
```

Порядок шагов важен: `build` первым, чтобы `dist` пакетов `engine`/`i18n` существовал для typecheck/test (web/server импортируют dist; см. `docs/superpowers/START-PROMPT.md`). Job названа `ci` — её имя становится контекстом статус-чека для Task 3.

- [ ] **Step 4: Провалидировать YAML локально**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
```
Expected: `yaml ok` (нет ошибок парсинга).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions gate (typecheck/lint/test/build) for main and PRs"
```

---

### Task 2: Документация решения

**Files:**
- Create: `docs/adr/023-continuous-deploy-from-main.md`
- Modify: `docs/INFRASTRUKTUR-ladungsplaner.md` (строка «Ветка автодеплоя» в §0; пункт 2 «Branch» в §1)
- Modify: `docs/adr/015-fullstack-app-erpnext.md` (строка про Coolify «ветка `production`»)
- Modify: `docs/superpowers/START-PROMPT.md` (строки про `production`)
- Modify: `CLAUDE.md` (проектный)
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: контекст-чек `ci` из Task 1 (упоминается в ADR/CLAUDE.md как гейт).
- Produces: ничего кода; grep-проверяемые факты для приёмки.

- [ ] **Step 1: Создать ADR-023**

Create `docs/adr/023-continuous-deploy-from-main.md`:
```markdown
# ADR 023: Continuous deployment из ветки `main`

- **Статус:** принято (2026-07-22)
- **Bead:** LKWkalk-7jg
- **Заменяет (частично):** [ADR 015](015-fullstack-app-erpnext.md) — в части ветки деплоя.

## Контекст

Прод собирался Coolify с ветки `production`, а вся работа мержилась в `main`. Шаг
«синхронизировать `production`» нигде не был описан как часть процесса, поэтому расхождение
копилось молча: к 2026-07-21 `production` отставал от `main` на 77 коммитов — три сессии
работы, невидимой на проде. Это системная причина (пропущенный шаг процесса), а не разовая
оплошность.

## Решение

Перейти на continuous deployment из `main`:

1. Coolify собирает ветку **`main`** (не `production`).
2. Ветка `production` **ретайрится** (удаляется). Ветки, которую можно забыть
   синхронизировать, больше нет.
3. Инвариант: **`main` всегда прод-готов**; «шаг релиза» = мерж в `main` + проверка live.
   Отдельного шага релиза не существует.
4. Гейт качества — **CI на GitHub Actions** (`.github/workflows/ci.yml`, job `ci`:
   typecheck/lint/test/build), обязательный для мержа в `main` (branch protection).

Развилки, зафиксированные владельцем: релиз — автоматически после каждого мержа (не по
команде, не полу-авто через PR); docs-only мержи тоже пересобирают прод (принято ради
простоты — ноль path-фильтров и деплой-Actions).

## Последствия

- **+** Расхождение прод/`main` исключено by design — нет ветки, которую можно забыть.
- **+** «Что сейчас на проде» = `main`; простая ментальная модель.
- **−** Docs-only мержи тоже вызывают пересборку Coolify (~4 мин + краткий рестарт). Принято.
- **−** Нет ветки-буфера для отката. **Откат** делается через панель Coolify: redeploy
  предыдущего успешного деплоя.
- **Зависимость:** безопасность CD держится на зелёном CI-гейте перед мержем. Без него
  сломанный мерж уходит на прод мгновенно и молча.
```

- [ ] **Step 2: Проверить, что ADR читается и связан**

Run:
```bash
grep -q "Continuous deployment" docs/adr/023-continuous-deploy-from-main.md && grep -q "023" docs/adr/023-continuous-deploy-from-main.md && echo "adr ok"
```
Expected: `adr ok`.

- [ ] **Step 3: Обновить рунбук `docs/INFRASTRUKTUR-ladungsplaner.md`**

Заменить строку в §0:
```
- **Ветка автодеплоя**: `production` (конвенция Coolify; push → webhook → build → live).
```
на:
```
- **Ветка автодеплоя**: `main` (continuous deployment, [ADR 023](adr/023-continuous-deploy-from-main.md)): мерж/пуш в `main` → webhook → build → live. Отдельного шага релиза нет; откат — redeploy предыдущего деплоя в панели Coolify.
```

Заменить пункт 2 в §1:
```
2. **Branch**: `production`. Build Pack: **Dockerfile** (в корне репо).
```
на:
```
2. **Branch**: `main`. Build Pack: **Dockerfile** (в корне репо).
```

- [ ] **Step 4: Пометить ADR-015**

В `docs/adr/015-fullstack-app-erpnext.md` заменить строку:
```
  Coolify (ветка `production`, Traefik+TLS, поддомен `ladungsplaner.holz-schaefer.de`, named volume,
```
на:
```
  Coolify (ветка `main` — в части ветки деплоя заменено [ADR 023](023-continuous-deploy-from-main.md); Traefik+TLS, поддомен `ladungsplaner.holz-schaefer.de`, named volume,
```

- [ ] **Step 5: Обновить `docs/superpowers/START-PROMPT.md`**

Заменить строку:
```
https://ladungsplaner.holz-schaefer.de (Coolify/Hetzner, TLS, авто-деплой с ветки `production`).
```
на:
```
https://ladungsplaner.holz-schaefer.de (Coolify/Hetzner, TLS, continuous deployment с ветки `main`).
```

Заменить строку:
```
- После merge: push `main` + `production` (по отдельности, НЕ через `&&`) → Coolify авто-деплоит.
```
на:
```
- После merge в `main` → Coolify авто-деплоит (continuous deployment, ADR 023). Отдельной ветки `production` нет.
```

Заменить хвост строки:
```
→ push main+production → проверка на проде.
```
на:
```
→ мерж в main → Coolify авто-деплоит → проверка на проде.
```

- [ ] **Step 6: Добавить раздел деплоя в проектный `CLAUDE.md`**

В `CLAUDE.md` после раздела «## Технические договорённости» (перед «## Доменные инварианты») вставить:
```markdown
## Деплой и релиз

- **Continuous deployment из `main`** ([ADR 023](docs/adr/023-continuous-deploy-from-main.md)): Coolify собирает ветку `main`; мерж в `main` = выкладка на прод. Отдельной ветки `production` и отдельного шага релиза нет.
- **Шаг релиза = мерж в `main`** при зелёном CI-гейте (`.github/workflows/ci.yml`, обязательный статус-чек `ci`) + проверка live на https://ladungsplaner.holz-schaefer.de.
- **Откат** — redeploy предыдущего успешного деплоя в панели Coolify (ветки-буфера нет).
- `main` всегда должен быть прод-готов: любой мерж уходит на прод немедленно.
```

- [ ] **Step 7: Добавить заметку в Session Completion (`CLAUDE.md`)**

В `CLAUDE.md`, в разделе «## Session Completion», в пункт 2 «**Run quality gates**» добавить хвост-предложение:
```
2. **Run quality gates** (if code changed) - Tests, linters, builds. Мерж в `main` = выкладка на прод (continuous deployment, ADR 023): убедись, что гейты зелёные до мержа.
```

- [ ] **Step 8: Запись в CHANGELOG**

В `docs/CHANGELOG.md` в раздел текущей неразмеченной версии (или новый раздел `## [Unreleased]`, если формата версий нет — свериться с существующим стилем файла) добавить строку:
```
- Процесс: переход на continuous deployment из `main`; ветка `production` ретайрится; добавлен CI-гейт (GitHub Actions). ADR 023, LKWkalk-7jg.
```

- [ ] **Step 9: Приёмка документации grep-ом**

Run:
```bash
grep -rn "production" docs/INFRASTRUKTUR-ladungsplaner.md docs/superpowers/START-PROMPT.md | grep -i "ветк\|branch\|push\|автодеплой\|авто-деплой"
```
Expected: пусто (ни одной инструкции деплоить `production` в активных доках).

Run:
```bash
grep -q "continuous deployment" CLAUDE.md && grep -q "023-continuous-deploy" docs/adr/023-continuous-deploy-from-main.md && echo "docs ok"
```
Expected: `docs ok`.

- [ ] **Step 10: Commit**

```bash
git add docs/adr/023-continuous-deploy-from-main.md docs/INFRASTRUKTUR-ladungsplaner.md docs/adr/015-fullstack-app-erpnext.md docs/superpowers/START-PROMPT.md CLAUDE.md docs/CHANGELOG.md
git commit -m "docs: continuous deployment from main (ADR 023), retire production branch refs"
```

---

### Task 3: Branch protection на `main`

**Files:** нет файлов в репо — конфигурация GitHub через `gh`.

**Interfaces:**
- Consumes: контекст статус-чека `ci` из Task 1.

- [ ] **Step 1: Проверить доступ `gh`**

Run:
```bash
gh auth status && gh repo view Shadrin-V/Pallet-Packer --json nameWithOwner -q .nameWithOwner
```
Expected: авторизован; печатает `Shadrin-V/Pallet-Packer`. Если `gh` не авторизован или нет прав admin на репо — этот шаг выполняет владелец через Settings → Branches (required status check `ci` на `main`); зафиксировать это в хендовере и не блокировать остальной план.

- [ ] **Step 2: Включить обязательный статус-чек `ci` на `main`**

Run:
```bash
gh api -X PUT repos/Shadrin-V/Pallet-Packer/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=ci" \
  -F "enforce_admins=false" \
  -F "required_pull_request_reviews=null" \
  -F "restrictions=null"
```
Expected: JSON-ответ с `required_status_checks.contexts` содержащим `"ci"`. `enforce_admins=false` — чтобы владелец-соло не заблокировал сам себя в экстренном случае; `strict=true` — ветка PR должна быть свежей относительно `main`.

- [ ] **Step 3: Проверить, что защита применилась**

Run:
```bash
gh api repos/Shadrin-V/Pallet-Packer/branches/main/protection/required_status_checks -q '.contexts'
```
Expected: `["ci"]`.

Коммита нет — конфигурация вне репозитория. Зафиксировать факт в описании PR (Task 4, Step 3).

---

### Task 4: PR и owner-side cutover

**Files:** нет правок кода.

**Interfaces:**
- Consumes: всё из Task 1–3.

- [ ] **Step 1: Запушить ветку**

```bash
git push -u origin fix/7jg-continuous-deploy
```

- [ ] **Step 2: Дождаться зелёного CI на PR (главная проверка Task 1)**

Открыть PR (Step 3), затем:
```bash
gh pr checks fix/7jg-continuous-deploy --watch
```
Expected: чек `ci` — `pass`. Это подтверждает, что workflow валиден и триггерится на `pull_request`. Если красный — читать лог `gh run view --log-failed`, чинить, коммитить в ту же ветку.

- [ ] **Step 3: Открыть один PR**

```bash
gh pr create --base main --head fix/7jg-continuous-deploy \
  --title "Continuous deployment из main + CI-гейт (LKWkalk-7jg)" \
  --body "$(cat <<'EOF'
Закрепляет шаг релиза как часть процесса (LKWkalk-7jg).

## Что внутри
- CI-гейт `.github/workflows/ci.yml` (typecheck/lint/test/build, Node 22) на PR→main и push→main.
- ADR 023: continuous deployment из `main`; ветка `production` ретайрится.
- Правки рунбука, ADR-015 (pointer), START-PROMPT, проектного CLAUDE.md, CHANGELOG.
- Branch protection на `main`: обязательный статус-чек `ci` (настроен через gh api вне репо).

## Owner-side после мержа (см. ADR 023 / рунбук §1.2)
1. Coolify: сменить Branch `production` → `main`, проверить билд тривиальным пушем.
2. Ретайр ветки: `git push origin --delete production`.
3. Проверить live: `GET /api/health` отвечает, contract не откатывается.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Мерж PR (после зелёного CI и ревью владельца)**

Выполняет владелец (или агент по явной команде):
```bash
gh pr merge fix/7jg-continuous-deploy --squash --delete-branch
```

- [ ] **Step 5: Owner-side — переключить Coolify (панель, владелец)**

В приложении Ladungsplaner (панель Coolify): **Branch: `production` → `main`**. Сохранить.
Проверить, что webhook по-прежнему привязан к приложению. Сделать тривиальный пуш-проверку
(любой мерж/коммит в `main`) и убедиться, что запускается новая сборка.

- [ ] **Step 6: Owner-side — ретайр ветки `production` (строго после Step 5)**

```bash
git push origin --delete production
git branch -D production   # локально, если есть
```
Порядок обязателен: сначала Coolify на `main`, потом удаление `production` — иначе webhook на удалённую ветку сломается.

- [ ] **Step 7: Приёмка live**

Run:
```bash
git ls-remote --heads origin production   # ожидается: пусто
curl -s https://ladungsplaner.holz-schaefer.de/api/health
```
Expected: ветки `production` нет; `/api/health` отвечает, `contract` соответствует `main` (`ENGINE_CONTRACT_VERSION`), не откатился.

- [ ] **Step 8: Закрыть bead**

```bash
bd close LKWkalk-7jg --reason "CD из main: CI-гейт + branch protection + ADR 023 + рунбук; production ретайрится; проверено live"
```

---

## Self-Review

**Spec coverage:**
- Компонент 1 (Coolify switch) → Task 4 Step 5. ✅
- Компонент 2 (ретайр production) → Task 4 Step 6. ✅
- Компонент 3 (документация: ADR-023, рунбук, ADR-015, START-PROMPT, CLAUDE.md, CHANGELOG) → Task 2. ✅ (`.claude/commands/*` исключены — ветку `production` не упоминают, проверено grep-ом; заметка Release перенесена в проектный CLAUDE.md вместо глобального — зафиксировано.)
- Компонент 4 (CI-гейт) → Task 1. ✅
- Компонент 5 (branch protection) → Task 3. ✅
- Порядок «сначала CI+доки PR, потом Coolify cutover» → отражён: Task 1–3 в PR, Task 4 Step 5–6 после мержа. ✅
- Приёмка (CI зелёный, branch protection, Coolify build, ретайр, grep доков) → Task 1 Step 2/Task 4 Step 2, Task 3 Step 3, Task 4 Step 5/7, Task 2 Step 9. ✅

**Placeholder scan:** нет TBD/TODO; весь YAML и ADR приведены полностью; правки доков — точные find→replace. ✅

**Type consistency:** имя job/контекста `ci` едино в Task 1 (job `ci`), Task 3 (`contexts][]=ci`), Task 4 (`gh pr checks`). Имя файла ADR `023-continuous-deploy-from-main.md` едино во всех ссылках. Ветка `fix/7jg-continuous-deploy` едина. ✅
