import { useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { projectAtom, templatePropsAtom, currentFrameAtom, isPlayingAtom } from '@/atoms';
import { BRAND_COLORS, STATUS_COLORS } from '@vibee/atoms';
import './styles.css';

interface Segment {
  start: number;
  end: number;
  label: string;
  color: string;
}

export function Timeline() {
  const project = useAtomValue(projectAtom);
  const props = useAtomValue(templatePropsAtom);
  const currentFrame = useAtomValue(currentFrameAtom);
  const setCurrentFrame = useSetAtom(currentFrameAtom);
  const setIsPlaying = useSetAtom(isPlayingAtom);

  const fps = project.fps;
  const durationInFrames = project.durationInFrames;

  const totalDuration = durationInFrames / fps;
  const coverDurationFrames = Math.round(props.coverDuration * fps);
  const avatarStartFrame = coverDurationFrames;

  const segments = useMemo(() => {
    const result: { track: string; segments: Segment[] }[] = [];

    // Cover track
    if (coverDurationFrames > 0) {
      result.push({
        track: 'Cover',
        segments: [
          {
            start: 0,
            end: coverDurationFrames / durationInFrames,
            label: 'Cover',
            color: BRAND_COLORS.amber,
          },
        ],
      });
    }

    // Avatar track
    result.push({
      track: 'Avatar',
      segments: [
        {
          start: avatarStartFrame / durationInFrames,
          end: 1,
          label: 'LipSync',
          color: STATUS_COLORS.success,
        },
      ],
    });

    // B-Roll track
    if (props.backgroundVideos.length > 0) {
      const brollDuration = durationInFrames - avatarStartFrame;
      const segmentDuration = brollDuration / props.backgroundVideos.length;
      result.push({
        track: 'B-Roll',
        segments: props.backgroundVideos.map((_, i) => ({
          start:
            (avatarStartFrame + i * segmentDuration) / durationInFrames,
          end:
            (avatarStartFrame + (i + 1) * segmentDuration) / durationInFrames,
          label: `BG ${i + 1}`,
          color: BRAND_COLORS.amber,
        })),
      });
    }

    return result;
  }, [
    coverDurationFrames,
    avatarStartFrame,
    durationInFrames,
    props.backgroundVideos,
  ]);

  const playheadPosition = (currentFrame / durationInFrames) * 100;
  const currentTime = currentFrame / fps;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const newFrame = Math.round(percent * durationInFrames);
    setCurrentFrame(Math.max(0, Math.min(newFrame, durationInFrames - 1)));
    setIsPlaying(false);
  };

  return (
    <div className="timeline">
      <div className="timeline-header">
        <span className="timeline-time">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
        <span className="timeline-frame">
          Frame {currentFrame} / {durationInFrames}
        </span>
      </div>

      <div className="timeline-tracks" onClick={handleTimelineClick}>
        <div
          className="timeline-playhead"
          style={{ left: `${playheadPosition}%` }}
        />

        {segments.map(({ track, segments }) => (
          <div key={track} className="timeline-track">
            <div className="timeline-track-label">{track}</div>
            <div className="timeline-track-segments">
              {segments.map((seg, i) => (
                <div
                  key={i}
                  className="timeline-segment"
                  style={{
                    left: `${seg.start * 100}%`,
                    width: `${(seg.end - seg.start) * 100}%`,
                    backgroundColor: seg.color,
                  }}
                >
                  <span className="timeline-segment-label">{seg.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
