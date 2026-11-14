import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..');
const TARGET_RELEASE_DLL = path.join(
  ROOT_DIR,
  'native',
  'target',
  'release',
  'uia_probe_addon.dll',
);
const TARGET_DEBUG_DLL = path.join(ROOT_DIR, 'native', 'target', 'debug', 'uia_probe_addon.dll');
const DEST_DIR = path.join(ROOT_DIR, 'packages', 'main', 'dist', 'native');
const DEST_FILE = path.join(DEST_DIR, 'uia-probe.node');

export function copyNativeAddon(): boolean {
  let srcFile: string | null = null;
  if (fs.existsSync(TARGET_RELEASE_DLL)) {
    srcFile = TARGET_RELEASE_DLL;
  } else if (fs.existsSync(TARGET_DEBUG_DLL)) {
    srcFile = TARGET_DEBUG_DLL;
  }

  if (!srcFile) {
    console.warn(
      '⚠️ [copy-native] No compiled uia_probe_addon.dll found in native/target. Running in mock/fallback mode.',
    );
    return false;
  }

  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  fs.copyFileSync(srcFile, DEST_FILE);
  console.log(`✅ [copy-native] Copied ${srcFile} -> ${DEST_FILE}`);
  return true;
}

if (process.argv[1]?.endsWith('copy-native.ts')) {
  copyNativeAddon();
}
