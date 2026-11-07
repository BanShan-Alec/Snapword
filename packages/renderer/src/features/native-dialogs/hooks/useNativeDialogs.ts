import { t } from '@lingui/core/macro';
import { ErrorCode } from '@shared/constants/error-codes';
import { useState } from 'react';
import { useManualRequest } from '@/hooks/useManualRequest';
import { callIpc, IpcError } from '@/lib/ipc';

// 私有常量
export type DialogAction = 'openFile' | 'openDirectory' | 'saveFile' | 'showInFolder';

function getFailureMessage(action: DialogAction, detail: string): string {
  switch (action) {
    case 'openFile':
    case 'openDirectory':
      return t`打开失败: ${detail}`;
    case 'saveFile':
      return t`保存失败: ${detail}`;
    case 'showInFolder':
      return t`定位失败: ${detail}`;
  }
}

interface DialogDescriptor {
  statusMessage: string;
  path?: string;
}

// 可抽离的逻辑处理函数/组件
/**
 * “取消”是业务流程而非异常；IPC 失败转成状态框文案（该通道无 message 弹窗），不抛给 useManualRequest。
 */
async function runDialogAction(
  action: DialogAction,
  selectedPath: string,
): Promise<DialogDescriptor> {
  try {
    switch (action) {
      case 'openFile': {
        const data = await callIpc('dialog.openFile', [{ title: t`选择测试文件` }]);
        logger.info('File dialog completed', { action });
        if (!data.canceled && data.filePaths.length > 0) {
          const path = data.filePaths[0];
          return { statusMessage: t`已选择文件: ${path}`, path };
        }
        return { statusMessage: t`用户取消了选择` };
      }
      case 'openDirectory': {
        const data = await callIpc('dialog.openDirectory', [{ title: t`选择测试文件夹` }]);
        logger.info('File dialog completed', { action });
        if (!data.canceled && data.filePaths.length > 0) {
          const path = data.filePaths[0];
          return { statusMessage: t`已选择文件夹: ${path}`, path };
        }
        return { statusMessage: t`用户取消了选择` };
      }
      case 'saveFile': {
        const data = await callIpc('dialog.saveFile', [
          {
            title: t`另存为示例`,
            defaultPath: 'example.txt',
            content: `Hello from ${window.__APP_ENV__?.appName || 'Electron React Template'}!\n`,
          },
        ]);
        logger.info('File dialog completed', { action });
        if (!data.canceled && data.filePath) {
          const filePath = data.filePath;
          return { statusMessage: t`保存路径已选定: ${filePath}`, path: filePath };
        }
        return { statusMessage: t`用户取消了保存` };
      }
      default: {
        await callIpc('shell.showItemInFolder', [{ path: selectedPath }]);
        logger.info('File dialog completed', { action });
        return {
          statusMessage: t`已在资源管理器中定位: ${selectedPath}`,
          path: selectedPath,
        };
      }
    }
  } catch (error) {
    // 主进程只给英文诊断详情；语义结论在这里按错误码本地化
    if (error instanceof IpcError && error.code === ErrorCode.NOT_FOUND) {
      return { statusMessage: t`文件或目录不存在: ${selectedPath}` };
    }
    const detail = (error as Error).message;
    return { statusMessage: getFailureMessage(action, detail) };
  }
}

export function useNativeDialogs() {
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [activeAction, setActiveAction] = useState<DialogAction | null>(null);

  // 网络IO（显式触发）—— 单一动作通道；失败以状态框反馈（对话框流程的内嵌反馈渠道），并发时仅最后一次生效
  const { runAsync: runDialog } = useManualRequest(
    (action: DialogAction) => runDialogAction(action, selectedPath),
    {},
  );

  // 逻辑处理函数
  const runAction = async (action: DialogAction) => {
    setActiveAction(action);
    try {
      const descriptor = await runDialog(action);
      setStatusMessage(descriptor.statusMessage);
      if (descriptor.path) {
        setSelectedPath(descriptor.path);
      }
    } catch {
      // 过期响应 CancelledError 已丢弃；业务失败已由 descriptor 反馈，此处防止未处理拒绝
    } finally {
      setActiveAction(null);
    }
  };

  const handleOpenFile = () => void runAction('openFile');
  const handleOpenDirectory = () => void runAction('openDirectory');
  const handleSaveFile = () => void runAction('saveFile');
  const handleShowInFolder = () => void runAction('showInFolder');

  return {
    selectedPath,
    statusMessage,
    activeAction,
    isLoading: activeAction !== null,
    handleOpenFile,
    handleOpenDirectory,
    handleSaveFile,
    handleShowInFolder,
  };
}
