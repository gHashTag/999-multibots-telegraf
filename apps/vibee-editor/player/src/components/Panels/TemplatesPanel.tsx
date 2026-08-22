import { useState, useRef, useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { templatesAtom, selectedTemplateIdAtom, selectTemplateAtom, removeTemplateAtom, addTemplateAtom, saveCurrentSettingsAtom, templateSettingsAtom, coverImageAtom, type Template } from '@/atoms';
import {
  serverTemplatesAtom,
  serverTemplatesLoadingAtom,
  serverTemplatesErrorAtom,
  loadServerTemplatesAtom,
} from '@/atoms/serverTemplates';
import { useLanguage } from '@/hooks/useLanguage';
import { LayoutTemplate, Check, Trash2, Plus, Download, Upload } from 'lucide-react';
import './TemplatesPanel.css';

// Default cover for built-in templates
const DEFAULT_COVER = '/covers/poster.jpeg';

export function TemplatesPanel() {
  const { t } = useLanguage();
  const templates = useAtomValue(templatesAtom);
  const selectedTemplateId = useAtomValue(selectedTemplateIdAtom);
  const selectTemplate = useSetAtom(selectTemplateAtom);
  const removeTemplate = useSetAtom(removeTemplateAtom);
  const addTemplate = useSetAtom(addTemplateAtom);
  const saveCurrentSettings = useSetAtom(saveCurrentSettingsAtom);
  const templateSettings = useAtomValue(templateSettingsAtom);
  const currentCoverImage = useAtomValue(coverImageAtom);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Настоящие шаблоны сервера. Локальный массив остаётся личными
  // пресетами человека, но выбирать КАНОН (нуар / сплит / гравюра) можно
  // только из того, что сервер реально умеет отрендерить.
  const serverTemplates = useAtomValue(serverTemplatesAtom);
  const serverLoading = useAtomValue(serverTemplatesLoadingAtom);
  const serverError = useAtomValue(serverTemplatesErrorAtom);
  const loadServerTemplates = useSetAtom(loadServerTemplatesAtom);
  useEffect(() => {
    void loadServerTemplates();
  }, [loadServerTemplates]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportSettings = () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('vibee-') || key.startsWith('editor:'))) {
        try {
          data[key] = JSON.parse(localStorage.getItem(key)!);
        } catch {
          data[key] = localStorage.getItem(key);
        }
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibee-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        for (const [key, value] of Object.entries(data)) {
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
        window.location.reload();
      } catch {
        alert('Invalid settings file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Get thumbnail from saved settings, current state, or default
  const getThumbnail = (template: Template): string | undefined => {
    // For currently selected template - use current cover image
    if (template.id === selectedTemplateId) {
      return currentCoverImage || DEFAULT_COVER;
    }
    // For other templates - use saved settings
    const settings = templateSettings[template.id];
    if (settings?.coverImage) {
      return settings.coverImage;
    }
    // For built-in templates - use default cover
    if (!template.isUserCreated) {
      return DEFAULT_COVER;
    }
    return undefined;
  };

  const handleImageError = (templateId: string) => {
    setFailedImages(prev => new Set(prev).add(templateId));
  };

  const handleDelete = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    if (confirm(t('templates.confirmDelete'))) {
      removeTemplate(templateId);
    }
  };

  const handleAddTemplate = () => {
    const name = prompt('Template name:');
    if (!name?.trim()) return;

    addTemplate({
      name: name.trim(),
      description: `User template: ${name.trim()}`,
      compositionId: 'SplitTalkingHead',
      defaultProps: {},
    });
    // Save current editor settings into the new template
    saveCurrentSettings();
  };

  return (
    <div className="templates-panel">
      {/* Каноны сервера: единственный источник правды о том, что рендерится */}
      <div className="template-section">
        <div className="template-section-title">{t('templates.canons')}</div>
        {serverLoading ? (
          <div className="template-empty">{t('common.loading')}</div>
        ) : serverError ? (
          <div className="template-empty template-error">{serverError}</div>
        ) : serverTemplates.length === 0 ? (
          <div className="template-empty">{t('templates.noneOnServer')}</div>
        ) : (
          <div className="template-grid">
            {serverTemplates.map(tpl => (
              <div
                key={tpl.id}
                className={`template-card ${selectedTemplateId === tpl.id ? 'selected' : ''}`}
                onClick={() => selectTemplate(tpl.id)}
                title={tpl.about}
              >
                <div
                  className="template-card-cover"
                  style={{
                    backgroundImage: tpl.poster ? `url(${tpl.poster})` : undefined,
                    borderColor: tpl.accent,
                  }}
                />
                <div className="template-card-body">
                  <div className="template-card-name" style={{ color: tpl.accent }}>
                    {tpl.title}
                  </div>
                  <div className="template-card-desc">{tpl.tagline}</div>
                  <div className="template-card-meta">
                    {tpl.width}×{tpl.height} · {tpl.fps} fps
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid of template cards */}
      <div className="template-grid">
        {templates.map((template) => {
          const isSelected = template.id === selectedTemplateId;

          return (
            <div
              key={template.id}
              className={`template-card ${isSelected ? 'selected' : ''}`}
              onClick={() => selectTemplate(template.id)}
              title={template.description}
            >
              <div className="template-card-thumbnail">
                {getThumbnail(template) && !failedImages.has(template.id) ? (
                  <img
                    src={getThumbnail(template)}
                    alt={template.name}
                    onError={() => handleImageError(template.id)}
                  />
                ) : (
                  <LayoutTemplate size={24} />
                )}
                {isSelected && (
                  <div className="template-card-check">
                    <Check size={14} />
                  </div>
                )}
                {/* Overlay with name */}
                <div className="template-card-overlay">
                  <span className="template-card-name">{template.name}</span>
                </div>
              </div>
              {template.isUserCreated && (
                <button
                  className="template-card-delete"
                  onClick={(e) => handleDelete(e, template.id)}
                  title={t('templates.delete')}
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          );
        })}

        {/* Add new template card */}
        <div
          className="template-card template-card-add"
          onClick={handleAddTemplate}
          title="Save current settings as template"
        >
          <div className="template-card-thumbnail">
            <Plus size={24} />
            <div className="template-card-overlay">
              <span className="template-card-name">Save Template</span>
            </div>
          </div>
        </div>
      </div>

      {/* Export/Import settings */}
      <div className="templates-transfer">
        <button className="templates-transfer-btn" onClick={handleExportSettings} title="Export all settings">
          <Download size={13} />
          <span>Export</span>
        </button>
        <button className="templates-transfer-btn" onClick={() => fileInputRef.current?.click()} title="Import settings">
          <Upload size={13} />
          <span>Import</span>
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportSettings} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
