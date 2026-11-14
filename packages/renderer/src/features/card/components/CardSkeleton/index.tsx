import { LoadingOutlined } from '@ant-design/icons';
import type React from 'react';

export interface CardSkeletonProps {
  mode: 'word' | 'sentence';
  isSlow?: boolean;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({ mode, isSlow }) => {
  return (
    <div className="flex flex-col gap-3.5 px-3 py-3 select-none">
      {isSlow && (
        <div className="flex items-center gap-1.5 rounded bg-warning/10 px-2.5 py-1 text-xs text-warning">
          <LoadingOutlined className="animate-spin text-xs" />
          <span>接口响应较慢，仍在请求中…</span>
        </div>
      )}

      {mode === 'word' ? (
        // 单词骨架：4-6 行静态灰条 (词头、音标、语境义、2 条义项)
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-7 w-32 rounded bg-background-sunken opacity-70" />
            <div className="h-5 w-24 rounded bg-background-sunken/80 opacity-60" />
          </div>
          <div className="h-16 w-full rounded-r-lg border-l-4 border-background-sunken bg-background-sunken/50 p-2" />
          <div className="flex flex-col gap-2 pt-1">
            <div className="h-4 w-16 rounded bg-background-sunken opacity-60" />
            <div className="h-5 w-full rounded bg-background-sunken/80 opacity-50" />
            <div className="h-5 w-4/5 rounded bg-background-sunken/80 opacity-50" />
          </div>
        </div>
      ) : (
        // 句子骨架：2-3 行静态灰条
        <div className="flex flex-col gap-2.5">
          <div className="h-4 w-20 rounded bg-background-sunken opacity-60" />
          <div className="h-6 w-full rounded bg-background-sunken/80 opacity-50" />
          <div className="h-6 w-11/12 rounded bg-background-sunken/80 opacity-50" />
          <div className="h-6 w-3/4 rounded bg-background-sunken/80 opacity-50" />
        </div>
      )}
    </div>
  );
};
