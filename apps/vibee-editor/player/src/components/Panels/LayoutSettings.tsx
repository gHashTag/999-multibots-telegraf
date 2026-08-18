import { useAtom } from 'jotai';
import { layoutPresetAtom, LAYOUT_PRESETS, type LayoutPreset } from '@/atoms/ui';
import { useLanguage } from '@/hooks/useLanguage';
import { LayoutGrid, Minimize2, Maximize2, Layers } from 'lucide-react';
import './LayoutSettings.css';

// Map icon names to components
const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  LayoutGrid,
  Minimize2,
  Maximize2,
  Layers,
};

export function LayoutSettings() {
  const [layout, setLayout] = useAtom(layoutPresetAtom);
  const { lang } = useLanguage();

  return (
    <div className="layout-settings">
      <div className="layout-settings-header">
        <LayoutGrid size={16} />
        <span>Layout</span>
      </div>

      <div className="layout-options">
        {(Object.entries(LAYOUT_PRESETS) as [LayoutPreset, typeof LAYOUT_PRESETS[LayoutPreset]][]).map(
          ([key, config]) => {
            const Icon = ICONS[config.icon] || LayoutGrid;
            const isActive = layout === key;

            return (
              <button
                key={key}
                className={`layout-option ${isActive ? 'active' : ''}`}
                onClick={() => setLayout(key)}
                title={lang === 'ru' ? config.descriptionRu : config.description}
              >
                <Icon size={20} />
                <span className="layout-option-label">
                  {lang === 'ru' ? config.labelRu : config.label}
                </span>
              </button>
            );
          }
        )}
      </div>

    </div>
  );
}
