// Корень сборки для ERP: сессия ERP → привязка хранения к пользователю → программа. Машина состояний
// `loading | ready | expired | changed | bootError` (бид lp-erp-shell, контракт ERP §7).
//
// Главный инвариант — один сотрудник не пишет в черновик другого. Переход в `expired` или `changed`
// СНАЧАЛА запирает хранение (`lockDrafts`), а потом синхронно размонтирует программу: настройка и план
// исчезают из памяти, и запоздалая запись старого экрана уходит в запертое хранилище. Перепривязки к
// другому пользователю в этой вкладке нет вовсе: `bindDraftsToUser` снимает замок, а смонтированные
// экраны прежнего пользователя записали бы его черновик под ключом нового. Новый пользователь —
// только через перезагрузку страницы.
//
// То же для сервера (контракт §1, «Смена пользователя»): уходя из программы, корень закрывает
// провайдер (`source.close`) — запоздавшие цепочки размонтированных экранов в ERP не попадают; а если
// чужого пользователя первым увидел сам провайдер (новый CSRF после 400, перепроверка после 403), он
// закрывается сам и сообщает через `subscribeChanged`.
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { flushSync } from 'react-dom';
import type { ErpSession } from '@shadrin-v/contracts';
import { App } from '../App';
import type { DataProvider } from '../data/DataProvider';
import { DataProviderProvider } from '../data/DataProviderContext';
import type { ErpSource } from '../data/ErpSource';
import { HostProvider, type Host } from '../host/HostContext';
import { LocaleProvider } from '../i18n/LocaleContext';
import { bindDraftsToUser, isForeignUserKey, lockDrafts } from '../lib/draftStorage';
import { isSessionChanged, isSessionExpired } from './erpErrors';
import { ErpBootErrorScreen, SessionChangedScreen, SessionExpiredScreen, SessionLoadingScreen } from './SessionScreens';

type SessionEnd = 'expired' | 'changed';

/** Источник, который оболочка закрывает при выходе из программы (`FrappeDataProvider.close`). */
export interface ClosableErpSource extends DataProvider, ErpSource {
  close(reason: SessionEnd): void;
}

export interface ErpRootProps {
  source: ClosableErpSource;
  subscribeExpired: (fn: () => void) => () => void;
  /** Провайдер увидел в `sitzung` другого пользователя (контракт §1). */
  subscribeChanged: (fn: () => void) => () => void;
}

type Language = ErpSession['language'];

// Сессия (с CSRF-токеном) хранится только в состоянии `ready`; прочим состояниям нужен лишь язык.
type State =
  | { kind: 'loading'; language?: Language }
  | { kind: 'ready'; session: ErpSession }
  | { kind: 'expired'; language?: Language }
  | { kind: 'changed'; language?: Language }
  | { kind: 'bootError'; error: unknown; language?: Language };

const languageOf = (s: State): Language | undefined => (s.kind === 'ready' ? s.session.language : s.language);

export function ErpRoot({ source, subscribeExpired, subscribeChanged }: ErpRootProps): JSX.Element {
  const [state, setState] = useState<State>({ kind: 'loading' });
  // Пользователь работающей программы; null — программы нет. Ref, а не производное от `state`:
  // слушатели смены учётки ниже стоят с монтирования и обязаны видеть `ready` уже в тот момент, когда
  // программа смонтирована, — эффект, перевешиваемый после её отрисовки, оставлял бы окно без проверки.
  const readyUser = useRef<string | null>(null);

  /** Уйти из программы: замок хранения и закрытие провайдера раньше размонтирования. `changed`
   *  сильнее `expired`. */
  const leave = useCallback(
    (kind: SessionEnd) => {
      readyUser.current = null;
      lockDrafts();
      source.close(kind);
      flushSync(() => {
        setState((prev) => (prev.kind === 'changed' ? prev : { kind, language: languageOf(prev) }));
      });
    },
    [source],
  );

  useEffect(() => subscribeExpired(() => leave('expired')), [subscribeExpired, leave]);
  useEffect(() => subscribeChanged(() => leave('changed')), [subscribeChanged, leave]);

  // Вход: до ответа сессии хранение заперто — ни один модуль не пишет, пока пользователь неизвестен.
  useEffect(() => {
    if (state.kind !== 'loading') return;
    let live = true;
    lockDrafts();
    source.session().then(
      (session) => {
        if (!live) return;
        bindDraftsToUser(session.user);
        document.documentElement.lang = session.language;
        readyUser.current = session.user;
        setState({ kind: 'ready', session });
      },
      (error: unknown) => {
        if (!live) return;
        if (isSessionExpired(error)) source.close('expired');
        setState(isSessionExpired(error) ? { kind: 'expired' } : { kind: 'bootError', error });
      },
    );
    return () => {
      live = false;
    };
  }, [state.kind, source]);

  // Смена учётки в том же браузере: возврат в окно или на вкладку сверяет пользователя с ERP; запись
  // другой вкладки под чужим пользователем — сразу, без запроса. Вне `ready` всё это молчит.
  useEffect(() => {
    const recheck = () => {
      const user = readyUser.current;
      if (user === null) return;
      source.session().then(
        (s) => {
          if (readyUser.current === user && s.user !== user) leave('changed');
        },
        (error: unknown) => {
          if (readyUser.current !== user) return;
          if (isSessionChanged(error)) leave('changed');
          else if (isSessionExpired(error)) leave('expired');
          // прочие сбои проверки не мешают работать
        },
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    const onStorage = (e: StorageEvent) => {
      if (readyUser.current !== null && isForeignUserKey(e.key)) leave('changed');
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
  }, [source, leave]);

  const host = useMemo<Host | null>(
    () => (state.kind === 'ready' ? { kind: 'erp', session: state.session, source } : null),
    [state, source],
  );

  const language = languageOf(state) ?? 'de';
  return (
    <LocaleProvider key={language} initial={language} persist={false}>
      {state.kind === 'loading' && <SessionLoadingScreen />}
      {host && (
        <HostProvider value={host}>
          <DataProviderProvider value={source}>
            <App />
          </DataProviderProvider>
        </HostProvider>
      )}
      {state.kind === 'expired' && <SessionExpiredScreen />}
      {state.kind === 'changed' && <SessionChangedScreen />}
      {state.kind === 'bootError' && (
        <ErpBootErrorScreen error={state.error} onRetry={() => setState({ kind: 'loading', language: state.language })} />
      )}
    </LocaleProvider>
  );
}
