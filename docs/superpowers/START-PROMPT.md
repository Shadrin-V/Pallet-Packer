# Стартовый промт для новой вкладки

> Скопируй блок ниже в новую сессию Claude Code (в этом же репо). Дальше опиши правки, которые нужны.

---

Продолжаем **Ladungsplaner** — приложение расчёта загрузки грузовика паллетами. Оно **живое**:
https://ladungsplaner.holz-schaefer.de (Coolify/Hetzner, TLS). Все гейты зелёные (214 тестов).

**Восстановление контекста (сделай первым):**
1. `bd prime` — загрузи память. ДЕЙСТВУЕТ директива автономии (память `autonomy-directive-2026-07-10`):
   beads team-maintainer (авто commit/push/`bd dolt push`/close после зелёных гейтов), **ветка-на-задачу
   → merge в main сам**, docs-first, TDD, геометро-валидатор на каждом результате.
2. Прочитай **`docs/superpowers/HANDOVER-2026-07-15.md`** — полный снимок: архитектура (монорепо
   packages/engine+i18n+contracts, apps/web+server, шов DataProvider, движок в браузере), экраны,
   ERPNext, деплой, процесс, открытые задачи, подводные камни.
3. Проектный `CLAUDE.md` и `~/.claude/CLAUDE.md` — правила и связка скиллов (Superpowers × gstack ×
   официальные). `bd ready` — доступные задачи.

**Процесс (не перескакивай):**
- Новая фича / меняем поведение → `superpowers:brainstorming` → спека в `docs/superpowers/specs/` →
  `writing-plans` → TDD (сначала падающий тест).
- Баг → `superpowers:systematic-debugging` (гипотеза + воспроизведение, потом правка).
- Перед merge: `npm test` · `npm run lint` · `npm run typecheck` · `npm run build --workspace apps/web`
  (+ `docker build` при изменении web/server). Правил `packages/engine`/`i18n` → пересобрать их dist.
- После merge: push `main` + `production`; задеплоить (если webhook `LKWkalk-la7` настроен — авто; иначе
  попросить владельца нажать **Redeploy** в Coolify). Проверить прод: скачать `/assets/index-*.js` в файл
  и `grep` маркеры (не в shell-переменную).

**Текущее состояние:** MVP-приложение развёрнуто и работает (Настройка → Berechnen → Ladeplan, одна
страница, языки de/ru, пресеты EPAL/LKW, формула вложения, drag штабелей, печать A4). Открыты только
owner-side follow-up: `la7` webhook, `s17` deep-link, `k06` поля ERPNext, `zbi` бэкап, `i6b` Basic Auth.

**Что делаем сейчас:** у меня есть правки — опишу их следующим сообщением. Для каждой: если это фича —
брейншторм→спека→план→TDD; если баг — systematic-debugging. Ветка-на-задачу → зелёные гейты → merge →
деплой → проверка на проде.
