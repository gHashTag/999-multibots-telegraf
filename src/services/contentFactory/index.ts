/**
 * Контент-завод: рилс из текста за один вызов.
 *
 *   import { runFactory } from '@/services/contentFactory'
 *   await runFactory({ canon: 'noir', script: '…', language: 'ru', deliverTo: '144022504' })
 *
 * Конвейер: голос клоном владельца → планы img2img с эталонного кадра →
 * липсинк каждого плана на ОДНО аудио → пословные тайминги → монтаж по
 * границам фраз → рендер шаблоном Remotion → отправка в Telegram.
 *
 * Прогон возобновляем: манифест лежит на полке, повтор с тем же текстом
 * поднимает готовые стадии и доделывает остаток, не платя дважды.
 *
 * Документация канонов: docs/brand/club-reel-noir.md, docs/brand/blog-reel-identity.md
 */
export { runFactory, runIdFor } from './pipeline'
export type { RunOptions } from './pipeline'
export { CANONS, getCanon } from './canons'
export type {
  CanonId,
  CanonSpec,
  ReelOrder,
  Manifest,
  Caption,
  Cut,
  StageName,
} from './types'
export { StageError } from './types'
