import { SCENES } from './index'

export const menuScene = {
  id: SCENES.MENU,
  steps: [
    async ctx => {
      // Mock implementation - первый шаг
      return Promise.resolve()
    },
    async ctx => {
      // Mock implementation - обработка команд
      return Promise.resolve()
    },
  ],
  middleware: () => {},
}
