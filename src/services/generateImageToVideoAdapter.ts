// Import the new function, request/response types, and dependencies interface
import {
  // Removed generateImageToVideo from here as it's imported below
  ImageToVideoRequest,
  ImageToVideoResponse,
  ImageToVideoDependencies,
} from '@/modules/localImageToVideo/types' // Updated path to new types file
import { generateImageToVideo } from '@/modules/localImageToVideo/generateImageToVideo' // Updated path to new function location

// Import REAL project dependencies
import { replicate } from '@/core/replicate' // Real Replicate client
import { downloadFile } from '@/modules/localImageToVideo/downloadFile' // Updated path to new downloadFile location
import { logger } from '@/utils/logger' // Real logger

// Assemble the REAL dependencies into the required structure
const dependencies: ImageToVideoDependencies = {
  replicateClient: replicate,
  downloadFile: downloadFile,
  logger: logger,
}
/**
 * Adapter function for backward compatibility.
 * It takes the old parameters, converts them to the new request format,
 * and calls the refactored generateImageToVideo function with real dependencies.
 */
export async function generateImageToVideoLegacy(
  imageUrl: string,
  prompt: string,
  videoModel: string,
  telegram_id: string,
  username: string,
  isRu: boolean,
  botName: string
): Promise<ImageToVideoResponse> {
  // 1. Convert old parameters to the new ImageToVideoRequest format
  const request: ImageToVideoRequest = {
    imageUrl,
    prompt,
    videoModel,
    metadata: {
      userId: telegram_id, // Map telegram_id to userId
      username,
      botId: botName,
      // aspectRatio might need to be fetched or passed if required by the core function
    },
    locale: {
      language: isRu ? 'ru' : 'en', // Convert boolean to 'ru' | 'en'
    },
  }

  // 2. Call the new, refactored function with the request and the assembled dependencies
  return generateImageToVideo(request, dependencies)
}
