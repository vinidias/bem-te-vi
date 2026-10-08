import { tokenizer, parse } from 'acorn';

function brand(text) {
  return text.replaceAll('Cuckoo Code', 'Bem-te-vi').replaceAll('Cuckoo-Code', 'Bem-te-vi');
}

export function translateText(text, catalog) {
  const originalBrand = text.replaceAll('Bem-te-vi', 'Cuckoo Code');
  return brand(Object.hasOwn(catalog, text) ? catalog[text] : (Object.hasOwn(catalog, originalBrand) ? catalog[originalBrand] : text));
}

function editsApplied(source, edits) {
  for (const { start, end, value } of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, start) + value + source.slice(end);
  }
  return source;
}

export function localizeJavaScript(source, catalog) {
  const edits = [];
  for (const token of tokenizer(source, { ecmaVersion: 'latest', sourceType: 'module' })) {
    if (token.type.label !== 'string' && token.type.label !== 'template') continue;
    if (typeof token.value !== 'string') continue;
    let translated = translateText(token.value, catalog);
    // Generated overlay markup is a source template, never user-provided HTML.
    if (translated === token.value && token.value.includes('<')) {
      translated = localizeMarkup(token.value, catalog);
    }
    if (translated === token.value) continue;
    const value = token.type.label === 'string'
      ? JSON.stringify(translated)
      : translated.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
    edits.push({ start: token.start, end: token.end, value });
  }
  const result = editsApplied(source, edits);
  parse(result, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true });
  return result;
}

export function localizeMarkup(source, catalog) {
  // Only literal template text and presentation attributes are translated.
  // IDs, classes, URLs, provider selectors, user data and executable code remain unchanged.
  return source.split(/(<!--[\s\S]*?-->|<[^>]*>)/g).map((part) => {
    if (part.startsWith('<!--')) return part;
    if (part.startsWith('<')) {
      return part.replace(/((?:title|placeholder|alt|aria-label)=")([^"]*)(")/g,
        (_all, start, value, end) => start + translateText(value, catalog).replaceAll('"', '&quot;') + end);
    }
    const translated = translateText(part, catalog);
    return translated === part ? part : translated.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }).join('');
}

export function localizeHtml(source, catalog, language) {
  const result = source.split(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)/gi)
    .map((part) => {
      if (/^<style\b/i.test(part)) return part;
      if (/^<script\b/i.test(part)) {
        return part.replace(/^(<script\b[^>]*>)([\s\S]*?)(<\/script>)$/i,
          (_all, open, code, close) => open + localizeJavaScript(code, catalog).replaceAll('</script', '<\\/script') + close);
      }
      return localizeMarkup(part, catalog);
    }).join('');
  return result.replace(/<html\s+lang="[^"]*"/, '<html lang="' + language + '"');
}
