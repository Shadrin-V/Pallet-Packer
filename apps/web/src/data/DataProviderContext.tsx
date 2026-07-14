import { createContext, useContext } from 'react';
import type { DataProvider } from './DataProvider';

const Ctx = createContext<DataProvider | null>(null);

export const DataProviderProvider = Ctx.Provider;

export function useDataProvider(): DataProvider {
  const dp = useContext(Ctx);
  if (!dp) throw new Error('DataProvider not provided');
  return dp;
}
