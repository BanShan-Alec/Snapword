---

title: 发版流水线（Changelogen）
description: 本地 changelogen 提版锁定 tag，CI 三平台并行纯构建，由单一发布任务统一汇聚产物。
---

# 发版流水线（Changelogen）

> **TL;DR**：发版版本提升必须发生在开发者本地，CI 绝不擅自更改 `package.json` 的版本。本地通过 `changelogen` 解析 Conventional Commits 生成变更日志并推送 `v*` tag，CI 矩阵并行构建各平台产物，最终由单一 Publish Job 汇总发布 GitHub Release。

## 1. 选型理由

- **单版本事实源（Single Source of Truth）**：CI 环境若自动提版并 push back，极易造成多任务并发锁冲突与 Git 历史混乱。将版本提升和 CHANGELOG 决策留在本地，CI 仅作为无状态的纯构建执行器。
- **三平台矩阵构建解耦发布**：Windows、macOS 与 Linux 打包耗时差异巨大，若每个构建矩阵各自上传 Release，会导致 Release 内容不完整或互相覆盖。必须采用“矩阵并行纯打包 (`-p never`) -> 汇聚 Artifact -> 单一 Publish Job 发布”的标准架构。
- **自动化语义化变更日志**：`changelogen` 解析 Conventional Commits 的 type（feat、fix、perf 等），自动归类并映射 semver 版本号。

## 2. 核心机制

### 本地发版命令（统一脚本入口）

→ 源码：[package.json](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/package.json)

```json
{
  "scripts": {
    "changelog": "changelogen",
    "release": "changelogen --release",
    "release:patch": "changelogen --release --patch",
    "release:minor": "changelogen --release --minor",
    "release:major": "changelogen --release --major"
  }
}
```

### GitHub Actions 发版矩阵流水线

→ 源码：[.github/workflows/release.yml](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/.github/workflows/release.yml)

```yaml
name: Release App

on:
  push:
    tags: ["v*"]
  workflow_dispatch: # 手动触发仅构建不发布，用于验证流水线

jobs:
  build:
    name: Build (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-env

      # 三平台统一传入 -p never：只纯构建与校验，严禁在此阶段直接发布
      - name: Build Application (Windows)
        if: runner.os == 'Windows'
        run: pnpm run build:win -- -p never

      - name: Build Application (macOS)
        if: runner.os == 'macOS'
        run: pnpm run build:mac -- -p never

      - name: Build Application (Linux)
        if: runner.os == 'Linux'
        run: pnpm run build:linux -- -p never

      # 真实打包产物输出至 dist/，打包后暂存为 Artifact
      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: artifacts-${{ matrix.os }}
          path: |
            dist/*.exe
            dist/*.dmg
            dist/*.deb
            dist/*.zip
            dist/*.yml
            dist/*.blockmap
          if-no-files-found: error # 严禁产物缺失时静默放行

  publish:
    name: Publish GitHub Release
    needs: build
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - name: Download all build artifacts
        uses: actions/download-artifact@v4
        with:
          path: release-artifacts
          merge-multiple: true # 汇聚全平台安装包、blockmap 与 latest*.yml

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          name: ${{ github.ref_name }} 版本发布
          body: |
            📖 完整变更日志见 [CHANGELOG.md](${{ github.server_url }}/${{ github.repository }}/blob/${{ github.ref_name }}/CHANGELOG.md)
          files: release-artifacts/*
          generate_release_notes: true
```

## 3. 桌面端避坑注意事项

| 避坑要点                      | 事故表现与原因                                                                                                      | 本仓库对齐方案                                                                                             |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------- |
| **CI 自动改版本导致回滚冲突** | 在 GitHub Actions 中跑 `npm version` 并 push，多人协作或重试任务时会造成提交历史分叉。                              | 铁律：CI 不修改 `package.json`，版本号以本地 `changelogen` 产出且已打入 tag 的提交为准。                   |
| **产物未齐就暴露给用户**      | 某个平台先构建完立即创建 Release，用户或自动升级客户端尝试拉取其他平台安装包遭遇 404。                              | 构建阶段全传 `-p never`，待 Windows、macOS、Linux 三个 job 全部成功后，才由独立的 `publish` job 统一发版。 |
| **OTA 关键索引丢失**          | 仅将 `.exe` 或 `.dmg` 上传到 Release，遗漏了 `latest.yml` 与 `*.blockmap`，导致已安装客户端无法检查更新与差分下载。 | `release-artifacts/*` 全量包含升级元数据，并设置 `if-no-files-found: error` 严防静默漏传。                 |
| **分支保护与发版权限**        | `GITHUB_TOKEN` 缺少写权限导致 Release 创建失败。                                                                    | `release.yml` 显式声明 `permissions: contents: write`。                                                    |
