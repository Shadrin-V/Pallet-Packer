// Hand-written guards for ERP v1 responses (contract: erp-y6tb9 api-vertrag §2–§4). No libraries.
import {
  DIMENSION_SOURCES,
  UNPLACEABLE_REASONS,
  type DimensionSource,
  type ErpSession,
  type OpenLine,
  type OrderPosition,
  type OrderZone,
  type TripImport,
  type UnplaceableReason,
} from './dto';

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isNonEmptyString = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isFiniteNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function isUnplaceableReason(x: unknown): x is UnplaceableReason {
  return typeof x === 'string' && (UNPLACEABLE_REASONS as readonly string[]).includes(x);
}

const isDimensionSource = (x: unknown): x is DimensionSource =>
  typeof x === 'string' && (DIMENSION_SOURCES as readonly string[]).includes(x);

const isWholeNonNegative = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const isWholePositive = (x: unknown): x is number => Number.isInteger(x) && (x as number) > 0;

function isOrderPosition(x: unknown): x is OrderPosition {
  if (!isRecord(x)) return false;
  if (typeof x.itemCode !== 'string' || typeof x.itemName !== 'string') return false;
  if (!isWholeNonNegative(x.quantity)) return false;
  for (const k of ['length', 'width', 'height'] as const) {
    if (x[k] !== undefined && !isWholePositive(x[k])) return false;
  }
  if (!isDimensionSource(x.dimensionsSource)) return false;
  if (x.unplaceable !== undefined && !isUnplaceableReason(x.unplaceable)) return false;
  if (x.rules !== undefined && !isRecord(x.rules)) return false;
  if (x.sourceQuantity !== undefined && x.sourceQuantity !== null) {
    if (!isFiniteNumber(x.sourceQuantity) || x.sourceQuantity < 0) return false;
  }
  return true;
}

export function isOrderZone(x: unknown): x is OrderZone {
  return isRecord(x) && isNonEmptyString(x.orderId) && Array.isArray(x.positions) && x.positions.every(isOrderPosition);
}

/** `sourceQuantity: null` means "unknown" = absent: the key is dropped, the input is not mutated. */
export function normalizeOrderZone(z: OrderZone): OrderZone {
  return {
    ...z,
    positions: z.positions.map((p) => {
      if ((p as { sourceQuantity?: number | null }).sourceQuantity !== null) return p;
      const { sourceQuantity: _unknown, ...rest } = p;
      return rest;
    }),
  };
}

export function isTripImport(x: unknown): x is TripImport {
  return isRecord(x) && typeof x.tripId === 'string' && Array.isArray(x.zones) && x.zones.every(isOrderZone);
}

export function isOpenLine(x: unknown): x is OpenLine {
  if (!isRecord(x)) return false;
  if (typeof x.lineRef !== 'string' || typeof x.orderId !== 'string') return false;
  if (typeof x.itemCode !== 'string' || typeof x.itemName !== 'string' || typeof x.uom !== 'string') return false;
  if (x.openQuantity !== null && !(isFiniteNumber(x.openQuantity) && x.openQuantity >= 0)) return false;
  if (typeof x.placeable !== 'boolean') return false;
  if (x.placeable) return x.reason === undefined;
  return isUnplaceableReason(x.reason);
}

export function parseErpSession(x: unknown): ErpSession | null {
  if (!isRecord(x)) return null;
  const { user, fullName, csrfToken, appVersion, language } = x;
  if (typeof user !== 'string' || typeof fullName !== 'string') return null;
  if (typeof csrfToken !== 'string' || typeof appVersion !== 'string') return null;
  return { user, fullName, language: language === 'ru' ? 'ru' : 'de', csrfToken, appVersion };
}
