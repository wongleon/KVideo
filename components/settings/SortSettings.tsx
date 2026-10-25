import { type SortOption } from '@/lib/store/settings-store';
import { sortOptions } from '@/lib/store/settings-helpers';
import { SettingsSection } from './SettingsSection';

interface SortSettingsProps {
    sortBy: SortOption;
    onSortChange: (sort: SortOption) => void;
}

export function SortSettings({ sortBy, onSortChange }: SortSettingsProps) {
    return (
        <SettingsSection title="搜索结果排序" description="选择搜索结果的默认排序方式">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(sortOptions) as SortOption[]).map((option) => (
                    <button
                        key={option}
                        onClick={() => onSortChange(option)}
                        className={`px-4 py-3 rounded-[var(--radius-2xl)] border text-left font-medium transition-all duration-200 cursor-pointer ${sortBy === option
                            ? 'bg-[var(--accent-color)] border-[var(--accent-color)] text-white'
                            : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)]'
                            }`}
                    >
                        {sortOptions[option]}
                    </button>
                ))}
            </div>
        </SettingsSection>
    );
}
