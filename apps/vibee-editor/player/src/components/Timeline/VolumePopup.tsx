import { createPortal } from 'react-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { volumePopupItemIdAtom, getItemByIdAtom, updateItemAtom } from '@/atoms';
import { DEFAULT_MUSIC_VOLUME } from '@vibee/atoms';

/**
 * VolumePopup - Universal volume control for video, avatar, and audio tracks
 *
 * Works with item's own volume property, not global atom.
 * Updates volume via updateItemAtom.
 */
export function VolumePopup() {
  const volumePopupItemId = useAtomValue(volumePopupItemIdAtom);
  const setVolumePopupItemId = useSetAtom(volumePopupItemIdAtom);
  const getItemById = useAtomValue(getItemByIdAtom);
  const updateItem = useSetAtom(updateItemAtom);

  if (!volumePopupItemId) return null;

  const item = getItemById(volumePopupItemId);
  if (!item) return null;

  const volume = (item as any).volume ?? 1;
  const itemType = item.type;

  // Header based on type
  const headerText = itemType === 'audio'
    ? 'Music Volume'
    : itemType === 'avatar'
      ? 'Avatar Volume'
      : 'Video Volume';

  // Presets based on type
  const presets = itemType === 'audio'
    ? [
        { label: 'Mute', value: 0 },
        { label: `${Math.round(DEFAULT_MUSIC_VOLUME * 100)}%`, value: DEFAULT_MUSIC_VOLUME },
        { label: '15%', value: 0.15 },
      ]
    : [
        { label: 'Mute', value: 0 },
        { label: '50%', value: 0.5 },
        { label: '100%', value: 1 },
      ];

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateItem({ itemId: volumePopupItemId, updates: { volume: parseFloat(e.target.value) } });
  };

  const setVolume = (value: number) => {
    updateItem({ itemId: volumePopupItemId, updates: { volume: value } });
  };

  const closePopup = () => setVolumePopupItemId(null);

  return createPortal(
    <div className="volume-popup-overlay" onClick={closePopup}>
      <div className="volume-popup" onClick={(e) => e.stopPropagation()}>
        <div className="volume-popup-header">{headerText}</div>
        <div className="volume-popup-content">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="volume-popup-slider"
          />
          <span className="volume-popup-value">{Math.round(volume * 100)}%</span>
        </div>
        <div className="volume-popup-presets">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setVolume(preset.value);
                closePopup();
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
