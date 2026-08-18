import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { Header } from '@/components/Header';
import './Chat.css';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: number;
}

interface UploadedFiles {
  video: File | null;
  photo: File | null;
  audio: File | null;
}

type ChatState = 'initial' | 'composition_selected' | 'cloning_video' | 'cloning_photo' | 'cloning_text' | 'rendering';

function ChatPage() {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFiles>({
    video: null,
    photo: null,
    audio: null,
  });
  const [isTyping, setIsTyping] = useState(false);
  const [progress, setProgress] = useState<{ text: string; percent: number } | null>(null);
  const [chatState, setChatState] = useState<ChatState>('initial');
  const [selectedComposition, setSelectedComposition] = useState<string>('');
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    addAgentMessage(
      "Привет! Я помогу создать крутой рилс. Что будем делать?\n\n" +
      "1. 🎤 Talking head с аватаром\n" +
      "2. ✂️ Split-screen стиль\n" +
      "3. 🏭 Массовая генерация вариаций\n" +
      "4. 📝 Текстовая анимация\n" +
      "5. 🎬 Брендовое интро\n\n" +
      "🔥 НОВИНКА: Клонирование рилса!\n" +
      "6. 📹 Клонировать существующий рилс"
    );
    
    setSuggestions([
      "Talking head",
      "Split-screen",
      "Клонировать рилс",
      "Текстовая анимация"
    ]);
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const addMessage = (text: string, isUser: boolean) => {
    const newMessage: Message = {
      id: Date.now().toString() + Math.random(),
      text,
      isUser,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const addAgentMessage = (text: string) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      addMessage(text, false);
    }, 1000);
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    addMessage(userMessage, true);
    setInput('');
    setSuggestions([]);

    handleUserInput(userMessage);
  };

  const handleSuggestionClick = (suggestion: string) => {
    addMessage(suggestion, true);
    setSuggestions([]);
    handleUserInput(suggestion);
  };

  const handleUserInput = (text: string) => {
    const lowerText = text.toLowerCase();

    if (chatState === 'initial') {
      if (lowerText.includes('talking') || lowerText === '1') {
        setSelectedComposition('Talking Head');
        setChatState('composition_selected');
        addAgentMessage(
          "🎤 Отлично! Выбрана композиция: Talking Head с круглым аватаром.\n\n" +
          "Теперь настроим параметры:\n" +
          "- Видео с аватаром?\n" +
          "- Фоновые видео (B-roll)?\n" +
          "- Музыка?"
        );
        setSuggestions(["Видео с аватаром", "Добавить B-roll", "Выбрать музыку"]);
      } else if (lowerText.includes('split') || lowerText === '2') {
        setSelectedComposition('Split-screen');
        setChatState('composition_selected');
        addAgentMessage(
          "✂️ Отлично! Выбрана композиция: Split-screen.\n\n" +
          "Загрузи два видео для левой и правой части экрана."
        );
        setSuggestions(["Загрузить видео"]);
      } else if (lowerText.includes('клон') || lowerText === '6') {
        setChatState('cloning_video');
        addAgentMessage(
          "📹 Отлично! Запускаю режим клонирования.\n\n" +
          "Загрузи видео, которое хочешь клонировать (нажми 🎥 внизу)."
        );
        setSuggestions([]);
      } else if (lowerText.includes('вариац') || lowerText === '3') {
        setSelectedComposition('Variations');
        setChatState('composition_selected');
        addAgentMessage(
          "🏭 Отлично! Массовая генерация вариаций.\n\n" +
          "Загрузи базовое видео, и я создам 10 вариаций с разными стилями."
        );
        setSuggestions(["Загрузить видео"]);
      } else if (lowerText.includes('текст') || lowerText === '4') {
        setSelectedComposition('Text Animation');
        setChatState('composition_selected');
        addAgentMessage(
          "📝 Отлично! Текстовая анимация.\n\n" +
          "Напиши текст, который нужно анимировать."
        );
        setSuggestions([]);
      } else if (lowerText.includes('интро') || lowerText === '5') {
        setSelectedComposition('Branded Intro');
        setChatState('composition_selected');
        addAgentMessage(
          "🎬 Отлично! Брендовое интро.\n\n" +
          "Загрузи логотип и выбери стиль анимации."
        );
        setSuggestions(["Загрузить логотип"]);
      } else {
        addAgentMessage(
          "Выбери один из вариантов выше или опиши подробнее!"
        );
        setSuggestions([
          "Talking head",
          "Клонировать рилс",
          "Текстовая анимация"
        ]);
      }
    } else if (chatState === 'composition_selected') {
      if (lowerText.includes('видео') || lowerText.includes('аватар')) {
        addAgentMessage(
          "Отлично! Загрузи видео с аватаром (нажми 🎥 внизу)."
        );
      } else if (lowerText.includes('b-roll') || lowerText.includes('фон')) {
        addAgentMessage(
          "Отлично! Загрузи фоновые видео (нажми 🎥 внизу)."
        );
      } else if (lowerText.includes('музык')) {
        addAgentMessage(
          "Отлично! Загрузи музыкальный трек (нажми 🎵 внизу)."
        );
      } else {
        addAgentMessage(
          "Выбери параметр из списка выше или загрузи файлы."
        );
      }
    } else if (chatState === 'cloning_text') {
      addAgentMessage(
        "✅ Отлично! Текст получен.\n\n" +
        "Запускаю процесс клонирования:\n" +
        "1. Генерация озвучки через ElevenLabs...\n" +
        "2. Создание lipsync через Hedra...\n" +
        "3. Рендеринг финального видео..."
      );
      setChatState('rendering');
      startRendering();
    }
  };

  const handleFileUpload = (type: 'video' | 'photo' | 'audio', file: File) => {
    setUploadedFiles(prev => ({ ...prev, [type]: file }));
    
    const emoji = type === 'video' ? '🎥' : type === 'photo' ? '📷' : '🎵';
    addMessage(`Загружен файл: ${emoji} ${file.name}`, true);

    if (chatState === 'cloning_video' && type === 'video') {
      addAgentMessage(
        "🔍 Анализирую видео через Gemini 3 Pro Preview...\n\n" +
        "Это займет 10-15 секунд."
      );
      
      setTimeout(() => {
        setChatState('cloning_photo');
        addAgentMessage(
          "✅ Анализ завершен!\n\n" +
          "📊 Что я нашел:\n" +
          "- Layout: Circle overlay (аватар внизу слева)\n" +
          "- Размер аватара: 25% от ширины\n" +
          "- Эффекты: glassmorphism, vignette (0.7)\n" +
          "- Цвета: #1a1a2e, #e94560\n\n" +
          "Для клонирования мне нужны:\n" +
          "🔴 Фото твоего лица (нажми 📷)\n" +
          "🔴 Текст для озвучки (напиши здесь)"
        );
        setSuggestions(["Загрузить фото", "Написать текст"]);
      }, 2000);
    } else if (chatState === 'cloning_photo' && type === 'photo') {
      addAgentMessage(
        "✅ Фото получено!\n\n" +
        "Теперь напиши текст, который я озвучу и синхронизирую с губами."
      );
      setChatState('cloning_text');
      setSuggestions([]);
    }
  };

  const handleRemoveFile = (type: 'video' | 'photo' | 'audio') => {
    setUploadedFiles(prev => ({ ...prev, [type]: null }));
  };

  const startRendering = () => {
    setProgress({ text: 'Генерация озвучки...', percent: 0 });
    
    const steps = [
      { text: 'Генерация озвучки через ElevenLabs...', percent: 20 },
      { text: 'Создание lipsync через Hedra...', percent: 50 },
      { text: 'Рендеринг финального видео...', percent: 80 },
      { text: 'Готово!', percent: 100 },
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setProgress(step);
        if (step.percent === 100) {
          setTimeout(() => {
            setProgress(null);
            addAgentMessage(
              "🎉 Готово! Твой клон рилса создан!\n\n" +
              "📹 Видео: vibee_clone_" + Date.now() + ".mp4\n" +
              "⏱️ Длительность: 15 сек\n" +
              "📊 Качество: 1080p\n\n" +
              "Хочешь создать еще один?"
            );
            setChatState('initial');
            setSuggestions(["Создать еще", "Клонировать другой"]);
          }, 1000);
        }
      }, (index + 1) * 2000);
    });
  };

  return (
    <div className="chat-page">
      <Header />
      <div className="chat-title">
        <h1>🎬 VIBEE Reels Creator</h1>
        <p>AI-powered Instagram Reels клонирование</p>
      </div>

      <div className="chat-container" ref={chatContainerRef}>
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.isUser ? 'user' : 'agent'}`}>
              <div className="message-content">{msg.text}</div>
            </div>
          ))}

          {isTyping && (
            <div className="message agent">
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  className="suggestion-btn"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {(uploadedFiles.video || uploadedFiles.photo || uploadedFiles.audio) && (
            <div className="uploaded-files">
              {uploadedFiles.video && (
                <div className="file-preview">
                  🎥 {uploadedFiles.video.name}
                  <button
                    className="remove-file"
                    onClick={() => handleRemoveFile('video')}
                  >
                    ×
                  </button>
                </div>
              )}
              {uploadedFiles.photo && (
                <div className="file-preview">
                  📷 {uploadedFiles.photo.name}
                  <button
                    className="remove-file"
                    onClick={() => handleRemoveFile('photo')}
                  >
                    ×
                  </button>
                </div>
              )}
              {uploadedFiles.audio && (
                <div className="file-preview">
                  🎵 {uploadedFiles.audio.name}
                  <button
                    className="remove-file"
                    onClick={() => handleRemoveFile('audio')}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          )}

          {progress && (
            <div className="progress-container">
              <div className="progress-text">{progress.text}</div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress.percent}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="chat-input-area">
        <div className="file-upload-buttons">
          <label className="file-upload-btn">
            🎥
            <input
              type="file"
              accept="video/*"
              onChange={(e) => e.target.files?.[0] && handleFileUpload('video', e.target.files[0])}
            />
          </label>
          <label className="file-upload-btn">
            📷
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleFileUpload('photo', e.target.files[0])}
            />
          </label>
          <label className="file-upload-btn">
            🎵
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => e.target.files?.[0] && handleFileUpload('audio', e.target.files[0])}
            />
          </label>
        </div>

        <div className="chat-input-container">
          <input
            type="text"
            className="chat-input"
            placeholder={t('chat.messagePlaceholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          />

          <button className="send-btn" onClick={handleSend}>
            {t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
