// Данные рейса и строк закупки из ERP (контракт erp-y6tb9 api-vertrag, §3) — то, чего нет в
// `DataProvider` обычной сборки. Реализует `FrappeDataProvider`; экраны зависят только от интерфейса.
import type { ErpSession, OpenLine, OrderZone, TripImport } from '@shadrin-v/contracts';

export interface OpenLinesQuery {
  query?: string;
  /** ISO-дата `ГГГГ-ММ-ДД`: срок строки не позже неё. */
  dueBefore?: string;
  limit?: number;
}

export interface ErpSource {
  session(): Promise<ErpSession>;
  loadTrip(name: string): Promise<TripImport>;
  listOpenLines(q?: OpenLinesQuery): Promise<OpenLine[]>;
  importLines(lineRefs: readonly string[]): Promise<OrderZone[]>;
}
