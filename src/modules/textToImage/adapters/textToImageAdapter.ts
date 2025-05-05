import { textToImageConfig } from '../config'
import { replicate } from '@/core/replicate'

export const generateImageFromText = async (text: string): Promise<string> => {
  try {
    console.log(`Generating image from text: ${text}`)
    const output = await replicate.run(
      'stability-ai/stable-diffusion:27b93a2413e7f36cd83da926f3656280b2931564ff050bf9575f1fdf9bcd7478',
      {
        input: {
          prompt: text,
          image_dimensions: '512x512',
          num_outputs: 1,
        },
      }
    )
    return (output[0] as string) || 'image-url-placeholder'
  } catch (error) {
    console.error(`Error generating image: ${error}`)
    throw new Error(`Failed to generate image from text: ${error}`)
  }
}
