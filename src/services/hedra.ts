/**
 * Hedra Service Stub
 * Заглушка для функциональности Hedra (генерация аватаров)
 */

export interface HedraAsset {
  id: string
  type: 'image' | 'audio'
  status: string
  upload_url?: string
}

export interface HedraGeneration {
  id: string
  status: string
  url?: string
  progress?: number
}

export class HedraService {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    console.log('[HEDRA STUB] Service initialized (stub mode)')
  }

  async createAsset(
    name: string,
    type: 'image' | 'audio'
  ): Promise<HedraAsset> {
    console.log(`[HEDRA STUB] Creating ${type} asset: ${name}`)
    return {
      id: `hedra_asset_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type,
      status: 'ready',
      upload_url: 'https://stub.hedra.com/upload',
    }
  }

  async uploadAsset(assetId: string, sourceUrl: string): Promise<void> {
    console.log(`[HEDRA STUB] Uploading asset ${assetId} from ${sourceUrl}`)
    // Stub: no actual upload
  }

  async startGeneration(
    imageAssetId: string,
    audioAssetId: string,
    textPrompt?: string,
    resolution?: string,
    aspectRatio?: string
  ): Promise<HedraGeneration> {
    console.log('[HEDRA STUB] Starting generation', {
      imageAssetId,
      audioAssetId,
      textPrompt,
      resolution,
      aspectRatio,
    })

    return {
      id: `hedra_gen_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: 'processing',
    }
  }

  async waitForCompletion(
    generationId: string,
    maxWaitMs: number = 300000,
    pollIntervalMs: number = 5000
  ): Promise<HedraGeneration> {
    console.log(`[HEDRA STUB] Waiting for completion: ${generationId}`)

    // Stub: return success immediately
    return {
      id: generationId,
      status: 'completed',
      url: `https://stub.hedra.com/videos/${generationId}.mp4`,
      progress: 100,
    }
  }

  async getGeneration(generationId: string): Promise<HedraGeneration> {
    console.log(`[HEDRA STUB] Getting generation status: ${generationId}`)

    return {
      id: generationId,
      status: 'completed',
      url: `https://stub.hedra.com/videos/${generationId}.mp4`,
      progress: 100,
    }
  }
}
