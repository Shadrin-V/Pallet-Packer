// Складская единица ERP → короткая подпись для показа. Единица только показывается: размещаемость
// строки решает сервер ERP (`unplaceable`), а не её название.
import type { TranslationKey } from '@shadrin-v/i18n';

const UOM_KEYS: Readonly<Record<string, TranslationKey>> = {
  Nos: 'uom.pieces',
  Stk: 'uom.pieces',
  'Cubic Meter': 'uom.cubicMeter',
};

/** Ключ локали известной единицы ERP; неизвестная — `undefined`. */
export function uomKey(uom: string): TranslationKey | undefined {
  return Object.hasOwn(UOM_KEYS, uom) ? UOM_KEYS[uom] : undefined;
}

/** Подпись единицы: перевод известной, исходная строка неизвестной, пусто — `''`. */
export function formatUom(uom: string | undefined, tt: (k: TranslationKey) => string): string {
  if (!uom) return '';
  const key = uomKey(uom);
  return key ? tt(key) : uom;
}
