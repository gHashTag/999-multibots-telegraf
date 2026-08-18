import { useLearn } from '@/hooks/useLearn';
import { useLanguage } from '@/hooks/useLanguage';
import { learnTranslations } from '@/i18n/learn-translations';
import './PlayerStats.css';

const BEE_LEVELS = [
  { id: 'larva', emoji: '🐛', honey: 0, nextHoney: 51 },
  { id: 'worker', emoji: '🐝', honey: 51, nextHoney: 151 },
  { id: 'guard', emoji: '🛡️', honey: 151, nextHoney: 301 },
  { id: 'forager', emoji: '🌸', honey: 301, nextHoney: 501 },
  { id: 'queen', emoji: '👑', honey: 501, nextHoney: 1000 },
] as const;

export function PlayerStats() {
  const { progress, beeLevel, levelProgress } = useLearn();
  const { lang } = useLanguage();
  const t = learnTranslations[lang] || learnTranslations.en;

  const currentLevelIndex = BEE_LEVELS.findIndex(level => level.id === beeLevel);

  return (
    <div className="player-stats">
      <div className="stats-container">
        {/* Honey Display */}
        <div className="honey-display">
          <span className="honey-icon">🍯</span>
          <div className="honey-info">
            <span className="honey-amount">{progress.honey}</span>
            <span className="honey-label">{t.feedback.honey}</span>
          </div>
        </div>

        {/* Evolution Path */}
        <div className="evolution-path">
          <h3 className="evolution-title">{lang === 'ru' ? 'Эволюция пчелы' : 'Bee Evolution'}</h3>
          
          <div className="evolution-track">
            {BEE_LEVELS.map((level, index) => {
              const isUnlocked = progress.honey >= level.honey;
              const isCurrent = index === currentLevelIndex;
              const isPast = index < currentLevelIndex;
              const isNext = index === currentLevelIndex + 1;

              return (
                <div key={level.id} className="evolution-stage">
                  {/* Connection Line */}
                  {index > 0 && (
                    <div className={`evolution-line ${isPast ? 'completed' : ''} ${isCurrent ? 'active' : ''}`}>
                      <div 
                        className="evolution-line-fill"
                        style={{
                          width: isCurrent ? `${levelProgress.percentage}%` : isPast ? '100%' : '0%'
                        }}
                      />
                    </div>
                  )}

                  {/* Level Node */}
                  <div className={`evolution-node ${isUnlocked ? 'unlocked' : 'locked'} ${isCurrent ? 'current' : ''}`}>
                    <div className="node-icon">
                      <span className="node-emoji">{level.emoji}</span>
                      {isCurrent && (
                        <div className="node-pulse" />
                      )}
                    </div>
                    
                    <div className="node-info">
                      <span className="node-name">{t.levels[level.id]}</span>
                      <span className="node-honey">
                        {level.honey} - {level.nextHoney} 🍯
                      </span>
                    </div>

                    {/* Progress for current level */}
                    {isCurrent && (
                      <div className="node-progress">
                        <div className="progress-bar">
                          <div 
                            className="progress-fill"
                            style={{ width: `${levelProgress.percentage}%` }}
                          />
                        </div>
                        <span className="progress-text">
                          {progress.honey} / {levelProgress.next} 🍯
                        </span>
                      </div>
                    )}

                    {/* Next level indicator */}
                    {isNext && (
                      <div className="next-level-badge">
                        {lang === 'ru' ? 'Следующий' : 'Next'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Current Level Info */}
        <div className="current-level-card">
          <div className="level-card-header">
            <span className="level-emoji">{BEE_LEVELS[currentLevelIndex].emoji}</span>
            <div className="level-card-info">
              <h4>{t.levels[beeLevel]}</h4>
              <p className="level-number">{lang === 'ru' ? 'Уровень' : 'Level'} {progress.level}</p>
            </div>
          </div>
          
          <div className="level-progress-bar">
            <div 
              className="level-progress-fill"
              style={{ width: `${levelProgress.percentage}%` }}
            />
          </div>
          
          <div className="level-stats">
            <div className="stat">
              <span className="stat-label">{lang === 'ru' ? 'Текущий' : 'Current'}</span>
              <span className="stat-value">{progress.honey} 🍯</span>
            </div>
            <div className="stat">
              <span className="stat-label">{lang === 'ru' ? 'Следующий уровень' : 'Next Level'}</span>
              <span className="stat-value">{levelProgress.next} 🍯</span>
            </div>
            <div className="stat">
              <span className="stat-label">{lang === 'ru' ? 'Осталось' : 'Remaining'}</span>
              <span className="stat-value">{levelProgress.next - progress.honey} 🍯</span>
            </div>
          </div>
        </div>

        {/* Streak */}
        {progress.streak > 0 && (
          <div className="streak-display">
            <span className="streak-icon">🔥</span>
            <div className="streak-info">
              <span className="streak-number">{progress.streak}</span>
              <span className="streak-label">
                {lang === 'ru' ? 'дней подряд' : 'day streak'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
