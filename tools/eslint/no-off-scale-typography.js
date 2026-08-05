// Произвольное значение типографской оси вместо ступени шкалы (LKWkalk-y5j).
//
// Конфиг Tailwind правило НЕ читает — незачем: оно запрещает произвольные значения как класс,
// а любая именованная ступень по определению уже описана в tailwind.config.js. Поэтому правило
// не может разъехаться с конфигом (в отличие от theme-alpha.test.ts, который стережёт ИМЕНА
// токенов и потому обязан читать конфиг).
//
// Проверяются все строковые литералы, а не только className: классы живут и в картах вариантов
// (apps/web/src/ui/primitives.tsx). Расплата за это — посторонняя строка, содержащая подстроку
// вида text-[…] (например URL text-[10px]/docs), даст ложное срабатывание; это принятая цена
// за покрытие карт вариантов классов, а не доказанное отсутствие ложных срабатываний.

const ARBITRARY = /\b(text|leading|tracking)-\[([^\]]+)\]/g;

/** Классы вида text-[…]/leading-[…]/tracking-[…], кроме произвольного ЦВЕТА. */
function offScaleClasses(raw) {
  const found = [];
  for (const match of String(raw).matchAll(ARBITRARY)) {
    const [cls, axis, value] = match;
    if (axis === 'text' && value.startsWith('color:')) continue;
    found.push(cls);
  }
  return found;
}

export const noOffScaleTypography = {
  meta: {
    type: 'problem',
    docs: { description: 'Типографика — только ступенями шкалы (docs/design/design-system.md §3).' },
    schema: [],
    messages: {
      offScale:
        'Произвольное значение «{{cls}}» вне шкалы. Размер, интерлиньяж и трекинг задаются ступенями из tailwind.config.js (design-system.md §3); нужен новый размер — добавь ступень туда и строку в §3.',
    },
  },
  create(context) {
    const report = (node, raw) => {
      for (const cls of offScaleClasses(raw)) {
        context.report({ node, messageId: 'offScale', data: { cls } });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') report(node, node.value);
      },
      TemplateElement(node) {
        report(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};
