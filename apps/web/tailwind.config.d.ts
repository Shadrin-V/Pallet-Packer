// Типы для tailwind.config.js — ровно того среза, который читает theme-alpha.test.ts (rvy: тесты
// вошли в typecheck, а у JS-конфига декларации нет). Настоящую полную типизацию даёт сам Tailwind
// в рантайме; здесь только форма, за которой ходит сторож токенов.
declare const config: {
  theme?: { extend?: { colors?: Record<string, string | Record<string, string>> } };
};
export default config;
