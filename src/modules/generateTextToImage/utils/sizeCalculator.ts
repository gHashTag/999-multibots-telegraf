/**
 * Supported image sizes for specific models.
 */
const supportedSizes = [
  '1024x1024',
  '1365x1024',
  '1024x1365',
  '1536x1024',
  '1024x1536',
  '1820x1024',
  '1024x1820',
  '1024x2048',
  '2048x1024',
  '1434x1024',
  '1024x1434',
  '1024x1280',
  '1280x1024',
  '1024x1707',
  '1707x1024',
]

/**
 * Determines the appropriate image size parameter based on the model type and aspect ratio.
 * Returns undefined if the aspect_ratio should be used directly, or a specific size string.
 *
 * @param modelType - The lowercased model type string.
 * @param aspectRatio - The desired aspect ratio (e.g., '1:1', '16:9').
 * @returns The size string (e.g., '1024x1024') or undefined.
 */
export const determineImageSize = (
  modelType: string,
  aspectRatio: string
): string | undefined => {
  // Default size or condition to use aspect ratio directly
  const defaultSize = '1024x1024'

  if (modelType.toLowerCase() === 'recraft v3') {
    try {
      const [widthRatio, heightRatio] = aspectRatio.split(':').map(Number)
      if (
        isNaN(widthRatio) ||
        isNaN(heightRatio) ||
        widthRatio <= 0 ||
        heightRatio <= 0
      ) {
        // Invalid aspect ratio, use default
        return defaultSize
      }

      const baseWidth = 1024
      const calculatedHeight = Math.round(
        (baseWidth / widthRatio) * heightRatio
      )
      const calculatedSize = `${baseWidth}x${calculatedHeight}`

      // Return the calculated size only if it's in the supported list
      return supportedSizes.includes(calculatedSize)
        ? calculatedSize
        : defaultSize
    } catch (error) {
      // Error parsing aspect ratio, use default
      console.error('Error calculating size from aspect ratio:', {
        aspectRatio,
        error,
      })
      return defaultSize
    }
  } else {
    // For other models, use the default size (or potentially return undefined
    // if they should use aspect_ratio directly - adjust as needed)
    return defaultSize
  }
}
