import { UndoOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type React from 'react';
import type { UndoDeleteState } from '../../hooks/useVocabulary';

export interface VocabularyUndoBarProps {
  undoState: UndoDeleteState | null;
  onUndo: () => void;
}

export const VocabularyUndoBar: React.FC<VocabularyUndoBarProps> = ({ undoState, onUndo }) => {
  if (!undoState) return null;

  const countText = undoState.affectedCount > 1 ? `${undoState.affectedCount} 个单词` : '该生词';

  return (
    <div
      role="alert"
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-neutral-900/95 text-white shadow-2xl border border-neutral-700 backdrop-blur-md transition-all duration-150 animate-in fade-in slide-in-from-bottom-2 select-none"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-block w-2 h-2 rounded-full bg-warning animate-pulse" />
        <span>
          已删除{countText} ·{' '}
          <strong className="text-warning font-semibold">{undoState.remainingSeconds}s</strong>{' '}
          内可撤销
        </span>
      </div>

      <Button
        type="primary"
        size="small"
        icon={<UndoOutlined />}
        onClick={onUndo}
        className="h-6 px-2.5 text-xs font-medium"
      >
        撤销
      </Button>
    </div>
  );
};
