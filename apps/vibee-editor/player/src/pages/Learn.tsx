import { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Editor from '@monaco-editor/react';
import { LearnHeader } from '@/components/learn/LearnHeader';
import { PlayerStats } from '@/components/learn/PlayerStats';
import { useLearn } from '@/hooks/useLearn';
import { compiler } from '../components/learn/compiler';
import { World, Lesson, CompilationResult } from '../components/learn/types';
import { ArrowLeft, ArrowRight, Play, Lightbulb, Check, AlertCircle, BookOpen, Lock } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { learnTranslations } from '@/i18n/learn-translations';
import './Learn.css';

// Custom amber theme for VIBEE code
const vibeeTheme: { [key: string]: React.CSSProperties } = {
  'code[class*="language-"]': {
    color: '#fbbf24',
    background: 'none',
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace",
    fontSize: '0.85rem',
  },
  'pre[class*="language-"]': {
    color: '#fbbf24',
    background: 'transparent',
    margin: 0,
    padding: '16px',
  },
  keyword: { color: '#f59e0b' },
  string: { color: '#a3e635' },
  comment: { color: '#6b7280' },
  function: { color: '#fbbf24' },
  punctuation: { color: '#9ca3af' },
  number: { color: '#fcd34d' },
};

function LearnPage() {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [currentWorldIndex, setCurrentWorldIndex] = useState(0);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [vibeeCode, setVibeeCode] = useState('');
  const [result, setResult] = useState<CompilationResult | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const { progress, addHoney, completeLesson, updateStreak, beeLevel, levelProgress, isLessonCompleted } = useLearn();
  const { lang } = useLanguage();
  const t = learnTranslations[lang] || learnTranslations.en;

  // Early return if progress not loaded yet
  if (!progress) {
    return (
      <div className="learn-loading">
        <div className="learn-loading-spinner" />
        <p>{lang === 'ru' ? 'Загрузка...' : 'Loading...'}</p>
      </div>
    );
  }

  // Load worlds
  useEffect(() => {
    const loadWorlds = async () => {
      try {
        const worldFiles = ['world-1', 'world-2', 'world-3', 'world-4', 'world-5'];
        const loadedWorlds = await Promise.all(
          worldFiles.map(async (file) => {
            // Try to load language-specific version first
            const langFile = lang === 'ru' ? `${file}-ru.json` : `${file}.json`;
            try {
              const response = await fetch(`/lessons/${langFile}`);
              if (response.ok) {
                return response.json();
              }
            } catch (e) {
              console.log(`No ${lang} version for ${file}, falling back to English`);
            }
            // Fallback to English
            const response = await fetch(`/lessons/${file}.json`);
            return response.json();
          })
        );
        setWorlds(loadedWorlds);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load worlds:', error);
        setLoading(false);
      }
    };

    loadWorlds();
    updateStreak();
  }, [lang]);

  // Update code when lesson changes
  useEffect(() => {
    if (worlds.length > 0 && worlds[currentWorldIndex]?.lessons) {
      const lesson = worlds[currentWorldIndex].lessons[currentLessonIndex];
      if (lesson) {
        setVibeeCode(lesson.vibeeCode);
        setShowHints(false);
        setHintIndex(0);
        setCompleted(isLessonCompleted(lesson.id));
        
        // Show Gleam code preview (without running)
        const compilationResult = compiler.compile(lesson.vibeeCode);
        setResult({
          ...compilationResult,
          output: '', // Don't show output until user clicks "Run"
        });
      }
    }
  }, [currentWorldIndex, currentLessonIndex, worlds, isLessonCompleted]);

  if (loading) {
    return (
      <div className="learn-loading">
        <div className="learn-loading-spinner" />
        <p>{lang === 'ru' ? 'Загрузка уроков...' : 'Loading lessons...'}</p>
      </div>
    );
  }

  if (worlds.length === 0) {
    return (
      <div className="learn-error">
        <p>{lang === 'ru' ? 'Не удалось загрузить уроки. Попробуйте снова.' : 'Failed to load lessons. Please try again.'}</p>
      </div>
    );
  }

  const currentWorld = worlds[currentWorldIndex];
  const currentLesson = currentWorld?.lessons?.[currentLessonIndex];

  if (!currentLesson) {
    return (
      <div className="learn-error">
        <p>{lang === 'ru' ? 'Урок не найден.' : 'Lesson not found.'}</p>
      </div>
    );
  }

  const handleCompile = () => {
    const compilationResult = compiler.compile(vibeeCode);
    console.log('Compilation result:', compilationResult);
    setResult(compilationResult);

    if (compilationResult.success &&
        compilationResult.output.trim() === currentLesson.expectedOutput.trim()) {
      handleSuccess();
    }
  };

  const handleSuccess = () => {
    if (!completed) {
      setCompleted(true);
      addHoney(currentLesson.honeyReward);
      completeLesson(currentLesson.id);
      
      // Trigger honey animation
      const honeyElement = document.querySelector('.stat-item.honey');
      if (honeyElement) {
        honeyElement.classList.add('honey-gained');
        setTimeout(() => {
          honeyElement.classList.remove('honey-gained');
        }, 1000);
      }
    }
  };

  const handleNext = () => {
    if (currentLessonIndex < currentWorld.lessons.length - 1) {
      setCurrentLessonIndex(currentLessonIndex + 1);
    } else if (currentWorldIndex < worlds.length - 1) {
      setCurrentWorldIndex(currentWorldIndex + 1);
      setCurrentLessonIndex(0);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrevious = () => {
    if (currentLessonIndex > 0) {
      setCurrentLessonIndex(currentLessonIndex - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleShowHint = () => {
    setShowHints(true);
    if (hintIndex < currentLesson.hints.length - 1) {
      setHintIndex(hintIndex + 1);
    }
  };

  const handleWorldChange = (worldIndex: number) => {
    const requiredLevel = worlds[worldIndex].requiredLevel;
    if (progress.level >= requiredLevel) {
      setCurrentWorldIndex(worldIndex);
      setCurrentLessonIndex(0);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'difficulty-easy';
      case 'medium': return 'difficulty-medium';
      case 'hard': return 'difficulty-hard';
      default: return '';
    }
  };



  return (
    <div className="learn-page">
      {/* Header with integrated stats */}
      <LearnHeader />

      <main className="learn-main">
        {/* Lesson Header - Description */}
        <section className="lesson-header">
          <div className="lesson-info">
            <div className="lesson-title-row">
              <h2>{currentLesson.title}</h2>
              <span className={`difficulty-badge ${getDifficultyColor(currentLesson.difficulty)}`}>
                {currentLesson.difficulty.toUpperCase()}
              </span>
            </div>
            <p className="lesson-description">{currentLesson.description}</p>

            <div className="lesson-explanation">
              <BookOpen size={20} />
              <div>
                <strong>{lang === 'ru' ? 'Изучите:' : 'Learn:'}</strong>
                <p>{currentLesson.explanation}</p>
              </div>
            </div>
          </div>

          <div className="lesson-reward">
            <span className="reward-icon">🍯</span>
            <span className="reward-amount">+{currentLesson.honeyReward}</span>
            <span className="reward-label">{t.feedback.honey}</span>
          </div>
        </section>

        {/* Code Editor Section */}
        <section className="editor-section">
          <div className="editor-panels">
            {/* Vibee Code Input */}
            <div className="editor-panel vibee-panel">
              <div className="panel-header vibee-header">
                <span>🐝 {t.editor.vibeeCode}</span>
              </div>
              <Editor
                height="100%"
                defaultLanguage="python"
                value={vibeeCode}
                onChange={(value) => {
                  console.log('Code changed:', value);
                  setVibeeCode(value || '');
                }}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace",
                }}
              />
            </div>

            {/* Gleam Code Output */}
            <div className="editor-panel gleam-panel">
              <div className="panel-header gleam-header">
                <span>⚡ {t.editor.gleamCode}</span>
              </div>
              <div className="code-output">
                <SyntaxHighlighter
                  language="rust"
                  style={vscDarkPlus}
                  customStyle={{
                    background: 'transparent',
                    margin: 0,
                    padding: '16px',
                    fontSize: '0.85rem',
                  }}
                >
                  {result?.gleamCode || `// ${t.editor.compiling}`}
                </SyntaxHighlighter>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="editor-controls">
            <button className="run-btn" onClick={handleCompile}>
              <Play size={20} />
              {t.buttons.runCode}
            </button>

            <button className="hint-btn" onClick={handleShowHint}>
              <Lightbulb size={20} />
              {t.buttons.hint} ({hintIndex + 1}/{currentLesson.hints.length})
            </button>

            {completed && (
              <div className="success-badge">
                <Check size={20} />
                {lang === 'ru' ? 'Завершено!' : 'Complete!'}
              </div>
            )}
          </div>

          {/* Hints */}
          {showHints && (
            <div className="hints-display">
              <Lightbulb size={20} />
              <div>
                <strong>{t.buttons.hint}:</strong>
                <p>{currentLesson.hints[hintIndex]}</p>
              </div>
            </div>
          )}

          {/* Output */}
          <div className="output-section">
            <div className="output-panel">
              <div className="panel-header output-header">
                <span>📤 {t.editor.output}</span>
              </div>
              <div className="output-content">
                {result?.errors.length ? (
                  <div className="output-error">
                    {result.errors.map((error, i) => (
                      <div key={i} className="error-item">
                        <AlertCircle size={16} />
                        <span>Line {error.line}: {error.message}</span>
                      </div>
                    ))}
                  </div>
                ) : result?.output ? (
                  <div className="output-success">{result.output}</div>
                ) : (
                  <div className="output-empty">{lang === 'ru' ? 'Запустите код, чтобы увидеть результат...' : 'Run your code to see output...'}</div>
                )}
              </div>
            </div>

            <div className="expected-panel">
              <div className="panel-header expected-header">
                <span>🎯 {t.editor.expectedOutput}</span>
              </div>
              <div className="expected-content">
                {currentLesson.expectedOutput}
              </div>
            </div>
          </div>
        </section>

        {/* Player Stats - Evolution Display */}
        <PlayerStats />

        {/* World Selector - Compact Horizontal */}
        <section className="learn-worlds">
          <div className="worlds-scroll">
            {worlds.map((world, index) => {
              const isUnlocked = progress.level >= world.requiredLevel;
              const isActive = index === currentWorldIndex;
              return (
                <button
                  key={world.id}
                  className={`world-chip ${isActive ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}`}
                  onClick={() => handleWorldChange(index)}
                  disabled={!isUnlocked}
                  title={world.title}
                >
                  {!isUnlocked && <Lock size={14} />}
                  <span className="world-num">{index + 1}</span>
                  <span className="world-name">{world.title}</span>
                  {isActive && <span className="active-indicator">●</span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* Navigation */}
        <section className="lesson-navigation">
          <button
            className="nav-btn prev-btn"
            onClick={handlePrevious}
            disabled={currentLessonIndex === 0}
          >
            <ArrowLeft size={20} />
            {t.buttons.previous}
          </button>

          {completed && (
            <div className="completion-badge">
              ✅ {t.feedback.lessonComplete} +{currentLesson.honeyReward} 🍯
            </div>
          )}

          <button
            className="nav-btn next-btn"
            onClick={handleNext}
            disabled={!completed || (currentLessonIndex === currentWorld.lessons.length - 1 && currentWorldIndex === worlds.length - 1)}
          >
            {t.buttons.next}
            <ArrowRight size={20} />
          </button>
        </section>

        {/* Lesson Progress */}
        <section className="lesson-progress">
          <h3>{t.lessonProgress}</h3>
          <div className="lesson-dots">
            {currentWorld.lessons.map((lesson: Lesson, index: number) => (
              <button
                key={lesson.id}
                className={`lesson-dot ${
                  index === currentLessonIndex ? 'active' :
                  progress.completedLessons?.includes(lesson.id) ? 'completed' : ''
                }`}
                onClick={() => setCurrentLessonIndex(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="learn-footer">
        <p>{t.footer.description}</p>
        <p className="footer-credit">{t.footer.credits}</p>
      </footer>
    </div>
  );
}

export default LearnPage;
