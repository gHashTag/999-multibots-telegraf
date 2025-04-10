// Mock для ElevenLabs API
export const elevenlabs = {
  api: {
    voices: {
      add: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      edit: jest.fn(),
      list: jest.fn()
    },
    generation: {
      stream: jest.fn(),
      text_to_speech: jest.fn()
    }
  }
}
