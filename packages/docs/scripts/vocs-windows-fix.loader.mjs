/**
 * Node loader that patches Vocs bugs at module-load time on Windows.
 *
 * Bug 1 — `recmaMdxLayout` (vocs/dist/internal/mdx.js) interpolates the page's
 * `path.relative()` result straight into a JS string literal:
 *
 *   filePath: "${filePath}",
 *
 * On Windows that result contains backslashes, so a nested page like
 * `testing/unit-tests.md` becomes `"testing\unit-tests.md"`. Acorn then fails
 * with `Bad character escape sequence` (`\u` + `nit-tests`), and the build
 * aborts before any page is generated. The same interpolation also silently
 * drops separators for other nested pages (`ui\antd.md` -> `uiantd.md`).
 * Rewriting to `JSON.stringify(filePath)` escapes the separators correctly.
 *
 * Bug 2 — the `slots()` Vite plugin (vocs/dist/internal/vite-plugins.js)
 * interpolates the absolute `_slots.tsx` path into a generated virtual module:
 *
 *   import * as Slots from '${slotsPath}'
 *
 * On Windows that path is backslash-separated, so Rolldown receives
 * `H:electron-app-temp5...` (separators eaten as escapes) and fails to resolve
 * the import. Rewriting to `JSON.stringify(slotsPath)` emits a correct string
 * literal.
 *
 * Kept as a loader (instead of a pnpm patch) so the workaround stays inside
 * packages/docs and Linux builds run Vocs untouched; remove once Vocs ships a
 * fix upstream (tracked in https://github.com/wevm/vocs/issues/674).
 */

// biome-ignore lint/suspicious/noTemplateCurlyInString: mirrors the Vocs source text verbatim
const MDX_TARGET = 'filePath: "${filePath}",';
// biome-ignore lint/suspicious/noTemplateCurlyInString: this is the JS code emitted into the module
const MDX_PATCHED = 'filePath: ${JSON.stringify(filePath)},';
const MDX_MODULE_SUFFIX = '/vocs/dist/internal/mdx.js';

// biome-ignore lint/suspicious/noTemplateCurlyInString: mirrors the Vocs source text verbatim
const SLOTS_TARGET = "import * as Slots from '${slotsPath}'";
// biome-ignore lint/suspicious/noTemplateCurlyInString: this is the JS code emitted into the module
const SLOTS_PATCHED = 'import * as Slots from ${JSON.stringify(slotsPath)}';
const VITE_PLUGINS_MODULE_SUFFIX = '/vocs/dist/internal/vite-plugins.js';

// Bug 4 — the `userStyles()` Vite plugin (same module) interpolates the
// absolute `_root.css` path into a generated import:
//
//   import styles from '${stylesPath}?url';
//
// Same backslash-eating as Bug 2: Rolldown receives `H:electron-app-temp5...`
// and fails to resolve the import. `JSON.stringify` emits a correct literal.
// biome-ignore lint/suspicious/noTemplateCurlyInString: patch target literal
const STYLES_TARGET = "import styles from '${stylesPath}?url';";
// biome-ignore lint/suspicious/noTemplateCurlyInString: patch target literal
const STYLES_PATCHED = "import styles from ${JSON.stringify(stylesPath + '?url')};";

// Bug 3 — `getPagesFromDir` (vocs/dist/internal/llms.js) builds llms.txt page
// paths from `fs.glob` results. Node's glob returns backslash-separated paths
// on Windows, and the `file.replace(pagesDir, '')` prefix strip targets a
// forward-slash path, so the strip misses and route entries end up as
// `\ai\collaboration-convention` in llms.txt — unresolvable links for LLMs.
// Normalizing separators to `/` before the strip fixes every nav entry.
const LLMS_MODULE_SUFFIX = '/vocs/dist/internal/llms.js';

/** @type {import('node:module').LoadHook} */
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  // `source` is a string or a Buffer depending on how the entry was resolved.
  if (result.source == null) return result;

  let source = String(result.source);
  let patched = false;

  if (url.endsWith(MDX_MODULE_SUFFIX) && source.includes(MDX_TARGET)) {
    source = source.replace(MDX_TARGET, MDX_PATCHED);
    patched = true;
  }
  if (url.endsWith(VITE_PLUGINS_MODULE_SUFFIX) && source.includes(SLOTS_TARGET)) {
    source = source.replace(SLOTS_TARGET, SLOTS_PATCHED);
    patched = true;
  }
  if (url.endsWith(VITE_PLUGINS_MODULE_SUFFIX) && source.includes(STYLES_TARGET)) {
    source = source.replace(STYLES_TARGET, STYLES_PATCHED);
    patched = true;
  }
  if (url.endsWith(LLMS_MODULE_SUFFIX) && source.includes('path: file')) {
    // SEP = a single backslash character, spelled via fromCharCode to keep this
    // file free of literal-backslash escaping hazards.
    const SEP_INJECT = 'const SEP = String.fromCharCode(92);\n';
    source = SEP_INJECT + source;
    // Replace the getPagesFromDir map body: normalize glob separators AND the
    // pagesDir prefix to `/` before the strip, otherwise one of the two always
    // misses on Windows (glob returns `\`, path.resolve returns mixed).
    const ORIGINAL = `        path: file
            .replace(pagesDir, '')`;
    const REPLACED = `        path: file
            .replaceAll(SEP, '/')
            .replace(pagesDir.replaceAll(SEP, '/'), '')`;
    source = source.replace(ORIGINAL, REPLACED);
    patched = true;
  }
  if (!patched) return result;
  return { ...result, source, shortCircuit: true };
}
