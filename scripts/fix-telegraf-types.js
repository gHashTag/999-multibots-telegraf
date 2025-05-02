/**
 * Script to fix Telegraf mock types
 * 
 * This script fixes the type issues with Telegraf mocks by:
 * 1. Adding proper interfaces for Telegraf classes and methods
 * 2. Updating the mock implementations with correct types
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create backup directory with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '').substring(0, 15);
const backupDir = path.join(process.cwd(), `backup_telegraf_mocks_${timestamp}`);

// Create backup directory if it doesn't exist
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Path to the Telegraf mock files
const mockFiles = [
  path.join(process.cwd(), '__tests__/mocks/telegraf/index.ts'),
  path.join(process.cwd(), '__tests__/mocks/telegraf/lib/scenes/index.ts')
];

// Backup files before modifying them
mockFiles.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    const relativePath = path.relative(process.cwd(), filePath);
    const backupPath = path.join(backupDir, relativePath);
    
    // Create directory structure in backup
    const backupDirPath = path.dirname(backupPath);
    if (!fs.existsSync(backupDirPath)) {
      fs.mkdirSync(backupDirPath, { recursive: true });
    }
    
    // Copy the file to backup
    fs.copyFileSync(filePath, backupPath);
    console.log(`Backed up ${relativePath} to ${backupPath}`);
  }
});

// Fix telegraf/index.ts
const telegrafIndexPath = mockFiles[0];
if (fs.existsSync(telegrafIndexPath)) {
  let content = fs.readFileSync(telegrafIndexPath, 'utf8');
  
  // Add proper interfaces and types
  const newContent = `import { vi } from 'vitest';
import type { Update } from 'telegraf/typings/core/types/typegram';
import type { Context as TelegrafContext } from 'telegraf';

/**
 * Interfaces for Telegraf mocks
 */
interface TelegrafOptions {
  telegram?: any;
  username?: string;
  channelMode?: boolean;
  [key: string]: any;
}

interface ComposerMock {
  handlers?: any[];
  use: (middleware: any) => any;
  on: (event: string, handler: any) => any;
  hears: (trigger: any, handler: any) => any;
  command: (command: string, handler: any) => any;
  action: (trigger: any, handler: any) => any;
}

/**
 * Основной мок для Telegraf
 */

// Telegraf класс
export class Telegraf<C extends TelegrafContext = TelegrafContext> {
  token: string;
  options: TelegrafOptions;
  context: Record<string, any>;
  middleware: any[];

  constructor(token: string, options: TelegrafOptions = {}) {
    this.token = token;
    this.options = options;
    this.context = {};
    this.middleware = [];
  }

  use(middleware: any) {
    this.middleware.push(middleware);
    return this;
  }

  on(event: string, handler: any) {
    return this;
  }

  hears(trigger: any, handler: any) {
    return this;
  }

  command(command: string, handler: any) {
    return this;
  }

  action(trigger: any, handler: any) {
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
  inlineKeyboard: (keyboard: any[][]) => ({ inline_keyboard: keyboard }),
  keyboard: (keyboard: any[][], options = {}) => ({ keyboard, ...options }),
  removeKeyboard: (selective = false) => ({ remove_keyboard: true, selective }),
  forceReply: (selective = false) => ({ force_reply: true, selective }),
}

// Scenes - импортируем все из подмодуля сцен
import * as Scenes from './lib/scenes'
export { Scenes }

// Composer для композиции middleware
export class Composer implements ComposerMock {
  handlers: any[] = [];

  constructor() {
    this.handlers = [];
  }

  use(middleware: any) {
    this.handlers.push(middleware);
    return this;
  }

  on(event: string, handler: any) {
    return this;
  }

  hears(trigger: any, handler: any) {
    return this;
  }

  command(command: string, handler: any) {
    return this;
  }

  action(trigger: any, handler: any) {
    return this;
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
}`;

  fs.writeFileSync(telegrafIndexPath, newContent);
  console.log(`Updated ${path.relative(process.cwd(), telegrafIndexPath)}`);
}

// Fix telegraf/lib/scenes/index.ts
const scenesIndexPath = mockFiles[1];
if (fs.existsSync(scenesIndexPath)) {
  let content = fs.readFileSync(scenesIndexPath, 'utf8');
  
  // Add proper interfaces and types
  const newContent = `import type { Context as TelegrafContext } from 'telegraf';

// Interfaces for Scene types
interface SceneOptions {
  ttl?: number;
  defaultSession?: Record<string, any>;
  [key: string]: any;
}

interface StageOptions {
  ttl?: number;
  default?: string;
  [key: string]: any;
}

// Экспортирую класс Stage
export const Stage = class Stage<C extends TelegrafContext = TelegrafContext> {
  scenes: any[];
  options: StageOptions;

  constructor(scenes: any[] = [], options: StageOptions = {}) {
    this.scenes = scenes;
    this.options = options;
  }

  register(...scenes: any[]) {
    for (const scene of scenes) {
      this.scenes.push(scene);
    }
    return this;
  }

  middleware() {
    return (ctx: C, next: () => Promise<void>) => next();
  }
}

// Экспортирую класс BaseScene
export const BaseScene = class BaseScene<C extends TelegrafContext = TelegrafContext> {
  id: string;
  options: SceneOptions;

  constructor(id: string, options: SceneOptions = {}) {
    this.id = id;
    this.options = options;
  }

  enter(middleware: any) {
    return this;
  }

  leave(middleware: any) {
    return this;
  }

  use(middleware: any) {
    return this;
  }

  on(event: string, middleware: any) {
    return this;
  }

  hears(trigger: any, middleware: any) {
    return this;
  }

  command(command: string, middleware: any) {
    return this;
  }

  action(trigger: any, middleware: any) {
    return this;
  }
}

// Экспортирую класс WizardScene
export const WizardScene = class WizardScene<C extends TelegrafContext = TelegrafContext> extends BaseScene<C> {
  steps: any[];

  constructor(id: string, ...steps: any[]) {
    super(id);
    this.steps = steps;
  }

  addStep(middleware: any) {
    this.steps.push(middleware);
    return this;
  }
}

export default {
  Stage,
  BaseScene,
  WizardScene
}`;

  fs.writeFileSync(scenesIndexPath, newContent);
  console.log(`Updated ${path.relative(process.cwd(), scenesIndexPath)}`);
}

console.log('Telegraf mock types fixed successfully.'); 