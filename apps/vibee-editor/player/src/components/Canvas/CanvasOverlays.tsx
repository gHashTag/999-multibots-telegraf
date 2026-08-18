import { useState, useCallback } from 'react';
import { Grid3X3, Square, Maximize2, ZoomIn, ZoomOut, RotateCcw, LayoutGrid, Minimize2, Layers } from 'lucide-react';
import { useAtom } from 'jotai';
import { layoutPresetAtom, LAYOUT_PRESETS, type LayoutPreset } from '@/atoms/ui';
import { useLanguage } from '@/hooks/useLanguage';
import './CanvasOverlays.css';

interface CanvasOverlaysProps {
  showGrid: boolean;
  showSafeZone: boolean;
  safeZoneType: '9:16' | '1:1' | '4:5' | '16:9';
  zoom: number;
  onToggleGrid: () => void;
  onToggleSafeZone: () => void;
  onChangeSafeZone: (type: '9:16' | '1:1' | '4:5' | '16:9') => void;
  onZoomChange: (zoom: number) => void;
  canvasWidth: number;
  canvasHeight: number;
}

export function CanvasOverlays({
  showGrid,
  showSafeZone,
  safeZoneType,
  zoom,
  onToggleGrid,
  onToggleSafeZone,
  onChangeSafeZone,
  onZoomChange,
  canvasWidth,
  canvasHeight,
}: CanvasOverlaysProps) {
  return (
    <>
      {/* Grid Overlay */}
      {showGrid && (
        <div className="canvas-grid-overlay">
          <div className="canvas-grid-overlay__lines" />
        </div>
      )}

      {/* Safe Zone Overlay */}
      {showSafeZone && (
        <SafeZoneOverlay
          type={safeZoneType}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
        />
      )}
    </>
  );
}

// Safe Zone Overlay Component
interface SafeZoneOverlayProps {
  type: '9:16' | '1:1' | '4:5' | '16:9';
  canvasWidth: number;
  canvasHeight: number;
}

function SafeZoneOverlay({ type, canvasWidth, canvasHeight }: SafeZoneOverlayProps) {
  const aspectRatios = {
    '9:16': 9 / 16,
    '1:1': 1,
    '4:5': 4 / 5,
    '16:9': 16 / 9,
  };

  const targetRatio = aspectRatios[type];
  const canvasRatio = canvasWidth / canvasHeight;

  let safeWidth: number;
  let safeHeight: number;

  if (targetRatio > canvasRatio) {
    // Safe zone is wider than canvas
    safeWidth = canvasWidth;
    safeHeight = canvasWidth / targetRatio;
  } else {
    // Safe zone is taller than canvas
    safeHeight = canvasHeight;
    safeWidth = canvasHeight * targetRatio;
  }

  const left = (canvasWidth - safeWidth) / 2;
  const top = (canvasHeight - safeHeight) / 2;

  return (
    <div className="safe-zone-overlay">
      {/* Darkened areas outside safe zone */}
      <div
        className="safe-zone-overlay__mask safe-zone-overlay__mask--top"
        style={{ height: top }}
      />
      <div
        className="safe-zone-overlay__mask safe-zone-overlay__mask--bottom"
        style={{ height: top }}
      />
      <div
        className="safe-zone-overlay__mask safe-zone-overlay__mask--left"
        style={{ width: left, top, height: safeHeight }}
      />
      <div
        className="safe-zone-overlay__mask safe-zone-overlay__mask--right"
        style={{ width: left, top, height: safeHeight }}
      />

      {/* Safe zone border */}
      <div
        className="safe-zone-overlay__border"
        style={{
          left,
          top,
          width: safeWidth,
          height: safeHeight,
        }}
      >
        <span className="safe-zone-overlay__label">{type}</span>
      </div>
    </div>
  );
}

// Canvas Controls Bar Component
interface CanvasControlsProps {
  showGrid: boolean;
  showSafeZone: boolean;
  safeZoneType: '9:16' | '1:1' | '4:5' | '16:9';
  zoom: number;
  onToggleGrid: () => void;
  onToggleSafeZone: () => void;
  onChangeSafeZone: (type: '9:16' | '1:1' | '4:5' | '16:9') => void;
  onZoomChange: (zoom: number) => void;
}

// Layout icon mapping
const LAYOUT_ICONS: Record<LayoutPreset, React.ComponentType<{ size?: number }>> = {
  classic: LayoutGrid,
  compact: Minimize2,
  focus: Maximize2,
  full: Layers,
};

