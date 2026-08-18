// ===============================
// Sound Attribution Component
// TikTok-style sound/music display
// ===============================

import { useState, useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { Music2, Plus, Users, Play, Pause, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import './SoundAttribution.css';

// Types
export interface Sound {
  id: string;
  name: string;
  artistName: string;
  artistAvatar?: string;
  coverUrl?: string;
  audioUrl: string;
  duration: number;
  usesCount: number;
  isOriginal?: boolean;
}

// Atoms
export const currentSoundAtom = atom<Sound | null>(null);
export const savedSoundsAtom = atomWithStorage<Sound[]>('vibee-saved-sounds', []);

interface SoundAttributionProps {
  sound?: Sound;
  size?: 'small' | 'medium' | 'large';
  showUseButton?: boolean;
  onUse?: (sound: Sound) => void;
}

export function SoundAttribution({
  sound,
  size = 'medium',
  showUseButton = false,
  onUse,
}: SoundAttributionProps) {
  const { t } = useLanguage();

  if (!sound) {
    return (
      <div className={`sound-attribution sound-attribution--${size} sound-attribution--empty`}>
        <Music2 size={size === 'small' ? 14 : 18} />
        <span>{t('sound.original')}</span>
      </div>
    );
  }

  return (
    <div className={`sound-attribution sound-attribution--${size}`}>
      <div className="sound-attribution__disc">
        {sound.coverUrl ? (
          <img src={sound.coverUrl} alt="" />
        ) : (
          <Music2 size={16} />
        )}
      </div>

      <div className="sound-attribution__info">
        <span className="sound-attribution__name">{sound.name}</span>
        <span className="sound-attribution__artist">{sound.artistName}</span>
      </div>

      {showUseButton && onUse && (
        <button
          className="sound-attribution__use"
          onClick={() => onUse(sound)}
        >
          <Plus size={16} />
          {t('sound.use')}
        </button>
      )}
    </div>
  );
}

// Sound Detail Modal
interface SoundDetailProps {
  sound: Sound;
  isOpen: boolean;
  onClose: () => void;
  onUse: (sound: Sound) => void;
}

export function SoundDetail({ sound, isOpen, onClose, onUse }: SoundDetailProps) {
  const { t } = useLanguage();
  const [isPlaying, setIsPlaying] = useState(false);
  const [savedSounds, setSavedSounds] = useAtom(savedSoundsAtom);

  const isSaved = savedSounds.some(s => s.id === sound.id);

  const handleSave = useCallback(() => {
    if (isSaved) {
      setSavedSounds(savedSounds.filter(s => s.id !== sound.id));
    } else {
      setSavedSounds([...savedSounds, sound]);
    }
  }, [sound, isSaved, savedSounds, setSavedSounds]);

  const handleUse = useCallback(() => {
    onUse(sound);
    onClose();
  }, [sound, onUse, onClose]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  if (!isOpen) return null;

  return (
    <div className="sound-detail-overlay" onClick={onClose}>
      <div className="sound-detail" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sound-detail__header">
          <div className="sound-detail__cover">
            {sound.coverUrl ? (
              <img src={sound.coverUrl} alt="" />
            ) : (
              <div className="sound-detail__cover-placeholder">
                <Music2 size={32} />
              </div>
            )}
            <button
              className="sound-detail__play"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
          </div>

          <div className="sound-detail__info">
            <h2 className="sound-detail__name">{sound.name}</h2>
            <p className="sound-detail__artist">{sound.artistName}</p>
            <div className="sound-detail__meta">
              <span><Users size={14} /> {formatCount(sound.usesCount)} {t('sound.videos')}</span>
              <span>{formatDuration(sound.duration)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="sound-detail__actions">
          <button className="sound-detail__btn sound-detail__btn--primary" onClick={handleUse}>
            <Plus size={18} />
            {t('sound.useThis')}
          </button>
          <button
            className={`sound-detail__btn ${isSaved ? 'sound-detail__btn--saved' : ''}`}
            onClick={handleSave}
          >
            {isSaved ? t('sound.saved') : t('sound.save')}
          </button>
        </div>

        {/* Original indicator */}
        {sound.isOriginal && (
          <div className="sound-detail__original">
            <Music2 size={14} />
            {t('sound.originalSound')}
          </div>
        )}
      </div>
    </div>
  );
}

// Marquee animation for long sound names
export function SoundMarquee({ text, className = '' }: { text: string; className?: string }) {
  const shouldAnimate = text.length > 25;

  return (
    <div className={`sound-marquee ${className} ${shouldAnimate ? 'sound-marquee--animate' : ''}`}>
      <span className="sound-marquee__text">{text}</span>
      {shouldAnimate && <span className="sound-marquee__text">{text}</span>}
    </div>
  );
}
