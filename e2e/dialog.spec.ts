import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import { expect, test } from './helpers/fixture';

/**
 * 保存主进程 dialog / shell 的原始实现，供用例结束时恢复，
 * 避免被替换的 stub 泄漏给同进程内的后续用例。
 */
async function mockSaveDialog(electronApp: ElectronApplication, savePath: string) {
  await electronApp.evaluate(({ dialog, shell }, targetPath) => {
    const g = globalThis as any;
    g.__dialogOriginals ??= {};
    g.__dialogOriginals.showSaveDialog ??= dialog.showSaveDialog;
    g.__dialogOriginals.showItemInFolder ??= shell.showItemInFolder;
    g.__dialogMockCalls = { showItemInFolder: [] as string[] };

    dialog.showSaveDialog = async () => ({ canceled: false, filePath: targetPath });
    shell.showItemInFolder = (fullPath: string) => {
      g.__dialogMockCalls.showItemInFolder.push(fullPath);
    };
  }, savePath);
}

async function mockCanceledSaveDialog(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ dialog }) => {
    const g = globalThis as any;
    g.__dialogOriginals ??= {};
    g.__dialogOriginals.showSaveDialog ??= dialog.showSaveDialog;
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
  });
}

/** 挂起打开对话框，直到用例显式调用 releaseOpenDialog，用于稳定观察 loading 互斥态 */
async function holdOpenDialog(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ dialog }) => {
    const g = globalThis as any;
    g.__dialogOriginals ??= {};
    g.__dialogOriginals.showOpenDialog ??= dialog.showOpenDialog;
    g.__openDialogRelease = undefined;
    dialog.showOpenDialog = () =>
      new Promise((resolve) => {
        g.__openDialogRelease = () => resolve({ canceled: true, filePaths: [] });
      });
  });
}

async function releaseOpenDialog(electronApp: ElectronApplication) {
  await electronApp.evaluate(() => {
    const g = globalThis as any;
    g.__openDialogRelease?.();
    delete g.__openDialogRelease;
  });
}

async function restoreDialogMocks(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ dialog, shell }) => {
    const g = globalThis as any;
    if (g.__dialogOriginals?.showSaveDialog) {
      dialog.showSaveDialog = g.__dialogOriginals.showSaveDialog;
    }
    if (g.__dialogOriginals?.showOpenDialog) {
      dialog.showOpenDialog = g.__dialogOriginals.showOpenDialog;
    }
    if (g.__dialogOriginals?.showItemInFolder) {
      shell.showItemInFolder = g.__dialogOriginals.showItemInFolder;
    }
    delete g.__dialogOriginals;
    delete g.__dialogMockCalls;
    delete g.__openDialogRelease;
  });
}

