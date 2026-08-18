import { useAtomValue, useSetAtom } from 'jotai';
import { useLanguage } from '@/hooks/useLanguage';
import {
  tracksAtom,
  selectedItemIdsAtom,
  currentFrameAtom,
  updateTrackAtom,
  selectItemsAtom,
  deleteItemsAtom,
  addItemAtom,
  getAssetByIdAtom,
  reorderItemsAtom,
} from '@/atoms';
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Film,
  Image,
  Music,
  Mic,
  Type,
  User,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import type { Track, TrackItem, TrackType } from '@vibee/atoms';
import { TRACK_COLORS, DEFAULT_FPS, DEFAULT_COVER_DURATION, DEFAULT_WIDTH, DEFAULT_HEIGHT } from '@vibee/atoms';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './LayersPanel.css';

const TRACK_ICONS: Record<TrackType, typeof Film> = {
  video: Film,
  image: Image,
  voice: Mic,
  audio: Music,
  text: Type,
  avatar: User,
};

// TRACK_COLORS imported from @vibee/atoms

export function LayersPanel() {
  const { t } = useLanguage();
  const tracks = useAtomValue(tracksAtom);
  const selectedItemIds = useAtomValue(selectedItemIdsAtom);
  const currentFrame = useAtomValue(currentFrameAtom);
  const updateTrack = useSetAtom(updateTrackAtom);
  const selectItems = useSetAtom(selectItemsAtom);
  const deleteItems = useSetAtom(deleteItemsAtom);
  const addItem = useSetAtom(addItemAtom);
  const getAssetById = useAtomValue(getAssetByIdAtom);
  const reorderItems = useSetAtom(reorderItemsAtom);

  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(
    new Set(tracks.map((t) => t.id))
  );

  // DnD Kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent, trackId: string) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderItems({ trackId, activeId: String(active.id), overId: String(over.id), fps: DEFAULT_FPS, coverDuration: DEFAULT_COVER_DURATION });
    }
  };

  const toggleExpand = (trackId: string) => {
    setExpandedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const toggleVisibility = (trackId: string, visible: boolean) => {
    updateTrack({ trackId, updates: { visible: !visible } });
  };

  const toggleLock = (trackId: string, locked: boolean) => {
    updateTrack({ trackId, updates: { locked: !locked } });
  };

  const handleItemClick = (itemId: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      selectItems({ itemIds: [itemId], addToSelection: true }); // Add to selection
    } else {
      selectItems({ itemIds: [itemId], addToSelection: false }); // Replace selection
    }
  };

  const handleDeleteSelected = () => {
    if (selectedItemIds.length > 0) {
      deleteItems(selectedItemIds);
    }
  };

  const getItemName = (item: TrackItem): string => {
    if (item.type === 'text' && 'text' in item) {
      const text = (item as any).text as string;
      return text.length > 20 ? text.slice(0, 20) + '...' : text || 'Text';
    }
    if (item.assetId) {
      const asset = getAssetById(item.assetId);
      if (asset) return asset.name;
    }
    return `${item.type} ${item.id.slice(-4)}`;
  };

  const handleAddText = () => {
    const textTrack = tracks.find((t) => t.type === 'text');
    if (!textTrack) return;

    const newItemId = addItem({
      trackId: textTrack.id,
      itemData: {
        type: 'text',
        startFrame: currentFrame,
        durationInFrames: 90, // 3 seconds at 30fps
        x: DEFAULT_WIDTH / 2, // center x
        y: DEFAULT_HEIGHT / 2, // center y
        width: 800,
        height: 100,
        rotation: 0,
        opacity: 1,
        text: t('layers.newText'),
        fontSize: 48,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 700,
        color: '#ffffff',
        textAlign: 'center',
      } as any,
    });

    // Select the new item
    selectItems({ itemIds: [newItemId], addToSelection: false });
  };

  return (
    <div className="layers-panel">
      {/* Add Text Button */}
      <button className="add-text-btn" onClick={handleAddText}>
        <Plus size={16} />
        <span>{t('layers.addText')}</span>
      </button>

      {/* Track List */}
      <div className="layers-list">
        {tracks.map((track) => {
          const Icon = TRACK_ICONS[track.type];
          const color = TRACK_COLORS[track.type];
          const isExpanded = expandedTracks.has(track.id);

          return (
            <div key={track.id} className="layer-track">
              {/* Track Header */}
              <div className="track-header">
                <button
                  className="track-expand"
                  onClick={() => toggleExpand(track.id)}
                  style={{ opacity: track.items.length > 0 ? 1 : 0.3 }}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <div className="track-icon" style={{ background: color }}>
                  <Icon size={12} />
                </div>

                <span className="track-name">{track.name}</span>

                <div className="track-actions">
                  <button
                    className={`track-action ${track.visible ? '' : 'inactive'}`}
                    onClick={() => toggleVisibility(track.id, track.visible)}
                    title={track.visible ? t('layers.hideTrack') : t('layers.showTrack')}
                  >
                    {track.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    className={`track-action ${track.locked ? 'active' : ''}`}
                    onClick={() => toggleLock(track.id, track.locked)}
                    title={track.locked ? t('layers.unlockTrack') : t('layers.lockTrack')}
                  >
                    {track.locked ? <Lock size={14} /> : <Unlock size={14} />}
                  </button>
                </div>

                <span className="track-count">{track.items.length}</span>
              </div>

              {/* Track Items */}
              {isExpanded && track.items.length > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => handleDragEnd(e, track.id)}
                >
                  <SortableContext
                    items={track.items.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="track-items">
                      {track.items
                        .slice()
                        .sort((a, b) => a.startFrame - b.startFrame)
                        .map((item) => (
                          <SortableLayerItem
                            key={item.id}
                            item={item}
                            color={color}
                            isSelected={selectedItemIds.includes(item.id)}
                            onSelect={(e) => handleItemClick(item.id, e)}
                            getItemName={getItemName}
                          />
                        ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          );
        })}
      </div>

      {/* Selection Info */}
      {selectedItemIds.length > 0 && (
        <div className="layers-selection-bar">
          <span className="selection-count">
            {selectedItemIds.length} {t('layers.selected')}
          </span>
          <button className="selection-delete" onClick={handleDeleteSelected}>
            {t('layers.delete')}
          </button>
        </div>
      )}
    </div>
  );
}

// ===============================
// Sortable Layer Item Component
// ===============================

interface SortableLayerItemProps {
  item: TrackItem;
  color: string;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  getItemName: (item: TrackItem) => string;
}

function SortableLayerItem({
  item,
  color,
  isSelected,
  onSelect,
  getItemName,
}: SortableLayerItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`layer-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      onClick={onSelect}
    >
      <div className="item-drag" {...attributes} {...listeners}>
        <GripVertical size={12} />
      </div>
      <div className="item-color" style={{ background: color }} />
      <span className="item-name">{getItemName(item)}</span>
      <span className="item-frames">
        {item.startFrame}-{item.startFrame + item.durationInFrames}
      </span>
    </div>
  );
}
