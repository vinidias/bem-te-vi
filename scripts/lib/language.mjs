/** Supported application locales. Portuguese is always the first-launch default. */
export function languageOrDefault(value) {
  if (value === 'en' || value === 'zh-CN') return value;
  return 'pt-BR';
}
