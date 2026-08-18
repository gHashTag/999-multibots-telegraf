// Script Preview Component
// Shows estimated output before generation

import { Mic, Image, Film, MessageSquare, Clock, FileText } from 'lucide-react';
import type { ScriptInput } from '@/atoms/script';
import './ScriptPreview.css';

interface ScriptPreviewProps {
  input: ScriptInput;
  lang: 'ru' | 'en';
}

export function ScriptPreview({ input, lang }: ScriptPreviewProps) {
  // Calculate estimates
  const estimatedWordCount = calculateWordCount(input.duration);
  const estimatedBrollCount = calculateBrollCount(input.duration);
  const estimatedDuration = `${input.duration}s`;

  return (
    <div className="script-preview">
      <div className="script-preview-header">
        <FileText size={16} />
        <h4>{lang === 'ru' ? 'Предпросмотр' : 'Preview'}</h4>
      </div>

      <div className="script-preview-stats">
        <div className="script-preview-stat">
          <Clock size={14} />
          <span>{estimatedDuration}</span>
        </div>
        <div className="script-preview-stat">
          <Mic size={14} />
          <span>~{estimatedWordCount} {lang === 'ru' ? 'слов' : 'words'}</span>
        </div>
        <div className="script-preview-stat">
          <Film size={14} />
          <span>{estimatedBrollCount} B-roll</span>
        </div>
      </div>

      <div className="script-preview-sections">
        <div className="script-preview-section">
          <div className="script-preview-section-icon">
            <Mic size={16} />
          </div>
          <div className="script-preview-section-content">
            <h5>{lang === 'ru' ? 'Озвучка' : 'Voiceover'}</h5>
            <p>
              {lang === 'ru'
                ? `Текст сценария (~${estimatedWordCount} слов)`
                : `Script text (~${estimatedWordCount} words)`}
            </p>
          </div>
        </div>

        <div className="script-preview-section">
          <div className="script-preview-section-icon">
            <Image size={16} />
          </div>
          <div className="script-preview-section-content">
            <h5>{lang === 'ru' ? 'Обложка' : 'Cover'}</h5>
            <p>
              {lang === 'ru'
                ? 'Промпт для генерации обложки'
                : 'Image generation prompt'}
            </p>
          </div>
        </div>

        <div className="script-preview-section">
          <div className="script-preview-section-icon">
            <Film size={16} />
          </div>
          <div className="script-preview-section-content">
            <h5>B-Roll</h5>
            <p>
              {lang === 'ru'
                ? `${estimatedBrollCount} видео-сегментов с таймингом`
                : `${estimatedBrollCount} video segments with timing`}
            </p>
          </div>
        </div>

        <div className="script-preview-section">
          <div className="script-preview-section-icon">
            <MessageSquare size={16} />
          </div>
          <div className="script-preview-section-content">
            <h5>{lang === 'ru' ? 'Посты' : 'Captions'}</h5>
            <p>
              {lang === 'ru'
                ? '4 платформы (Instagram, TikTok, YouTube, Telegram)'
                : '4 platforms (Instagram, TikTok, YouTube, Telegram)'}
            </p>
          </div>
        </div>
      </div>

      <div className="script-preview-note">
        <span>💡</span>
        <p>
          {lang === 'ru'
            ? 'Генерация займёт 10-30 секунд в зависимости от загрузки сервера'
            : 'Generation will take 10-30 seconds depending on server load'}
        </p>
      </div>
    </div>
  );
}

// Helper functions
function calculateWordCount(duration: number): string {
  const counts: Record<number, string> = {
    15: '25-35',
    30: '50-70',
    60: '100-130',
    90: '150-200',
  };
  return counts[duration] || '50-70';
}

function calculateBrollCount(duration: number): string {
  if (duration <= 15) return '2-3';
  if (duration <= 30) return '3-4';
  if (duration <= 60) return '4-5';
  return '5-6';
}
