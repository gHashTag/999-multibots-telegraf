import { ModeEnum } from '@/interfaces/modes'

/**
 * Получает правильное склонение слова "звезда" в зависимости от количества
 */
function getStarsWord(amount: number): string {
  const lastDigit = Math.abs(amount) % 10
  const lastTwoDigits = Math.abs(amount) % 100

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'звезд'
  }

  if (lastDigit === 1) {
    return 'звезду'
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'звезды'
  }

  return 'звезд'
}

type ServiceDescription = {
  expense: (amount: number) => string
  income: (amount: number) => string
}

/**
 * Описания для всех типов сервисов с эмодзи
 */
export const SERVICE_DESCRIPTIONS: Record<ModeEnum, ServiceDescription> = {
  [ModeEnum.Subscribe]: {
    expense: (amount: number) =>
      `📅 Подписка: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.DigitalAvatarBody]: {
    expense: (amount: number) =>
      `👤 Создание цифрового аватара: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.DigitalAvatarBodyV2]: {
    expense: (amount: number) =>
      `👤 Создание цифрового аватара V2: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.NeuroPhoto]: {
    expense: (amount: number) =>
      `🎨 Генерация изображения: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.NeuroPhotoV2]: {
    expense: (amount: number) =>
      `🎨 Генерация изображения V2: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.NeuroAudio]: {
    expense: (amount: number) =>
      `🎵 Нейро-аудио: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ImageToPrompt]: {
    expense: (amount: number) =>
      `🔍 Анализ изображения: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Avatar]: {
    expense: (amount: number) =>
      `👤 Создание аватара: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ChatWithAvatar]: {
    expense: (amount: number) =>
      `💬 Чат с аватаром: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SelectModel]: {
    expense: (amount: number) =>
      `🎯 Выбор модели: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SelectAiTextModel]: {
    expense: (amount: number) =>
      `🤖 Выбор текстовой модели: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SelectModelWizard]: {
    expense: (amount: number) =>
      `🎯 Мастер выбора модели: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Voice]: {
    expense: (amount: number) =>
      `🎤 Создание голосового аватара: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.TextToSpeech]: {
    expense: (amount: number) =>
      `🗣️ Преобразование текста в речь: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ImageToVideo]: {
    expense: (amount: number) =>
      `🎬 Создание видео из изображения: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.TextToVideo]: {
    expense: (amount: number) =>
      `🎬 Создание видео из текста: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.TextToImage]: {
    expense: (amount: number) =>
      `🖼️ Создание изображения из текста: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.LipSync]: {
    expense: (amount: number) =>
      `👄 Синхронизация губ: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SelectNeuroPhoto]: {
    expense: (amount: number) =>
      `🎨 Выбор NeuroPhoto: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ChangeSize]: {
    expense: (amount: number) =>
      `📐 Изменение размера: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Invite]: {
    expense: (amount: number) =>
      `📨 Приглашение: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Help]: {
    expense: (amount: number) => `❓ Помощь: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.MainMenu]: {
    expense: (amount: number) =>
      `📋 Главное меню: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Balance]: {
    expense: (amount: number) => `💰 Баланс: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ImprovePrompt]: {
    expense: (amount: number) =>
      `✨ Улучшение промпта: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.TopUpBalance]: {
    expense: (amount: number) =>
      `💳 Пополнение баланса: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.VideoInUrl]: {
    expense: (amount: number) =>
      `🎥 Видео по URL: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Tech]: {
    expense: (amount: number) =>
      `🧠 Нейросеть: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Stats]: {
    expense: (amount: number) =>
      `📊 Статистика: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.BroadcastWizard]: {
    expense: (amount: number) =>
      `📢 Мастер рассылки: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SubscriptionCheckScene]: {
    expense: (amount: number) =>
      `🔄 Проверка подписки: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.ImprovePromptWizard]: {
    expense: (amount: number) =>
      `✨ Мастер улучшения промпта: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SizeWizard]: {
    expense: (amount: number) =>
      `📐 Мастер размера: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.PaymentScene]: {
    expense: (amount: number) => `💳 Оплата: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.InviteScene]: {
    expense: (amount: number) =>
      `📨 Сцена приглашения: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.BalanceScene]: {
    expense: (amount: number) =>
      `💰 Сцена баланса: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.Step0]: {
    expense: (amount: number) =>
      `🔄 Начальный шаг: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.NeuroCoderScene]: {
    expense: (amount: number) =>
      `🤖 Сцена NeuroCoder: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.CheckBalanceScene]: {
    expense: (amount: number) =>
      `💰 Проверка баланса: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.HelpScene]: {
    expense: (amount: number) =>
      `❓ Сцена помощи: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.CancelPredictionsWizard]: {
    expense: (amount: number) =>
      `❌ Отмена предсказаний: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.EmailWizard]: {
    expense: (amount: number) =>
      `📧 Мастер email: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.GetRuBillWizard]: {
    expense: (amount: number) =>
      `📑 Получение счета: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.SubscriptionScene]: {
    expense: (amount: number) =>
      `📲 Управление подписками: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.CreateUserScene]: {
    expense: (amount: number) =>
      `👤 Создание пользователя: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.VoiceToText]: {
    expense: (amount: number) =>
      `🎤 Преобразование голоса в текст: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
  [ModeEnum.StartScene]: {
    expense: (amount: number) =>
      `🎬 Начальная сцена: ${amount} ${getStarsWord(amount)}`,
    income: (amount: number) =>
      `⭐️ Пополнение баланса на ${amount} ${getStarsWord(amount)}`,
  },
} as const
