// Жёсткая пользовательская строка в разметке (LKWkalk-y5j, спека
// docs/superpowers/specs/2026-08-04-y5j-i18n-style-gates-design.md).
//
// Принцип вместо списка глифов: литерал БЕЗ букв и цифр переводу не подлежит (×, ·, —, :, %),
// всё остальное идёт через tt(...)/fillTemplate(...). Поэтому зашитое ' mm' ловится само.
//
// Граница, выбранная сознательно: строка, собранная в TS и переданная переменной
// (const label = 'Details'; <X ariaLabel={label} />), правилу не видна. Анализ потока данных дал бы
// ложных срабатываний на порядок больше, чем ловит.

const HAS_WORD = /[\p{L}\p{N}]/u;

/** Атрибуты и пропсы, принимающие пользовательский текст. Прочие (d, fill, transform…) — не текст. */
const TEXT_PROPS = new Set([
  'aria-label',
  'ariaLabel',
  'title',
  'placeholder',
  'alt',
  'label',
  'unit',
]);

/** Спрятан ли узел от скринридера: глиф-иконка внутри aria-hidden текстом не является. */
function insideAriaHidden(sourceCode, node) {
  for (const ancestor of sourceCode.getAncestors(node)) {
    if (ancestor.type !== 'JSXElement') continue;
    for (const attr of ancestor.openingElement.attributes) {
      if (attr.type !== 'JSXAttribute' || attr.name.name !== 'aria-hidden') continue;
      const value = attr.value;
      if (value === null) return true; // <span aria-hidden>
      if (value.type === 'Literal' && value.value !== 'false' && value.value !== false) return true;
      if (
        value.type === 'JSXExpressionContainer' &&
        value.expression.type === 'Literal' &&
        value.expression.value === true
      ) {
        return true;
      }
    }
  }
  return false;
}

export const noUntranslatedText = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Пользовательский текст только через ключи локали (CLAUDE.md, архитектурный принцип 3).',
    },
    schema: [],
    messages: {
      hardcoded:
        'Жёсткая строка «{{text}}» в разметке. Пользовательский текст идёт через tt(…)/fillTemplate(…); глиф-иконку прячут в aria-hidden.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const report = (node, raw) => {
      const text = String(raw).trim();
      if (!HAS_WORD.test(text)) return;
      context.report({ node, messageId: 'hardcoded', data: { text } });
    };

    return {
      JSXText(node) {
        if (insideAriaHidden(sourceCode, node)) return;
        report(node, node.value);
      },
      JSXAttribute(node) {
        if (!TEXT_PROPS.has(node.name.name)) return;
        const value = node.value;
        if (!value) return;
        if (value.type === 'Literal') {
          report(value, value.value);
          return;
        }
        if (value.type !== 'JSXExpressionContainer') return;
        const expression = value.expression;
        if (expression.type === 'Literal') {
          report(expression, expression.value);
          return;
        }
        if (expression.type === 'TemplateLiteral') {
          // Проверяется каждый кусок: переменные уже переведены, а вот текст между ними — нет.
          for (const quasi of expression.quasis) {
            report(quasi, quasi.value.cooked ?? quasi.value.raw);
          }
        }
      },
    };
  },
};
