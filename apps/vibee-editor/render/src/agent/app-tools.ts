import type { AgentTool } from './tools'

// Only destinations, never URLs or credentials, cross the model boundary.
export const APP_TASK_DESTINATIONS = [
  'chat',
  'script',
  'audio',
  'image',
  'avatar',
  'video',
  'editor',
  'profile',
  'plan',
  'files',
  'skills',
] as const

export const OPEN_APP_TOOL: AgentTool = {
  name: 'open_app',
  description:
    'Offer a direct button to the next task in the Mini App. Use when the user ' +
    'needs to open the chat, script, voice, photo, lipsync, video, editor, ' +
    'profile, plan, files or skills. This only offers navigation: it does not ' +
    'generate, publish or spend. Prefer one relevant button over menu instructions. ' +
    'The client constructs the trusted URL; never provide a URL or identity.',
  parameters: {
    type: 'object',
    properties: {
      destination: { type: 'string', enum: [...APP_TASK_DESTINATIONS] },
    },
    required: ['destination'],
    additionalProperties: false,
  },
  async handler(args) {
    if (!args || Object.keys(args).some(key => key !== 'destination')) {
      throw new Error('unsupported navigation argument')
    }
    if (!APP_TASK_DESTINATIONS.includes(args.destination)) {
      throw new Error('unsupported app destination')
    }
    return { action: { type: 'open_mini_app', destination: args.destination } }
  },
}
