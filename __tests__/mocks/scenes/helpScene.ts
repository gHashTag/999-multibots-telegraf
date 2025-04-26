import { SCENES } from './index'

export const helpScene = {
  id: SCENES.HELP,
  steps: [
    async ctx => {
      // Mock implementation
      return Promise.resolve()
    },
  ],
  middleware: () => {},
}
