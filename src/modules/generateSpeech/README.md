# 🎙️ Модуль: Генерация Речи (`generateSpeech`)

Этот модуль отвечает за преобразование текста в речь с использованием ElevenLabs API.

## 📜 Назначение

- Принимает текст, ID голоса ElevenLabs и информацию о пользователе.
- Взаимодействует с зависимостями для:
    - Проверки существования пользователя и обновления его уровня (`supabase`).
    - Расчета стоимости операции (`priceCalculator`).
    - Проверки и списания баланса пользователя (`balanceProcessor`).
    - Получения инстанса Telegram API для нужного бота (`telegramApiProvider`).
    - Отправки уведомления о начале генерации (`telegram`).
    - Вызова ElevenLabs API для генерации аудиопотока (`elevenlabs`).
    - Сохранения аудиопотока во временный файл (`fs`, `path`, `os`).
    - Отправки сгенерированного аудиофайла и сообщения о балансе пользователю (`telegram`).
    - Логирования операций (`logger`).
    - Обработки и отправки уведомлений об ошибках (`errorHandlers`).
- Возвращает путь к локально сохраненному аудиофайлу.

## ⚙️ Зависимости (`GenerateSpeechDependencies`)

Модуль требует явного внедрения следующих зависимостей:

```typescript
// Упрощенный интерфейс логгера
interface MinimalLogger { /* ... */ }
// Интерфейс клиента ElevenLabs API
interface ElevenLabsClient { /* ... */ }
// Интерфейс для операций с файловой системой (createWriteStream)
interface FileSystemOps { /* ... */ }
// Интерфейс для работы с путями (join)
interface PathOps { /* ... */ }
// Интерфейс для работы с OS (tmpdir)
interface OsOps { /* ... */ }
// Интерфейс для функций Supabase (getUserByTelegramIdString, updateUserLevelPlusOne)
interface SupabaseUserOps { /* ... */ }
// Интерфейс для функций обработки ошибок (sendServiceErrorToUser, sendServiceErrorToAdmin)
interface ErrorHandlerOps { /* ... */ }
// Тип для функции расчета цены
type PriceCalculatorFunction = (mode: ModeEnum, params?: any) => { stars: number } | null;
// Тип для функции обработки баланса
type BalanceProcessorFunction = (params: { /* ... */ }) => Promise<BalanceOperationResult>;
// Интерфейс для получения Telegram API
interface TelegramApiProvider { getTelegramApi: (botName: string) => Promise<Telegram | null>; }
// Тип для хелпера toBotName
type ToBotNameFunction = (botName: string | undefined) => string | undefined;

export interface GenerateSpeechDependencies {
  logger: MinimalLogger;
  elevenlabs: ElevenLabsClient;
  fs: FileSystemOps;
  path: PathOps;
  os: OsOps;
  supabase: SupabaseUserOps;
  errorHandlers: ErrorHandlerOps;
  priceCalculator: PriceCalculatorFunction;
  balanceProcessor: BalanceProcessorFunction;
  telegramApiProvider: TelegramApiProvider;
  helpers: {
    toBotName: ToBotNameFunction;
  };
  elevenlabsApiKey: string;
}
```

*(Полные определения типов см. в `./types.ts`)*

## 🚀 Использование

```typescript
import { generateSpeech, GenerateSpeechDependencies } from './modules/generateSpeech';
// ... импорт реализаций зависимостей ...

// 1. Собрать объект зависимостей
const dependencies: GenerateSpeechDependencies = {
  logger: /* ... */,
  elevenlabs: /* ... */, // Инстанс клиента ElevenLabs
  fs: { createWriteStream: require('fs').createWriteStream },
  path: { join: require('path').join },
  os: { tmpdir: require('os').tmpdir },
  supabase: { getUserByTelegramIdString: /*...*/, updateUserLevelPlusOne: /*...*/ },
  errorHandlers: { sendServiceErrorToUser: /*...*/, sendServiceErrorToAdmin: /*...*/ },
  priceCalculator: /* ... */,
  balanceProcessor: /* ... */,
  telegramApiProvider: { getTelegramApi: /*...*/ },
  helpers: { toBotName: /*...*/ },
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
};

// 2. Сформировать объект запроса
const requestData = {
  text: 'Привет, мир!',
  voice_id: 'some-voice-id', // ID голоса из ElevenLabs
  telegram_id: '123456789',
  is_ru: true,
  bot_name: 'my_speech_bot',
};

// 3. Вызвать функцию модуля
try {
  const result = await generateSpeech(requestData, dependencies);
  console.log(`Аудиофайл сохранен по пути: ${result.audioPath}`);
  // Можно удалить временный файл после использования: fs.unlink(result.audioPath)
} catch (error) {
  console.error('Ошибка генерации речи:', error);
}
```

## ⚠️ Примечания

- Модуль сохраняет сгенерированный аудиофайл во временную директорию системы (`os.tmpdir()`). Вызывающий код отвечает за удаление этого файла после использования.
- Обработка ошибок полагается на выброс исключений, которые должны быть перехвачены вызывающим кодом. Уведомления об ошибках отправляются внутри модуля. 