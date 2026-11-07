import type { UpdaterSnapshot } from '@shared/types/updater';
import { useCallback, useEffect, useState } from 'react';
import { callIpc } from '@/lib/ipc';

const INITIAL_SNAPSHOT: UpdaterSnapshot = {
  state: 'idle',
  progress: null,
  error: null,
  code: null,
};

export function useUpdater() {
  const [snapshot, setSnapshot] = useState<UpdaterSnapshot>(INITIAL_SNAPSHOT);

  // 唯一保留的 useCallback：本引用进下方挂载 effect 的依赖，Biome 分析源码层要求稳定；
  // 编译器构建期会以 DropManualMemoization 换成自己的记忆化，运行期无双份开销
  const handleCheck = useCallback(async () => {
    try {
      const data = await callIpc('updater.check');
      setSnapshot(data);
    } catch {
      // 失败行已由 callIpc 落盘；错误快照经 updater:event:state 推送展示，无需重复处理
    }
  }, []);

  const handleDownload = async () => {
    try {
      const data = await callIpc('updater.download');
      setSnapshot(data);
    } catch {
      // 同上
    }
  };

  const handleCancel = async () => {
    try {
      const data = await callIpc('updater.cancel');
      setSnapshot(data);
    } catch {
      // 同上
    }
  };

  const handleInstall = async () => {
    try {
      await callIpc('updater.install');
    } catch {
      // 同上
    }
  };

  const handleClose = async () => {
    try {
      await callIpc('updater.closeWindow');
    } catch {
      // 同上
    }
  };

  useEffect(() => {
    // 挂载初次拉取快照；检查入口内聚在窗口：开窗即查（checking/downloading 进行中则直接吃后续推送）
    const bootstrap = async () => {
      let current: UpdaterSnapshot;
      try {
        current = await callIpc('updater.getState');
      } catch {
        return;
      }
      setSnapshot(current);
      if (current.state !== 'checking' && current.state !== 'downloading') {
        await handleCheck();
      }
    };
    void bootstrap();

    // 状态流转订阅
    const unsubState = window.api?.updater?.onStateChanged?.((newSnapshot) => {
      setSnapshot(newSnapshot);
    });

    // 下载进度流式订阅
    const unsubProgress = window.api?.updater?.onProgressChanged?.((progress) => {
      setSnapshot((prev) => ({
        ...prev,
        state: 'downloading',
        progress,
      }));
    });

    return () => {
      unsubState?.();
      unsubProgress?.();
    };
  }, [handleCheck]);

  // 「UI 有错 ⇒ 渲染日志必有行」：错误经事件推送/初始快照到达（非 invoke 失败）时
  // 调用失败行不存在，此处补呈现行；同态重复推送不重复记
  useEffect(() => {
    if (snapshot.state === 'error') {
      logger.warn('[updater] Error state presented:', snapshot.code, snapshot.error);
    }
  }, [snapshot.state, snapshot.code, snapshot.error]);

  const handleRetry = async () => {
    if (snapshot.version) {
      await handleDownload();
    } else {
      await handleCheck();
    }
  };

  return {
    snapshot,
    handleCheck,
    handleDownload,
    handleCancel,
    handleInstall,
    handleClose,
    handleRetry,
  };
}
