import { Context, Scenes } from 'telegraf'
import { Message, Update } from 'telegraf/typings/core/types/typegram'

export interface NeuroCoderSession extends Scenes.SceneSession {
  cursor?: string
  email?: string
  selectedModel?: string
  triggerWord?: string
}

export interface NeuroCoderContext extends Context {
  scene: Scenes.SceneContextScene<NeuroCoderContext>
  session: NeuroCoderSession
  message: Update.New & Update.NonChannel & Message.TextMessage
}
