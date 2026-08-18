import { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { generatedResultsAtom, removeGeneratedResultAtom, type GeneratedResult } from '@/atoms/generateResults';
import { addAssetAtom } from '@/atoms/assets';
import { currentFrameAtom } from '@/atoms/playback';
import { useEditorStore } from '@/store/editorStore';
import { useLanguage } from '@/hooks/useLanguage';
import { toAbsoluteUrl } from '@/lib/mediaUrl';
import { Trash2, Plus, GripVertical, Image, Video, Music, Share2 } from 'lucide-react';
import { PublishModal } from '@/components/Modals/PublishModal';
import type { Asset } from '@vibee/atoms';
import { DEFAULT_AVATAR_CONFIG, DEFAULT_WIDTH, DEFAULT_HEIGHT } from '@vibee/atoms';
import './ResultsGallery.css';

interface ResultsGalleryProps {
  tab: 'image' | 'video' | 'audio' | 'lipsync';
}

export function ResultsGallery({ tab }: ResultsGalleryProps) {
  const { t } = useLanguage();
  const generatedResults = useAtomValue(generatedResultsAtom);
  const removeResult = useSetAtom(removeGeneratedResultAtom);
  const currentFrame = useAtomValue(currentFrameAtom);
  const addItem = useEditorStore((s) => s.addItem);

  // Publish modal state
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishVideoUrl, setPublishVideoUrl] = useState<string | undefined>();

  // Get results for current tab
  const results = generatedResults[tab];

  // Handle share to feed
  const handleShare = (result: GeneratedResult) => {
    setPublishVideoUrl(toAbsoluteUrl(result.url));
    setPublishModalOpen(true);
  };

  // Handle drag start for drag & drop to timeline
  const handleDragStart = (e: React.DragEvent, result: GeneratedResult) => {
    const asset: Asset = {
      id: result.id,
      type: result.type,
      name: result.name,
      url: result.url,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Add result to timeline at playhead position
  const handleAddToTimeline = (result: GeneratedResult) => {
    // Determine target track based on asset type and current tab
    let trackId: string;
    let itemType: 'video' | 'image' | 'audio' | 'avatar';

    // If we're on lipsync tab, treat videos as avatars
    if (tab === 'lipsync') {
      trackId = 'track-avatar';
      itemType = 'avatar';
    } else {
      switch (result.type) {
        case 'audio':
          trackId = 'track-audio';
          itemType = 'audio';
          break;
        case 'image':
          trackId = 'track-image';
          itemType = 'image';
          break;
        default:
          trackId = 'track-video';
          itemType = 'video';
      }
    }

    addItem(trackId, {
      type: itemType,
      assetId: result.id,
      startFrame: currentFrame, // Add at playhead position
      durationInFrames: result.type === 'audio' ? 150 : 90,
      x: 0,
      y: 0,
      width: DEFAULT_WIDTH,
      height: result.type === 'video' || tab === 'lipsync' ? DEFAULT_HEIGHT : DEFAULT_WIDTH,
      rotation: 0,
      opacity: 1,
      ...(itemType === 'video' && { volume: 1, playbackRate: 1 }),
      ...(itemType === 'audio' && { volume: 1 }),
      ...(itemType === 'avatar' && {
        volume: 1,
        circleSizePercent: DEFAULT_AVATAR_CONFIG.circleSizePercent,
        circleBottomPercent: DEFAULT_AVATAR_CONFIG.circleBottomPercent,
        circleLeftPercent: DEFAULT_AVATAR_CONFIG.circleLeftPercent,
      }),
    });

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  // Remove result
  const handleRemoveResult = (resultId: string) => {
    removeResult({ tab, resultId });
  };

  // Get icon for empty state
  const getEmptyIcon = () => {
    switch (tab) {
      case 'image': return <Image size={48} />;
      case 'video': return <Video size={48} />;
      case 'audio': return <Music size={48} />;
      case 'lipsync': return <Video size={48} />;
    }
  };

  // Get empty message
  const getEmptyMessage = () => {
    switch (tab) {
      case 'image': return t('results.noImages') || 'No images yet. Generate some photos!';
      case 'video': return t('results.noVideos') || 'No videos yet. Generate some videos!';
      case 'audio': return t('results.noAudio') || 'No audio yet. Generate some voice!';
      case 'lipsync': return t('results.noLipsync') || 'No lipsync videos yet. Generate some!';
    }
  };

  return (
    <div className="results-gallery">
      {results.length === 0 ? (
        <div className="results-empty">
          <div className="results-empty-icon">{getEmptyIcon()}</div>
          <span className="results-empty-text">{getEmptyMessage()}</span>
        </div>
      ) : (
        <div className="results-grid">
          {results.map((result) => (
            <div
              key={result.id}
              className="result-card"
              draggable
              onDragStart={(e) => handleDragStart(e, result)}
            >
              <div className="result-drag-handle">
                <GripVertical size={16} />
              </div>

              <div className="result-preview">
                {result.type === 'image' && (
                  <img
                    src={toAbsoluteUrl(result.url)}
                    alt={result.name}
                    className="result-image"
                  />
                )}
                {result.type === 'video' && (
                  <video
                    src={toAbsoluteUrl(result.url)}
                    className="result-video"
                    controls
                    muted
                  />
                )}
                {result.type === 'audio' && (
                  <div className="result-audio-container">
                    <Music size={32} className="result-audio-icon" />
                    <audio
                      src={toAbsoluteUrl(result.url)}
                      controls
                      className="result-audio"
                    />
                  </div>
                )}
              </div>

              <div className="result-info">
                <span className="result-name">{result.name}</span>
                <div className="result-actions">
                  {result.type === 'video' && (
                    <button
                      className="result-action-btn result-share-btn"
                      onClick={() => handleShare(result)}
                      title={t('publish.share')}
                    >
                      <Share2 size={16} />
                    </button>
                  )}
                  <button
                    className="result-action-btn result-add-timeline-btn"
                    onClick={() => handleAddToTimeline(result)}
                    title={t('generate.addToTimeline')}
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    className="result-action-btn result-remove-btn"
                    onClick={() => handleRemoveResult(result.id)}
                    title={t('generate.remove')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PublishModal
        isOpen={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        videoUrl={publishVideoUrl}
      />
    </div>
  );
}
