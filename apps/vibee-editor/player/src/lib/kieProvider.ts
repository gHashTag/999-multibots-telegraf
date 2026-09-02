export interface KieWebModel {
  id: string
  name: string
  description: string
}

/** Small reviewed surface; the server still validates every id and payload. */
export const KIE_WEB_MODELS: Record<
  'image' | 'video' | 'audio' | 'lipsync',
  readonly KieWebModel[]
> = {
  image: [
    {
      id: 'kie/google/nano-banana',
      name: 'Kie · Nano Banana',
      description: 'Экономная генерация через Kie.ai',
    },
  ],
  video: [
    {
      id: 'kie/grok-imagine/text-to-video',
      name: 'Kie · Grok Imagine',
      description: 'Текст в видео через Kie.ai',
    },
  ],
  audio: [
    {
      id: 'kie/elevenlabs/text-to-speech-multilingual-v2',
      name: 'Kie · Multilingual Voice',
      description: 'Запасной TTS через Kie.ai',
    },
  ],
  lipsync: [
    {
      id: 'kie/veed/fabric-1',
      name: 'Kie · Fabric',
      description: 'Говорящий портрет через Kie.ai',
    },
  ],
}

export function kieServerModelId(id: string): string | null {
  if (!id.startsWith('kie/')) return null
  const model = id.slice(4).trim()
  return model.length > 0 ? model : null
}
