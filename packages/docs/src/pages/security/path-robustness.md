---

title: 路径稳健性（Relative-path）
description: 向上定位仓库根（findRepoRoot），运行期资源依赖 Node 图与资源锚点，防工作目录偏移。
---

# 路径稳健性（Relative-path）

> **TL;DR**：构建脚本与工具链统一依托 `findRepoRoot` 向上探测仓库根目录；运行期资源采用 `require.resolve` 与 `process.resourcesPath` 稳定锚点定位，彻底规避因桌面快捷方式启动导致 `process.cwd()` 偏移而引发的资源 404。

## 1. 选型理由

桌面客户端执行环境与普通后端服务有本质差异：
- **快捷方式与右键启动的工作目录偏移**：用户双击桌面快捷方式、右键“以此方式打开”或被操作系统自启拉起时，进程的工作目录（`process.cwd()`）往往会漂移到 `C:\Windows\System32`、用户桌面或任意挂载盘符。
- **相对路径直接断裂**：若构建脚本或运行时使用 `path.resolve('./resources/icon.png')`，必定导致物理文件找不到，产生极难复现的线上资源 404。

工程确立「模块自身位置锚定」原则：**一切从模块物理位置出发定位，不依赖 `process.cwd()`**。

## 2. 核心机制（单一真源）

### 向上探测仓库根（findRepoRoot）

→ 源码：[build/lib/repo-paths.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/build/lib/repo-paths.ts)

```ts
/**
 * 从指定目录向上递归探测 Monorepo 仓库物理根目录。
 * 判定依据：同时包含 package.json 与 pnpm-workspace.yaml 的最近层级。
 */
export function findRepoRoot(fromDir: string): string {
  let current = path.resolve(fromDir);
  while (true) {
    if (
      fs.existsSync(path.join(current, 'package.json')) &&
      fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`[repo-paths] 无法从 ${fromDir} 向上定位仓库根目录`);
    }
    current = parent;
  }
}
```

全仓构建脚本统一通过 `findRepoRoot(__dirname)` 或 `findRepoRoot(import.meta.dirname)` 获取绝对基准，无论在哪个子包执行命令均可保持一致。

### 运行期资源的确定性定位

- **打包产物定位**：主进程通过 `require.resolve('@app/renderer')` 沿 Node 依赖图安全获取编译产物物理入口，不手拼相对路径。
- **打包原生资源定位**：托盘图标与打包后独立资产通过 Electron 官方锚点寻找：

```ts
const baseDirs = [
  process.resourcesPath && path.join(process.resourcesPath, 'buildResources'),
  app && path.join(app.getAppPath(), 'build', 'resources'),
].filter(Boolean);
```

## 3. 桌面端避坑注意事项

- **规约定位：最佳工程指导而非机械阻断门禁**：
  - 避免依赖 `process.cwd()` 作为全仓推荐最佳实践遵循，以规避快捷方式偏移风险。该原则作为代码审查和开发指南生效，不设立不切实际的全局静态机械阻断门禁。
- **`__dirname` 与 ESM 的环境差异**：
  - 全仓源码为 ESM，脚本使用 `import.meta.dirname`（Node 20+ 原生支持）获取当前文件绝对目录；CJS 转译产物或工具配置中回退至 `__dirname`。
- **ASAR 归档内的路径读取**：
  - 原生 C++ 动态链接库（`.node`）或外部 Shell 调用的执行文件必须置于 ASAR 外部（`asarUnpack`），否则通过文件系统路径无法直接由操作系统内核执行。
