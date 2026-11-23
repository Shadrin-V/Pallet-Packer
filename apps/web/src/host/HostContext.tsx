// Хост, внутри которого работает страница. Обычная сборка хоста не имеет (`standalone`) и провайдер
// не ставит; сборка для ERP ставит его в `ErpRoot` после успешной проверки сессии.
// `session` несёт CSRF-токен: значение живёт только в памяти этого дерева — ни в хранилище, ни в
// адресе, ни в журнале, ни в тексте ошибки.
import { createContext, useContext } from 'react';
import type { ErpSession } from '@shadrin-v/contracts';
import type { ErpSource } from '../data/ErpSource';

export type Host = { kind: 'standalone' } | { kind: 'erp'; session: ErpSession; source: ErpSource };

const STANDALONE: Host = { kind: 'standalone' };

const Ctx = createContext<Host>(STANDALONE);

export const HostProvider = Ctx.Provider;

/** Вне провайдера — `{ kind: 'standalone' }`. */
export function useHost(): Host {
  return useContext(Ctx);
}
