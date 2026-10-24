'use client';

import { useState } from 'react';
import { useHistory } from '@/lib/store/history-store';
import { useFavorites } from '@/lib/store/favorites-store';
import { HistoryList } from '@/components/history/HistoryList';
import { FavoritesList } from '@/components/favorites/FavoritesList';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icons } from '@/components/ui/Icon';

type ListMode = 'history' | 'favorites';

const LIST_OPTIONS: { value: ListMode; label: string }[] = [
  { value: 'history', label: '观看历史' },
  { value: 'favorites', label: '我的收藏' },
];

/**
 * 追剧页面 - 左上角按钮通过选择器在「观看历史」与「我的收藏」之间切换
 */
export default function HistoryPage() {
  const { viewingHistory, removeFromHistory, clearHistory } = useHistory();
  const { favorites, removeFavorite, clearFavorites } = useFavorites();

  const [mode, setMode] = useState<ListMode>('history');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    showIdentifier?: string;
    videoId?: string | number;
    source?: string;
    isClearAll?: boolean;
  }>({ isOpen: false });

  const isHistory = mode === 'history';
  const activeLabel = LIST_OPTIONS.find((option) => option.value === mode)?.label ?? '';
  const currentCount = isHistory ? viewingHistory.length : favorites.length;

  const confirmDelete = () => {
    if (deleteConfirm.isClearAll) {
      if (isHistory) {
        clearHistory();
      } else {
        clearFavorites();
      }
    } else if (deleteConfirm.showIdentifier) {
      removeFromHistory(deleteConfirm.showIdentifier);
    } else if (deleteConfirm.videoId !== undefined && deleteConfirm.source) {
      removeFavorite(deleteConfirm.videoId, deleteConfirm.source);
    }
    setDeleteConfirm({ isOpen: false });
  };

  const dialogTitle = deleteConfirm.isClearAll
    ? `清空${isHistory ? '观看历史' : '收藏'}`
    : isHistory
      ? '删除历史记录'
      : '取消收藏';
  const dialogMessage = deleteConfirm.isClearAll
    ? `确定要清空所有${isHistory ? '观看历史' : '收藏'}吗？此操作无法撤销。`
    : isHistory
      ? '确定要删除这条历史记录吗？'
      : '确定要取消收藏这个视频吗？';

  return (
    <div className="min-h-screen bg-[var(--bg-color)] bg-[image:var(--bg-image)] bg-fixed">
      <main className="max-w-3xl mx-auto px-4 pt-8 pb-32">
        <header className="flex items-center justify-between gap-4 mb-6">
          {/* 左上角按钮 + 列表选择器 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsPickerOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isPickerOpen}
              data-focusable
              className="flex items-center gap-2 text-2xl font-bold text-[var(--text-color)] hover:opacity-80 transition-opacity cursor-pointer"
            >
              {isHistory ? (
                <Icons.History size={22} className="text-[var(--accent-color)]" />
              ) : (
                <Icons.Heart size={22} className="text-[var(--accent-color)]" />
              )}
              {activeLabel}
              <Icons.ChevronDown
                size={18}
                className={`text-[var(--text-color-secondary)] transition-transform duration-200 ${isPickerOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isPickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsPickerOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="listbox"
                  aria-label="切换列表"
                  className="absolute left-0 top-full mt-2 z-50 w-44 p-1 overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl shadow-[var(--shadow-md)]"
                >
                  {LIST_OPTIONS.map((option) => {
                    const isSelected = option.value === mode;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setMode(option.value);
                          setIsPickerOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[calc(var(--radius-2xl)-6px)] text-sm transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[color-mix(in_srgb,var(--accent-color)_14%,transparent)] text-[var(--accent-color)] font-semibold'
                            : 'text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--text-color)_6%,transparent)]'
                        }`}
                      >
                        <span>{option.label}</span>
                        {isSelected && <Icons.Check size={14} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {currentCount > 0 && (
            <button
              onClick={() => setDeleteConfirm({ isOpen: true, isClearAll: true })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-full)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-xs text-[var(--text-color-secondary)] hover:text-red-500 hover:border-red-500/30 transition-colors cursor-pointer"
              aria-label={isHistory ? '清空观看历史' : '清空收藏'}
            >
              <Icons.Trash size={14} />
              清空
            </button>
          )}
        </header>

        <div className="flex flex-col min-h-[55vh]">
          {isHistory ? (
            <HistoryList
              history={viewingHistory}
              onRemove={(showIdentifier) => setDeleteConfirm({ isOpen: true, showIdentifier })}
            />
          ) : (
            <FavoritesList
              favorites={favorites}
              onRemove={(videoId, source) => setDeleteConfirm({ isOpen: true, videoId, source })}
            />
          )}
        </div>
      </main>

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title={dialogTitle}
        message={dialogMessage}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false })}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
      />
    </div>
  );
}
