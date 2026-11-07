import { DialogCard } from './components/DialogCard';
import { useNativeDialogs } from './hooks/useNativeDialogs';

// 私有常量

// 可抽离的逻辑处理函数/组件
/**
 * 原生对话框域入口（feature 唯一公开面）。
 */
function NativeDialogsFeature() {
  // 变量声明、解构
  const {
    selectedPath,
    statusMessage,
    activeAction,
    isLoading,
    handleOpenFile,
    handleOpenDirectory,
    handleSaveFile,
    handleShowInFolder,
  } = useNativeDialogs();

  // 组件渲染
  return (
    <DialogCard
      selectedPath={selectedPath}
      statusMessage={statusMessage}
      activeAction={activeAction}
      isLoading={isLoading}
      onOpenFile={handleOpenFile}
      onOpenDirectory={handleOpenDirectory}
      onSaveFile={handleSaveFile}
      onShowInFolder={handleShowInFolder}
    />
  );
}

export { NativeDialogsFeature };
export default NativeDialogsFeature;
