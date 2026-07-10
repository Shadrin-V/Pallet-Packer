// Combined locale dictionary map (ADR 006). Adding a locale means adding one file here and one
// entry to this map — no lookup-function changes.
import type { Locale } from '../index';
import type { Dictionary } from '../keys';
import { de } from './de';
import { ru } from './ru';

export const DICTIONARIES: Record<Locale, Dictionary> = { de, ru };
