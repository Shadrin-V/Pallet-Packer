// German (de) locale dictionary (ADR 006). This is the ONLY place user-facing German text may
// live — no UI or engine code may hardcode strings.
import type { Dictionary } from '../keys';

export const de: Dictionary = {
  'app.title': 'Ladungsplaner',
  'app.subtitle': 'LKW-Beladung planen',

  'setup.orders': 'Aufträge',
  'setup.addOrder': 'Auftrag hinzufügen',
  'setup.addPosition': 'Position hinzufügen',
  'setup.order': 'Auftrag',
  'setup.state.ent': 'Ent',
  'setup.state.ver': 'Ver',
  'setup.stack': 'Stapel',
  'setup.vehiclePreset.custom': 'Eigene Maße',
  'setup.emptyOrders': 'Noch keine Aufträge. Fügen Sie einen Auftrag hinzu.',

  'field.name': 'Name',
  'field.length': 'Länge',
  'field.width': 'Breite',
  'field.height': 'Höhe',
  'field.quantity': 'Menge',
  'field.orderId': 'Auftrags-ID',

  'vehicle.label': 'Fahrzeug',
  'vehicle.cargoHold': 'Laderaum',

  'cargoType.label': 'Ladungsart',
  'cargoType.rotation.label': 'Drehung',
  'cargoType.rotation.none': 'Keine Drehung',
  'cargoType.rotation.yawOnly': 'Nur um die Hochachse',
  'cargoType.rotation.full': 'Alle Ausrichtungen',
  'cargoType.stacking.label': 'Stapelbar',
  'cargoType.nesting.label': 'Verschachtelung',

  'action.calculate': 'Berechnen',
  'action.exportJson': 'Als JSON exportieren',

  'results.totalPlaced': 'Platziert gesamt',
  'results.unplaced': 'Nicht platziert',
  'results.floorFillPercent': 'Bodenauslastung',
  'results.volumeFillPercent': 'Volumenauslastung',
  'results.placed': 'Platziert',
  'results.requested': 'Angefordert',

  'unit.mm': 'mm',

  ERR_INVALID_DIMENSION: 'Ungültige Abmessung: Der Wert muss eine positive ganze Zahl in mm sein.',
  ERR_CARGO_EXCEEDS_VEHICLE: 'Die Ladung passt in keiner zulässigen Ausrichtung in das Fahrzeug.',
  ERR_INVALID_QUANTITY:
    'Ungültige Menge: Der Wert muss 0 oder größer sein (oder „Rest auffüllen“ verwenden).',
  ERR_INVALID_NESTING:
    'Ungültige Verschachtelung: Die Schritthöhe muss zwischen 0 und der Höhe der Ladung liegen.',
  ERR_INVALID_ROTATION: 'Ungültiger Drehmodus.',
  ERR_EMPTY_LOAD: 'Die Ladeliste ist leer.',
  ERR_UNKNOWN_VEHICLE: 'Fahrzeug wurde im Bestand nicht gefunden.',
};
