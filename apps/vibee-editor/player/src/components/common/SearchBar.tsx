import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X, Filter, Video, Image, Music } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import './SearchBar.css';

export type AssetFilter = 'all' | 'video' | 'image' | 'audio';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  filter?: AssetFilter;
  onFilterChange?: (filter: AssetFilter) => void;
  showFilter?: boolean;
  autoFocus?: boolean;
}

export function SearchBar({
  value,
  onChange,
  placeholder,
  filter = 'all',
  onFilterChange,
  showFilter = true,
  autoFocus = false,
}: SearchBarProps) {
  const { t } = useLanguage();
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close filter menu on outside click
  useEffect(() => {
    if (!showFilterMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterMenu]);

  const handleClear = useCallback(() => {
    onChange('');
    inputRef.current?.focus();
  }, [onChange]);

  const filterOptions: { value: AssetFilter; label: string; icon: React.ReactNode }[] = [
    { value: 'all', label: t('search.all') || 'All', icon: null },
    { value: 'video', label: t('assets.videos'), icon: <Video size={14} /> },
    { value: 'image', label: t('assets.images'), icon: <Image size={14} /> },
    { value: 'audio', label: t('assets.audio'), icon: <Music size={14} /> },
  ];

  const currentFilter = filterOptions.find((f) => f.value === filter);

  return (
    <div className="search-bar">
      <div className="search-bar__input-wrapper">
        <Search size={16} className="search-bar__icon" />
        <input
          ref={inputRef}
          type="text"
          className="search-bar__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || t('search.placeholder') || 'Search...'}
          autoFocus={autoFocus}
        />
        {value && (
          <button className="search-bar__clear" onClick={handleClear}>
            <X size={14} />
          </button>
        )}
      </div>

      {showFilter && onFilterChange && (
        <div className="search-bar__filter" ref={filterRef}>
          <button
            className={`search-bar__filter-btn ${filter !== 'all' ? 'active' : ''}`}
            onClick={() => setShowFilterMenu(!showFilterMenu)}
          >
            <Filter size={14} />
            {filter !== 'all' && currentFilter?.icon}
          </button>

          {showFilterMenu && (
            <div className="search-bar__filter-menu">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  className={`search-bar__filter-option ${filter === option.value ? 'active' : ''}`}
                  onClick={() => {
                    onFilterChange(option.value);
                    setShowFilterMenu(false);
                  }}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
