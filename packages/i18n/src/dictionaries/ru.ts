// Russian (ru) locale dictionary (ADR 006). This is the ONLY place user-facing Russian text may
// live — no UI or engine code may hardcode strings.
import type { Dictionary } from '../keys';

export const ru: Dictionary = {
  'app.title': 'Pallet Packer',

  'field.name': 'Название',
  'field.length': 'Длина',
  'field.width': 'Ширина',
  'field.height': 'Высота',
  'field.quantity': 'Количество',
  'field.orderId': 'ID заказа',

  'vehicle.label': 'Транспортное средство',
  'vehicle.cargoHold': 'Грузовой отсек',

  'cargoType.label': 'Тип груза',
  'cargoType.rotation.label': 'Вращение',
  'cargoType.rotation.none': 'Без вращения',
  'cargoType.rotation.yawOnly': 'Только вокруг вертикальной оси',
  'cargoType.rotation.full': 'Все ориентации',
  'cargoType.stacking.label': 'Штабелирование',
  'cargoType.nesting.label': 'Вложение',

  'action.calculate': 'Рассчитать',
  'action.exportJson': 'Экспорт в JSON',

  'results.totalPlaced': 'Всего размещено',
  'results.unplaced': 'Не размещено',
  'results.floorFillPercent': 'Заполнение пола',
  'results.volumeFillPercent': 'Заполнение объёма',
  'results.placed': 'Размещено',
  'results.requested': 'Запрошено',

  'unit.mm': 'мм',

  ERR_INVALID_DIMENSION: 'Некорректный размер: значение должно быть целым положительным числом в мм.',
  ERR_CARGO_EXCEEDS_VEHICLE: 'Груз не помещается в кузов ни в одной из разрешённых ориентаций.',
  ERR_INVALID_QUANTITY:
    'Некорректное количество: значение должно быть не меньше 0 (или используйте «заполнить остаток»).',
  ERR_INVALID_NESTING:
    'Некорректное вложение: шаг высоты должен быть в диапазоне от 0 до высоты груза.',
  ERR_INVALID_ROTATION: 'Некорректный режим вращения.',
  ERR_EMPTY_LOAD: 'Список груза пуст.',
  ERR_UNKNOWN_VEHICLE: 'Кузов не найден в справочнике.',
};
