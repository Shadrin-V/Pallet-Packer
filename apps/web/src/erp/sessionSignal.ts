// Сигнал «сессия ERP истекла»: провайдер данных зовёт `notify` на каждый итоговый
// `ERR_NOT_LOGGED_IN` (опция `onSessionExpired` у FrappeDataProvider), оболочка подписывается.
// Создаётся до провайдера и до корня — поэтому отдельный объект, а не поле одного из них.
export function sessionExpiredSignal(): { notify: () => void; subscribe: (fn: () => void) => () => void } {
  const listeners = new Set<() => void>();
  return {
    notify: () => {
      for (const fn of [...listeners]) fn();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