test.describe
  .serial('原生对话框与文件定位 (Native Dialogs) E2E 自动化测试', () => {
    const testFilesToCleanup: string[] = [];

    test.beforeAll(async ({ page }) => {
      // 确保界面处于简体中文环境：等待 lang 真正切换完成，而不是固定等待
      await page.evaluate(async () => {
        await (window as any).api?.config?.update?.({ language: 'zh-CN' });
      });
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    });

    test.afterAll(() => {
      for (const file of testFilesToCleanup) {
        if (fs.existsSync(file)) {
          try {
            fs.rmSync(file, { force: true });
          } catch {
            // 忽略清理临时文件异常
          }
        }
      }
    });

    test('用例 1：初始状态下「在资源管理器中定位」按钮应为禁用状态', async ({ page }) => {
      await expect(page.getByText('原生对话框与文件定位 (Native Dialogs)')).toBeVisible();

      const locateButton = page.getByRole('button', { name: '在资源管理器中定位' });
      await expect(locateButton).toBeVisible();
      await expect(locateButton).toBeDisabled();
    });

    test('用例 2：另存为保存文件（真实落盘）、状态更新并在资源管理器中定位', async ({
      page,
      electronApp,
    }) => {
      const targetSavePath = path.join(os.tmpdir(), `e2e-dialog-save-${Date.now()}.txt`);
      testFilesToCleanup.push(targetSavePath);

      try {
        // 1. 在主进程中 mock dialog.showSaveDialog 返回指定路径，并监听 shell.showItemInFolder
        await mockSaveDialog(electronApp, targetSavePath);

        // 2. 点击「另存为」按钮
        await page.getByRole('button', { name: '另存为' }).click();

        // 3. 断言状态栏提示路径选定
        await expect(page.getByText(`保存路径已选定: ${targetSavePath}`)).toBeVisible();

        // 4. 断言文件已被真实写入磁盘，且内容符合预期
        expect(fs.existsSync(targetSavePath)).toBe(true);
        const content = fs.readFileSync(targetSavePath, 'utf-8');
        expect(content).toContain('Hello from Electron React Template!');

        // 5. 断言「在资源管理器中定位」按钮解除禁用并可用
        const locateButton = page.getByRole('button', { name: '在资源管理器中定位' });
        await expect(locateButton).toBeEnabled();

        // 6. 点击「在资源管理器中定位」按钮
        await locateButton.click();

        // 7. 断言状态栏更新为已定位文案
        await expect(page.getByText(`已在资源管理器中定位: ${targetSavePath}`)).toBeVisible();

        // 8. 断言主进程 shell.showItemInFolder 被正确调用且参数一致
        const calledPaths = await electronApp.evaluate(() => {
          return (globalThis as any).__dialogMockCalls?.showItemInFolder ?? [];
        });
        expect(calledPaths).toContain(targetSavePath);
      } finally {
        await restoreDialogMocks(electronApp);
      }
    });

    test('用例 3：用户取消另存为操作', async ({ page, electronApp }) => {
      try {
        // 1. 在主进程中 mock dialog.showSaveDialog 返回取消状态
        // （d.ts 中 filePath 为非可选 string，取消场景主进程只读 canceled，空串即"未选择路径"）
        await mockCanceledSaveDialog(electronApp);

        // 2. 点击「另存为」
        await page.getByRole('button', { name: '另存为' }).click();

        // 3. 断言状态提示为用户取消了保存
        await expect(page.getByText('用户取消了保存')).toBeVisible();
      } finally {
        await restoreDialogMocks(electronApp);
      }
    });

    test('用例 4：目标文件在磁盘不存在时，定位能友好报错而非无响应', async ({ page }) => {
      // 渲染进程通过 IPC 直接请求定位一个唯一的不存在路径，避免与真实文件或前序用例撞车
      const nonExistentPath = path.join(
        os.tmpdir(),
        `non-existent-e2e-${Date.now()}-${process.pid}.txt`,
      );
      expect(fs.existsSync(nonExistentPath)).toBe(false);

      const result = await page.evaluate(async (testPath) => {
        return await (window as any).api?.shell?.showItemInFolder?.({ path: testPath });
      }, nonExistentPath);

      // 断言后端返回 failure 状态与 NOT_FOUND 错误码
      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
      expect(result.error).toContain('Target path does not exist');
    });

    test('用例 5：独立 Loading 态与全局防并发互斥（被点击按钮独立转圈，其他按钮置灰禁用）', async ({
      page,
      electronApp,
    }) => {
      const openFileBtn = page.getByRole('button', { name: '选择文件' });
      const openDirBtn = page.getByRole('button', { name: '选择目录' });
      const saveFileBtn = page.getByRole('button', { name: '另存为' });

      try {
        // 1. 挂起主进程 dialog.showOpenDialog，把「对话框未返回」的中间态变成可控条件
        await holdOpenDialog(electronApp);

        // 2. 点击「选择文件」
        await openFileBtn.click();

        // 3. 断言「选择文件」处于 loading 转圈状态
        await expect(openFileBtn).toHaveClass(/ant-btn-loading/);

        // 4. 断言其他按钮互斥置灰禁用，且绝不带 loading 转圈
        await expect(openDirBtn).toBeDisabled();
        await expect(saveFileBtn).toBeDisabled();
        await expect(openDirBtn).not.toHaveClass(/ant-btn-loading/);
        await expect(saveFileBtn).not.toHaveClass(/ant-btn-loading/);

        // 5. 释放对话框，等待操作结束（状态恢复）
        await releaseOpenDialog(electronApp);
        await expect(openFileBtn).not.toHaveClass(/ant-btn-loading/);
        await expect(openDirBtn).toBeEnabled();
        await expect(saveFileBtn).toBeEnabled();
      } finally {
        // 断言失败时对话框可能仍挂起，先释放再恢复原始实现
        await releaseOpenDialog(electronApp);
        await restoreDialogMocks(electronApp);
      }
    });
  });
