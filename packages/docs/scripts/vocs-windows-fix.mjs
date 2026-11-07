/**
 * Preloaded via `node --import` by the `dev`/`build` scripts.
 *
 * Registers the Vocs Windows path-escaping workaround only on win32 so Linux
 * CI (and the GitHub Pages deploy) keeps running Vocs completely untouched.
 */
import { register } from 'node:module';

if (process.platform === 'win32') {
  register(new URL('./vocs-windows-fix.loader.mjs', import.meta.url).href, import.meta.url);
}