export function CanvasControls({
  showGrid,
  showSafeZone,
  safeZoneType,
  zoom,
  onToggleGrid,
  onToggleSafeZone,
  onChangeSafeZone,
  onZoomChange,
}: CanvasControlsProps) {
  const { t, lang } = useLanguage();
  const [layout, setLayout] = useAtom(layoutPresetAtom);
  const [showSafeZoneMenu, setShowSafeZoneMenu] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);

  const zoomPresets = [
    { value: 0.5, label: '50%' },
    { value: 0.75, label: '75%' },
    { value: 1, label: '100%' },
    { value: 1.5, label: '150%' },
    { value: 2, label: '200%' },
  ];

  const safeZoneOptions: ('9:16' | '1:1' | '4:5' | '16:9')[] = ['9:16', '1:1', '4:5', '16:9'];

  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(3, zoom + 0.25);
    onZoomChange(newZoom);
  }, [zoom, onZoomChange]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(0.25, zoom - 0.25);
    onZoomChange(newZoom);
  }, [zoom, onZoomChange]);

  const handleResetZoom = useCallback(() => {
    onZoomChange(1);
  }, [onZoomChange]);

  return (
    <div className="canvas-controls">
      {/* Grid Toggle */}
      <button
        className={`canvas-control-btn ${showGrid ? 'active' : ''}`}
        onClick={onToggleGrid}
        title={t('canvas.grid') || 'Grid'}
      >
        <Grid3X3 size={16} />
      </button>

      {/* Safe Zone Toggle */}
      <div className="canvas-control-group">
        <button
          className={`canvas-control-btn ${showSafeZone ? 'active' : ''}`}
          onClick={() => setShowSafeZoneMenu(!showSafeZoneMenu)}
          title={t('canvas.safeZone') || 'Safe Zone'}
        >
          <Square size={16} />
          {showSafeZone && <span className="canvas-control-badge">{safeZoneType}</span>}
        </button>

        {showSafeZoneMenu && (
          <div className="canvas-control-menu">
            <button
              className={`canvas-control-menu-item ${!showSafeZone ? 'active' : ''}`}
              onClick={() => {
                onToggleSafeZone();
                setShowSafeZoneMenu(false);
              }}
            >
              Off
            </button>
            {safeZoneOptions.map((option) => (
              <button
                key={option}
                className={`canvas-control-menu-item ${showSafeZone && safeZoneType === option ? 'active' : ''}`}
                onClick={() => {
                  if (!showSafeZone) onToggleSafeZone();
                  onChangeSafeZone(option);
                  setShowSafeZoneMenu(false);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="canvas-control-divider" />

      {/* Zoom Controls */}
      <button
        className="canvas-control-btn"
        onClick={handleZoomOut}
        disabled={zoom <= 0.25}
        title={t('canvas.zoomOut') || 'Zoom Out'}
      >
        <ZoomOut size={16} />
      </button>

      <button
        className="canvas-control-btn canvas-control-btn--zoom"
        onClick={handleResetZoom}
        title={t('canvas.resetZoom') || 'Reset Zoom'}
      >
        {Math.round(zoom * 100)}%
      </button>

      <button
        className="canvas-control-btn"
        onClick={handleZoomIn}
        disabled={zoom >= 3}
        title={t('canvas.zoomIn') || 'Zoom In'}
      >
        <ZoomIn size={16} />
      </button>

      <div className="canvas-control-divider" />

      {/* Layout Switcher */}
      <div className="canvas-control-group">
        {(() => {
          const CurrentIcon = LAYOUT_ICONS[layout] || LayoutGrid;
          return (
            <button
              className="canvas-control-btn"
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              title="Layout"
            >
              <CurrentIcon size={16} />
            </button>
          );
        })()}

        {showLayoutMenu && (
          <div className="canvas-control-menu canvas-control-menu--layout">
            {(Object.entries(LAYOUT_PRESETS) as [LayoutPreset, typeof LAYOUT_PRESETS[LayoutPreset]][]).map(
              ([key, config]) => {
                const Icon = LAYOUT_ICONS[key];
                return (
                  <button
                    key={key}
                    className={`canvas-control-menu-item ${layout === key ? 'active' : ''}`}
                    onClick={() => {
                      setLayout(key);
                      setShowLayoutMenu(false);
                    }}
                  >
                    <Icon size={14} />
                    <span>{lang === 'ru' ? config.labelRu : config.label}</span>
                  </button>
                );
              }
            )}
          </div>
        )}
      </div>
    </div>
  );
}
