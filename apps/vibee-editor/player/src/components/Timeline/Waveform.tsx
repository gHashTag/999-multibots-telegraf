import { useEffect, useRef, useState, useMemo } from 'react';
import { BRAND_COLORS } from '@vibee/atoms';
import './Waveform.css';

interface WaveformProps {
  audioUrl: string;
  width: number;
  height: number;
  color?: string;
  progressColor?: string;
  progress?: number; // 0-1
  barWidth?: number;
  barGap?: number;
  onClick?: (progress: number) => void;
}

export function Waveform({
  audioUrl,
  width,
  height,
  color = '#666',
  progressColor = BRAND_COLORS.amber,
  progress = 0,
  barWidth = 2,
  barGap = 1,
  onClick,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Calculate number of bars
  const barCount = useMemo(() => {
    return Math.floor(width / (barWidth + barGap));
  }, [width, barWidth, barGap]);

  // Fetch and analyze audio
  useEffect(() => {
    if (!audioUrl) return;

    const analyzeAudio = async () => {
      setIsLoading(true);
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Get channel data
        const channelData = audioBuffer.getChannelData(0);
        const samplesPerBar = Math.floor(channelData.length / barCount);

        const bars: number[] = [];
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          const start = i * samplesPerBar;
          const end = Math.min(start + samplesPerBar, channelData.length);

          for (let j = start; j < end; j++) {
            sum += Math.abs(channelData[j]);
          }

          const avg = sum / (end - start);
          bars.push(avg);
        }

        // Normalize
        const max = Math.max(...bars);
        const normalized = bars.map((bar) => (max > 0 ? bar / max : 0));

        setWaveformData(normalized);
        audioContext.close();
      } catch (error) {
        console.error('Failed to analyze audio:', error);
        // Generate fake waveform data for fallback
        const fakeData = Array.from({ length: barCount }, () => 0.2 + Math.random() * 0.6);
        setWaveformData(fakeData);
      } finally {
        setIsLoading(false);
      }
    };

    analyzeAudio();
  }, [audioUrl, barCount]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw bars
    const progressX = progress * width;

    waveformData.forEach((amplitude, i) => {
      const x = i * (barWidth + barGap);
      const barHeight = Math.max(2, amplitude * height * 0.8);
      const y = (height - barHeight) / 2;

      // Determine if this bar is before or after progress
      const isPlayed = x < progressX;

      ctx.fillStyle = isPlayed ? progressColor : color;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      ctx.fill();
    });
  }, [waveformData, width, height, color, progressColor, progress, barWidth, barGap]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onClick) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newProgress = x / width;
    onClick(Math.max(0, Math.min(1, newProgress)));
  };

  if (isLoading) {
    return (
      <div className="waveform waveform--loading" style={{ width, height }}>
        <div className="waveform__skeleton">
          {Array.from({ length: Math.min(barCount, 30) }).map((_, i) => (
            <div
              key={i}
              className="waveform__skeleton-bar"
              style={{
                width: barWidth,
                height: `${20 + Math.random() * 60}%`,
                animationDelay: `${i * 0.03}s`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="waveform"
      style={{ width, height, cursor: onClick ? 'pointer' : 'default' }}
      onClick={handleClick}
    />
  );
}

// Mini waveform for track items (simplified version)
interface MiniWaveformProps {
  width: number;
  height: number;
  color?: string;
  progress?: number;
}

export function MiniWaveform({
  width,
  height,
  color = 'currentColor',
  progress = 0,
}: MiniWaveformProps) {
  const bars = useMemo(() => {
    const count = Math.floor(width / 4);
    return Array.from({ length: count }, () => 0.3 + Math.random() * 0.7);
  }, [width]);

  return (
    <svg className="mini-waveform" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {bars.map((amp, i) => {
        const barHeight = amp * height * 0.8;
        const x = i * 4 + 1;
        const y = (height - barHeight) / 2;
        const isPlayed = (i / bars.length) < progress;

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={2}
            height={barHeight}
            rx={1}
            fill={color}
            opacity={isPlayed ? 1 : 0.4}
          />
        );
      })}
    </svg>
  );
}
