// JSON-схемы тел write-роутов (LKWkalk-5zy): кривое тело — ошибка клиента и должно падать 400 на
// границе, а не 500 из слоя БД или движка. Глубина намеренно «до 500-ки»: required + типы полей,
// на которых иначе падают better-sqlite3 (undefined в bind) и calculateLayout. Enum-значения и
// доменные правила здесь НЕ дублируются — их судит движок своими кодами ошибок (ADR 006), а
// дублирование в схеме только дало бы им разъехаться. Полные JSON-схемы контракта — будущая
// MCP-задача (принцип 4 CLAUDE.md), не этот файл.
//
// additionalProperties нигде не false: дефолтный Ajv Fastify (removeAdditional) молча вырезал бы
// поля, которых нет в схеме, — и необъявленный здесь orderId/forkAccess исчезал бы из груза без
// единой ошибки. Лишние поля пропускаются как есть; сервер сам решает, что игнорировать.

const num = { type: 'number' } as const;
const str = { type: 'string' } as const;

export const vehicleBody = {
  type: 'object',
  required: ['id', 'name', 'length', 'width', 'height'],
  properties: { id: str, name: str, length: num, width: num, height: num },
} as const;

export const articleInputBody = {
  type: 'object',
  required: ['itemCode', 'name', 'rules'],
  properties: {
    itemCode: str,
    name: str,
    length: num,
    width: num,
    height: num,
    nestStepPairwise: num,
    nestStepSequential: num,
    rules: {
      type: 'object',
      required: ['state', 'nestingMode', 'rotation'],
      properties: { state: str, nestingMode: str, rotation: str },
    },
  },
} as const;

export const loadingPlanInputBody = {
  type: 'object',
  required: ['name', 'load', 'erpnextOrderIds'],
  properties: {
    name: str,
    erpnextOrderIds: { type: 'array', items: str },
    notes: str,
    load: {
      type: 'object',
      required: ['vehicle', 'cargo'],
      properties: {
        vehicle: vehicleBody,
        cargo: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'length', 'width', 'height', 'quantity', 'rotation', 'stacking', 'nesting', 'state'],
            properties: {
              id: str,
              name: str,
              length: num,
              width: num,
              height: num,
              quantity: num,
              rotation: str,
              stacking: { type: 'object' },
              nesting: { type: 'object' },
              state: str,
            },
          },
        },
      },
    },
  },
} as const;
