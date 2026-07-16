// User-defined pallet presets (LKWkalk-4bj.4): sizes the user saves while entering a custom
// article. Stored client-side in localStorage next to the built-in PALLET_PRESETS — reference data
// for the form, never a source of truth (same rule as the setup draft; ERPNext import overrides the
// form, it does not touch this catalogue).
import type { DimPreset } from './presets';

const USER_PALLETS_KEY = 'ladungsplaner.palletPresets';

/** Marks a preset as user-defined (built-ins keep their static keys). */
export const USER_PRESET_PREFIX = 'user-';

export function isUserPreset(key: string): boolean {
  return key.startsWith(USER_PRESET_PREFIX);
}

export function loadUserPallets(): DimPreset[] {
  try {
    const raw = globalThis.localStorage?.getItem(USER_PALLETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DimPreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) => p && typeof p.key === 'string' && typeof p.name === 'string' && p.length > 0 && p.width > 0 && p.height > 0,
    );
  } catch {
    return [];
  }
}

function save(list: DimPreset[]): DimPreset[] {
  try {
    globalThis.localStorage?.setItem(USER_PALLETS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

/** Add a preset; replaces an existing user preset with the same dimensions. */
export function addUserPallet(p: Omit<DimPreset, 'key'>): DimPreset[] {
  const list = loadUserPallets().filter(
    (x) => !(x.length === p.length && x.width === p.width && x.height === p.height),
  );
  const entry: DimPreset = { ...p, key: `${USER_PRESET_PREFIX}${crypto.randomUUID()}` };
  return save([...list, entry]);
}

export function removeUserPallet(key: string): DimPreset[] {
  return save(loadUserPallets().filter((p) => p.key !== key));
}
