// @ts-nocheck
/**
 * HeyGen Avatar Details API Service
 * Fetches avatar metadata including preview image URL
 */

import axios from 'axios'
import { Logger } from 'inngest'

export interface HeyGenAvatarData {
  avatar_id: string
  avatar_name: string
  preview_image_url?: string
  preview_video_url?: string
  gender?: string
}

export interface HeyGenAvatarDetailsResponse {
  code: number
  data?: HeyGenAvatarData
  message?: string
}

/**
 * Get HeyGen avatar details including preview image
 * Matches Python: services.heygen_avatars.get_avatar_details()
 */
export async function getHeyGenAvatarDetails(
  apiKey: string,
  avatarId: string,
  logger: Logger
): Promise<HeyGenAvatarDetailsResponse> {
  logger.info(`Fetching HeyGen avatar details for ${avatarId}`)

  try {
    const response = await axios.get(
      `https://api.heygen.com/v2/avatars/${avatarId}`,
      {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    )

    logger.info(`✅ Retrieved HeyGen avatar details`, {
      avatar_id: avatarId,
      has_preview: !!response.data?.data?.preview_image_url,
    })

    return response.data
  } catch (error: any) {
    logger.error('Failed to get HeyGen avatar details', {
      error: error.message,
      avatar_id: avatarId,
    })

    throw new Error(`Failed to get HeyGen avatar details: ${error.message}`)
  }
}

/**
 * Extract preview image URL from HeyGen avatar
 */
export function extractPreviewImageUrl(
  avatarDetails: HeyGenAvatarDetailsResponse
): string | null {
  return avatarDetails.data?.preview_image_url || null
}
