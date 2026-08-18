import { memo } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import './ShortcutsModal.css';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  {
    categoryKey: 'shortcuts.playback',
    shortcuts: [
      { keys: ['Space'], descKey: 'shortcut.playPause' },
      { keys: ['J'], descKey: 'shortcut.rewind1s' },
      { keys: ['K'], descKey: 'shortcut.pause' },
      { keys: ['L'], descKey: 'shortcut.forward1s' },
      { keys: [','], descKey: 'shortcut.prevFrame' },
      { keys: ['.'], descKey: 'shortcut.nextFrame' },
      { keys: ['←'], descKey: 'shortcut.back1Frame' },
      { keys: ['→'], descKey: 'shortcut.forward1Frame' },
      { keys: ['Shift', '←'], descKey: 'shortcut.back10Frames' },
      { keys: ['Shift', '→'], descKey: 'shortcut.forward10Frames' },
      { keys: ['Home'], descKey: 'shortcut.goToStart' },
      { keys: ['End'], descKey: 'shortcut.goToEnd' },
    ],
  },
  {
    categoryKey: 'shortcuts.editing',
    shortcuts: [
      { keys: ['⌘', 'Z'], descKey: 'shortcut.undo' },
      { keys: ['⌘', 'Shift', 'Z'], descKey: 'shortcut.redo' },
      { keys: ['⌘', 'C'], descKey: 'shortcut.copy' },
      { keys: ['⌘', 'V'], descKey: 'shortcut.paste' },
      { keys: ['⌘', 'D'], descKey: 'shortcut.duplicate' },
      { keys: ['Delete'], descKey: 'shortcut.delete' },
      { keys: ['Shift', 'Delete'], descKey: 'shortcut.deleteWithGap' },
      { keys: ['S'], descKey: 'shortcut.splitAtPlayhead' },
    ],
  },
  {
    categoryKey: 'shortcuts.selection',
    shortcuts: [
      { keys: ['⌘', 'A'], descKey: 'shortcut.selectAll' },
      { keys: ['Escape'], descKey: 'shortcut.clearSelection' },
      { keys: ['⌘', 'Click'], descKey: 'shortcut.addToSelection' },
      { keys: ['Shift', 'Click'], descKey: 'shortcut.selectRange' },
    ],
  },
  {
    categoryKey: 'shortcuts.navigation',
    shortcuts: [
      { keys: ['['], descKey: 'shortcut.toSelectionStart' },
      { keys: [']'], descKey: 'shortcut.toSelectionEnd' },
      { keys: ['I'], descKey: 'shortcut.setInPoint' },
      { keys: ['O'], descKey: 'shortcut.setOutPoint' },
      { keys: ['Alt', 'X'], descKey: 'shortcut.resetInOut' },
      { keys: ['M'], descKey: 'shortcut.toggleMarker' },
      { keys: ['Shift', 'M'], descKey: 'shortcut.nextMarker' },
      { keys: ['Alt', 'M'], descKey: 'shortcut.prevMarker' },
    ],
  },
  {
    categoryKey: 'shortcuts.view',
    shortcuts: [
      { keys: ['Shift', 'Z'], descKey: 'shortcut.fitTimeline' },
      { keys: ['?'], descKey: 'shortcut.showShortcuts' },
    ],
  },
];

export const ShortcutsModal = memo(function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="shortcuts-modal-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <h2>{t('shortcuts.title')}</h2>
          <button className="shortcuts-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="shortcuts-modal-content">
          {SHORTCUTS.map((section) => (
            <div key={section.categoryKey} className="shortcuts-section">
              <h3 className="shortcuts-category">{t(section.categoryKey)}</h3>
              <div className="shortcuts-list">
                {section.shortcuts.map((shortcut, index) => (
                  <div key={index} className="shortcut-row">
                    <div className="shortcut-keys">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span key={keyIndex}>
                          <kbd className="shortcut-key">{key}</kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="shortcut-plus">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                    <span className="shortcut-description">{t(shortcut.descKey)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
