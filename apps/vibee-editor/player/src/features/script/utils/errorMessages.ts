// Улучшенная обработка ошибок с понятными сообщениями

export type ErrorType =
  | 'network'
  | 'rate_limit'
  | 'validation'
  | 'parsing'
  | 'timeout'
  | 'server'
  | 'unknown';

export interface ErrorInfo {
  type: ErrorType;
  message: string;
  userMessage: string;
  userMessageRu: string;
  action?: string;
  actionRu?: string;
  retryable: boolean;
}

/**
 * Обрыв связи в разных движках выглядит по-разному.
 *
 * Проверка `error.message.includes('fetch')` ловит только Chrome («Failed to
 * fetch»). Safari бросает «Load failed», Firefox — «NetworkError when
 * attempting to fetch resource», React Native — «Network request failed».
 * Для человека это один и тот же случай: связи нет.
 *
 * Тип идёт первым и один сам по себе достаточен: `fetch` бросает именно
 * `TypeError`, когда запрос не ушёл вовсе. Проверка по тексту — второй слой,
 * на случай если движок обернул сбой в свой класс. Полагаться ТОЛЬКО на
 * текст нельзя, но как страховка поверх типа она уместна.
 */
const NETWORK_MESSAGE =
  /failed to fetch|load failed|networkerror|network request failed|connection refused/i

// Предикат типа, а не просто boolean: иначе внутри ветки `error` остаётся
// unknown и обращение к .message не проходит проверку типов.
function isNetworkError(error: unknown): error is Error {
  if (error instanceof TypeError) return true
  return error instanceof Error && NETWORK_MESSAGE.test(error.message)
}

export function parseError(error: unknown): ErrorInfo {
  // Network errors
  if (isNetworkError(error)) {
    return {
      type: 'network',
      message: error.message,
      userMessage: 'Network connection failed. Please check your internet connection.',
      userMessageRu: 'Ошибка сети. Проверьте подключение к интернету.',
      action: 'Check connection and try again',
      actionRu: 'Проверьте соединение и попробуйте снова',
      retryable: true,
    };
  }

  // HTTP errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Rate limit (429)
    if (message.includes('429') || message.includes('rate limit')) {
      return {
        type: 'rate_limit',
        message: error.message,
        userMessage: 'Too many requests. The AI service is temporarily rate-limited.',
        userMessageRu: 'Слишком много запросов. Сервис временно ограничен.',
        action: 'Please wait 1-2 minutes and try again',
        actionRu: 'Подождите 1-2 минуты и попробуйте снова',
        retryable: true,
      };
    }

    // Timeout
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        type: 'timeout',
        message: error.message,
        userMessage: 'Request timed out. The AI is taking too long to respond.',
        userMessageRu: 'Превышено время ожидания. AI слишком долго отвечает.',
        action: 'Try with a shorter topic or simpler request',
        actionRu: 'Попробуйте с более короткой темой',
        retryable: true,
      };
    }

    // Validation errors
    if (message.includes('invalid') || message.includes('required')) {
      return {
        type: 'validation',
        message: error.message,
        userMessage: 'Invalid input. Please check your form fields.',
        userMessageRu: 'Некорректные данные. Проверьте поля формы.',
        action: 'Review your input and try again',
        actionRu: 'Проверьте введённые данные',
        retryable: false,
      };
    }

    // Parsing errors
    if (message.includes('parse') || message.includes('json')) {
      return {
        type: 'parsing',
        message: error.message,
        userMessage: 'Failed to parse AI response. The response format was invalid.',
        userMessageRu: 'Не удалось обработать ответ AI. Некорректный формат.',
        action: 'Try generating again',
        actionRu: 'Попробуйте сгенерировать снова',
        retryable: true,
      };
    }

    // Server errors (5xx)
    if (message.includes('500') || message.includes('503') || message.includes('server')) {
      return {
        type: 'server',
        message: error.message,
        userMessage: 'Server error. The AI service is temporarily unavailable.',
        userMessageRu: 'Ошибка сервера. Сервис временно недоступен.',
        action: 'Please try again in a few minutes',
        actionRu: 'Попробуйте через несколько минут',
        retryable: true,
      };
    }

    // Generic error with message
    return {
      type: 'unknown',
      message: error.message,
      userMessage: error.message,
      userMessageRu: error.message,
      retryable: true,
    };
  }

  // Unknown error
  return {
    type: 'unknown',
    message: String(error),
    userMessage: 'An unexpected error occurred.',
    userMessageRu: 'Произошла неожиданная ошибка.',
    action: 'Please try again',
    actionRu: 'Попробуйте снова',
    retryable: true,
  };
}

export function getErrorMessage(error: unknown, lang: 'ru' | 'en'): string {
  const errorInfo = parseError(error);
  const message = lang === 'ru' ? errorInfo.userMessageRu : errorInfo.userMessage;
  const action = lang === 'ru' ? errorInfo.actionRu : errorInfo.action;

  if (action) {
    return `${message} ${action}`;
  }

  return message;
}

export function shouldRetry(error: unknown): boolean {
  const errorInfo = parseError(error);
  return errorInfo.retryable;
}

export function getRetryDelay(error: unknown): number {
  const errorInfo = parseError(error);

  switch (errorInfo.type) {
    case 'rate_limit':
      return 60000; // 1 minute
    case 'timeout':
      return 5000; // 5 seconds
    case 'server':
      return 10000; // 10 seconds
    case 'network':
      return 3000; // 3 seconds
    default:
      return 2000; // 2 seconds
  }
}
