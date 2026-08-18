// Script Generation Progress Indicator
// Shows current stage of generation

import { Loader2, Check } from 'lucide-react';
import './ScriptProgress.css';

interface ScriptProgressProps {
  lang: 'ru' | 'en';
}

export function ScriptProgress({ lang }: ScriptProgressProps) {
  // For now, just show animated progress
  // In future, can be enhanced with actual stages from backend
  
  const stages = [
    { id: 'llm', labelRu: 'Генерация текста', labelEn: 'Generating text' },
    { id: 'voiceover', labelRu: 'Создание озвучки', labelEn: 'Creating voiceover' },
    { id: 'cover', labelRu: 'Подготовка обложки', labelEn: 'Preparing cover' },
    { id: 'broll', labelRu: 'Формирование B-roll', labelEn: 'Forming B-roll' },
    { id: 'captions', labelRu: 'Генерация постов', labelEn: 'Generating captions' },
  ];

  // Simulate progress (in real implementation, this would come from backend)
  const currentStage = 0; // 0-4

  return (
    <div className="script-progress">
      <div className="script-progress-header">
        <Loader2 size={18} className="spinning" />
        <h4>
          {lang === 'ru' ? 'Генерация сценария...' : 'Generating script...'}
        </h4>
      </div>

      <div className="script-progress-bar">
        <div 
          className="script-progress-bar-fill" 
          style={{ width: `${((currentStage + 1) / stages.length) * 100}%` }}
        />
      </div>

      <div className="script-progress-stages">
        {stages.map((stage, index) => {
          const isCompleted = index < currentStage;
          const isCurrent = index === currentStage;
          const isPending = index > currentStage;

          return (
            <div
              key={stage.id}
              className={`script-progress-stage ${
                isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'
              }`}
            >
              <div className="script-progress-stage-icon">
                {isCompleted ? (
                  <Check size={14} />
                ) : isCurrent ? (
                  <Loader2 size={14} className="spinning" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span className="script-progress-stage-label">
                {lang === 'ru' ? stage.labelRu : stage.labelEn}
              </span>
            </div>
          );
        })}
      </div>

      <div className="script-progress-note">
        {lang === 'ru'
          ? 'Обычно занимает 10-30 секунд'
          : 'Usually takes 10-30 seconds'}
      </div>
    </div>
  );
}
