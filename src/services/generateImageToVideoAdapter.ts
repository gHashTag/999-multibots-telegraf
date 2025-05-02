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
import { supabase } from '@/core/supabase' // Real Supabase client
import { downloadFile } from '@/modules/localImageToVideo/downloadFile' // Updated path to new downloadFile location
import * as fs from 'fs/promises' // Real fs operations
import { logger } from '@/utils/logger' // Real logger
import { VIDEO_MODELS_CONFIG } from '@/config/models.config' // Real models config
import { getBotByName } from '@/core/bot' // Real bot getter
import { processBalanceVideoOperation } from '@/price/helpers/processBalanceVideoOperation' // Real balance function
import { updateUserLevelPlusOne } from '@/core/supabase/updateUserLevelPlusOne' // Real user level function
import { getUserByTelegramIdString } from '@/core/supabase/getUserByTelegramIdString' // Real get user function
import { saveVideoUrlToSupabase } from '@/core/supabase/saveVideoUrlToSupabase' // Real save video function
import { sendServiceErrorToAdmin } from '@/helpers/error/sendServiceErrorToAdmin' // Real error notifier
import path from 'path' // For tmpStorageConfig

// Assemble the REAL dependencies into the required structure
const dependencies: ImageToVideoDependencies = {
  replicateClient: replicate,
  supabaseClient: supabase,
  downloadFile: downloadFile, // Assuming downloadFile returns Buffer
  // fsOps removed again
  logger: logger, // Use the real logger
  // tmpStorageConfig removed
  modelsConfig: VIDEO_MODELS_CONFIG, // Real config
  processBalanceVideoOperation: processBalanceVideoOperation,
  updateUserLevelPlusOne: updateUserLevelPlusOne,
  getUserByTelegramIdString: getUserByTelegramIdString,
  saveVideoUrlToSupabase: saveVideoUrlToSupabase,
  sendServiceErrorToAdmin: sendServiceErrorToAdmin,
  getBotByName: getBotByName, // Added missing dependency
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
