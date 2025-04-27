// Мок для контекста сцен Telegraf
import { Context } from 'telegraf'
import { SceneContextScene } from './telegraf-scenes.mock'

// Расширяем интерфейс контекста для включения сцен
export interface SceneContext<T extends Context> extends Context {
  scene: SceneContextScene<T>
}

// Функция для создания объекта контекста сцены
export function createSceneContext<T extends Context>(ctx: T): SceneContext<T> {
  const sceneCtx = ctx as unknown as SceneContext<T>
  sceneCtx.scene = new SceneContextScene<T>(ctx)

  return sceneCtx
}

export default {
  createSceneContext,
}
