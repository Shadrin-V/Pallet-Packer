// Сигналы сессии ERP от провайдера данных к оболочке: «сессия истекла» (`onSessionExpired` у
// FrappeDataProvider, на каждый итоговый `ERR_NOT_LOGGED_IN`) и «вошёл другой пользователь»
// (`onSessionChanged`). Создаются до провайдера и до корня — поэтому отдельные объекты, а не поле
// одного из них.
export interface SessionSignal {
  notify: () => void;
  subscribe: (fn: () => void) => () => void;
}

export function sessionSignal(): SessionSignal {
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

/** Сигнал «сессия истекла» (имя из интерфейса задачи 9; устроен как любой `sessionSignal`). */
export function sessionExpiredSignal(): SessionSignal {
  return sessionSignal();
}
