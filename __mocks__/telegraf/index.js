import { vi } from 'vitest';

// Mock основных компонентов Telegraf
const mockOn = vi.fn();
const mockAction = vi.fn();
const mockCommand = vi.fn();
const mockHears = vi.fn();
const mockUse = vi.fn();
const mockStart = vi.fn();
const mockHelp = vi.fn();
const mockLaunch = vi.fn();
const mockTelegram = {
  setWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  sendMessage: vi.fn(),
  sendPhoto: vi.fn(),
  sendVideo: vi.fn(),
  sendAudio: vi.fn(),
  sendDocument: vi.fn(),
};

// Mock для объекта Context
class Context {
  constructor() {
    this.message = { text: 'test message' };
    this.from = { id: 123456789, first_name: 'Test', username: 'testuser' };
    this.chat = { id: 123456789, type: 'private' };
    this.telegram = mockTelegram;
    this.reply = vi.fn().mockResolvedValue({});
    this.replyWithPhoto = vi.fn().mockResolvedValue({});
    this.replyWithVideo = vi.fn().mockResolvedValue({});
    this.replyWithAudio = vi.fn().mockResolvedValue({});
    this.replyWithDocument = vi.fn().mockResolvedValue({});
    this.replyWithHTML = vi.fn().mockResolvedValue({});
    this.replyWithMarkdown = vi.fn().mockResolvedValue({});
    this.answerCbQuery = vi.fn().mockResolvedValue(true);
    this.editMessageReplyMarkup = vi.fn().mockResolvedValue({});
    this.editMessageText = vi.fn().mockResolvedValue({});
    this.scene = {
      enter: vi.fn(),
      reenter: vi.fn(),
      leave: vi.fn(),
      current: null,
    };
    this.session = {};
    this.wizard = {
      cursor: 0,
      next: vi.fn(),
      selectStep: vi.fn(),
      step: { id: 0 },
    };
    this.callbackQuery = { 
      data: 'test', 
      message: { 
        message_id: 1, 
        chat: { id: 123456789 } 
      } 
    };
  }
}

// Mock для Telegraf класса
class Telegraf {
  constructor() {
    this.on = mockOn;
    this.action = mockAction;
    this.command = mockCommand;
    this.hears = mockHears;
    this.use = mockUse;
    this.start = mockStart;
    this.help = mockHelp;
    this.launch = mockLaunch.mockResolvedValue({});
    this.telegram = mockTelegram;
    this.context = new Context();
  }
}

// Mock для Markup
const Markup = {
  keyboard: vi.fn().mockReturnThis(),
  inlineKeyboard: vi.fn().mockReturnThis(),
  resize: vi.fn().mockReturnThis(),
  extra: vi.fn().mockReturnThis(),
  removeKeyboard: vi.fn().mockReturnThis(),
  selective: vi.fn().mockReturnThis(),
  oneTime: vi.fn().mockReturnThis(),
  forceReply: vi.fn().mockReturnThis(),
  callbackButton: vi.fn().mockReturnThis(),
  urlButton: vi.fn().mockReturnThis(),
  switchToChatButton: vi.fn().mockReturnThis(),
  switchToCurrentChatButton: vi.fn().mockReturnThis(),
  gameButton: vi.fn().mockReturnThis(),
  payButton: vi.fn().mockReturnThis(),
  loginButton: vi.fn().mockReturnThis(),
  button: vi.fn().mockImplementation((text, data) => ({ text, callback_data: data })),
  url: vi.fn().mockImplementation((text, url) => ({ text, url })),
};

// Mock для Scenes
const Scenes = {
  Stage: class Stage {
    constructor() {
      this.register = vi.fn().mockReturnThis();
      this.middleware = vi.fn();
    }
  },
  BaseScene: class BaseScene {
    constructor(id) {
      this.id = id;
      this.enter = vi.fn().mockReturnThis();
      this.leave = vi.fn().mockReturnThis();
      this.on = vi.fn().mockReturnThis();
      this.action = vi.fn().mockReturnThis();
      this.command = vi.fn().mockReturnThis();
      this.hears = vi.fn().mockReturnThis();
      this.use = vi.fn().mockReturnThis();
    }
  },
  WizardScene: class WizardScene {
    constructor(id, ...steps) {
      this.id = id;
      this.steps = steps;
      this.enter = vi.fn().mockReturnThis();
      this.leave = vi.fn().mockReturnThis();
      this.on = vi.fn().mockReturnThis();
      this.action = vi.fn().mockReturnThis();
      this.command = vi.fn().mockReturnThis();
      this.hears = vi.fn().mockReturnThis();
      this.use = vi.fn().mockReturnThis();
    }
  },
  session: {
    SceneSession: class SceneSession {
      constructor() {
        this.current = null;
      }
    }
  }
};

// Экспорт всех моков
export {
  Telegraf,
  Context,
  Markup,
  Scenes,
};

export default Telegraf; 