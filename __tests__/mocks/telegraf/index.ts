import { vi } from 'vitest'

/**
 * Основной мок для Telegraf
 */

// Telegraf класс
export class Telegraf {
  constructor(token, options = {}) {
    this.token = token;
    this.options = options;
    this.context = {};
    this.middleware = [];
  }

  use(middleware) {
    this.middleware.push(middleware);
    return this;
  }

  on(event, handler) {
    return this;
  }

  hears(trigger, handler) {
    return this;
  }

  command(command, handler) {
    return this;
  }

  action(trigger, handler) {
    return this;
  }

  launch(options = {}) {
    return Promise.resolve(this);
  }

  stop(reason = 'stop') {
    return Promise.resolve(true);
  }

  telegram = {
    sendMessage: vi.fn().mockResolvedValue({}),
    sendPhoto: vi.fn().mockResolvedValue({}),
    sendDocument: vi.fn().mockResolvedValue({}),
    sendVideo: vi.fn().mockResolvedValue({}),
    sendAnimation: vi.fn().mockResolvedValue({}),
    sendAudio: vi.fn().mockResolvedValue({}),
    sendVoice: vi.fn().mockResolvedValue({}),
    sendMediaGroup: vi.fn().mockResolvedValue([{}]),
    deleteMessage: vi.fn().mockResolvedValue(true),
    editMessageText: vi.fn().mockResolvedValue({}),
    editMessageCaption: vi.fn().mockResolvedValue({}),
    editMessageMedia: vi.fn().mockResolvedValue({}),
    editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
    getFile: vi.fn().mockResolvedValue({ file_path: 'mocked/file/path' }),
    getFileLink: vi.fn().mockResolvedValue('https://mocked.file.url'),
    setMyCommands: vi.fn().mockResolvedValue(true),
  }
}

// Markup класс для клавиатур
export const Markup = {
  inlineKeyboard: (keyboard) => ({ inline_keyboard: keyboard }),
  keyboard: (keyboard, options = {}) => ({ keyboard, ...options }),
  removeKeyboard: (selective = false) => ({ remove_keyboard: true, selective }),
  forceReply: (selective = false) => ({ force_reply: true, selective }),
}

// Scenes - импортируем все из подмодуля сцен
import * as Scenes from './lib/scenes'
export { Scenes }

// Composer для композиции middleware
export class Composer {
  constructor() {
    this.handlers = []
  }

  use(middleware) {
    this.handlers.push(middleware)
    return this
  }

  on(event, handler) {
    return this
  }

  hears(trigger, handler) {
    return this
  }

  command(command, handler) {
    return this
  }

  action(trigger, handler) {
    return this
  }
}

// Экспортируем по умолчанию
export default Telegraf

export const Input = {
  text: () => 'mocked-text-input',
  location: () => 'mocked-location-input',
  photo: () => 'mocked-photo-input',
  video: () => 'mocked-video-input',
  videoNote: () => 'mocked-videoNote-input',
  document: () => 'mocked-document-input',
} 