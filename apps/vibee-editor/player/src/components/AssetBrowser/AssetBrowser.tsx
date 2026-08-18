import { useRef, useCallback, useState } from 'react';
import { useAtomValue, useSetAtom, useAtom } from 'jotai';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/useToast';
import {
  filteredAssetsAtom,
  browserCategoryAtom,
  browserSearchAtom,
  browserUploadingAtom,
  browserUploadProgressAtom,
  categoryCounts,
  CATEGORY_CONFIG,
  type AssetCategory,
  addAssetAtom,
} from '@/atoms';
import { Plus, Search, Loader2 } from 'lucide-react';
import { AssetCard } from '@/components/Assets/AssetCard';
import type { Asset } from '@vibee/atoms';
import { RENDER_SERVER_URL } from '@/lib/mediaUrl';
import './AssetBrowser.css';

interface AssetBrowserProps {
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

const CATEGORIES: AssetCategory[] = ['all', 'video', 'audio', 'image', 'avatar'];

export function AssetBrowser({ className = '', orientation = 'horizontal' }: AssetBrowserProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const addAsset = useSetAtom(addAssetAtom);

  // Browser state from atoms
  const filteredAssets = useAtomValue(filteredAssetsAtom);
  const [category, setCategory] = useAtom(browserCategoryAtom);
  const [browserSearch, setBrowserSearch] = useAtom(browserSearchAtom);
  const [isUploading, setIsUploading] = useAtom(browserUploadingAtom);
  const [uploadProgress, setUploadProgress] = useAtom(browserUploadProgressAtom);
  const counts = useAtomValue(categoryCounts);

  // Local state
  const [showSearch, setShowSearch] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // File upload handler
  const uploadFile = useCallback(async (file: File): Promise<Asset | null> => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${RENDER_SERVER_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const data = await response.json();
      const type = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
        ? 'audio'
        : 'image';

      return {
        id: crypto.randomUUID(),
        type,
        name: file.name.replace(/\.[^.]+$/, ''),
        url: data.url || data.path,
        thumbnail: data.thumbnail,
        duration: type === 'video' ? 150 : undefined,
        fileSize: file.size,
      };
    } catch (error) {
      console.error('Upload error:', error);
      const type = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
        ? 'audio'
        : 'image';

      return {
        id: crypto.randomUUID(),
        type,
        name: file.name.replace(/\.[^.]+$/, ''),
        url: URL.createObjectURL(file),
        fileSize: file.size,
      };
    }
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      setIsUploading(true);
      setUploadProgress(0);

      let uploaded = 0;
      for (const file of fileArray) {
        const asset = await uploadFile(file);
        if (asset) {
          addAsset(asset);
        }
        uploaded++;
        setUploadProgress((uploaded / fileArray.length) * 100);
      }

      setIsUploading(false);
      setUploadProgress(0);
      toast.success(`${uploaded} ${uploaded === 1 ? 'file' : 'files'} uploaded`);
    },
    [uploadFile, addAsset, setIsUploading, setUploadProgress, toast]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
      }
      e.target.value = '';
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        scrollRef.current.scrollLeft += e.deltaY || e.deltaX;
      } else if (Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        scrollRef.current.scrollLeft += e.deltaY;
      }
    }
  }, []);

  const handleAssetDragStart = useCallback((e: React.DragEvent, asset: Asset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const isVertical = orientation === 'vertical';

  return (
    <div
      className={`asset-browser ${className} ${isDragOver ? 'drag-over' : ''} ${isVertical ? 'vertical' : 'horizontal'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="asset-browser-header">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          className="browser-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          title={t('assets.upload')}
        >
          {isUploading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
        </button>
        <button
          className={`browser-search-btn ${showSearch ? 'active' : ''}`}
          onClick={() => setShowSearch(!showSearch)}
          title={t('assets.search')}
        >
          <Search size={16} />
        </button>
        {showSearch && (
          <input
            type="text"
            className="browser-search-input"
            placeholder={t('assets.searchPlaceholder')}
            value={browserSearch}
            onChange={(e) => setBrowserSearch(e.target.value)}
            autoFocus
          />
        )}
        <div className="browser-categories">
          {CATEGORIES.map((cat) => {
            const config = CATEGORY_CONFIG[cat];
            const count = counts[cat];
            const isActive = category === cat;
            return (
              <button
                key={cat}
                className={`browser-category-chip ${isActive ? 'active' : ''}`}
                onClick={() => setCategory(cat)}
                style={{ '--chip-color': config.color } as React.CSSProperties}
              >
                <span className="chip-icon">{config.icon}</span>
                <span className="chip-label">{config.label}</span>
                <span className="chip-count">{count}</span>
              </button>
            );
          })}
        </div>
        {isUploading && (
          <div className="browser-upload-progress">
            <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className="asset-browser-assets"
        onWheel={handleWheel}
      >
        {filteredAssets.length === 0 ? (
          <div className="browser-empty"><span>{t('assets.empty')}</span></div>
        ) : (
          filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className="browser-asset-wrapper"
              draggable
              onDragStart={(e) => handleAssetDragStart(e, asset)}
            >
              <AssetCard asset={asset} size="compact" thumbnail={asset.thumbnail} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
