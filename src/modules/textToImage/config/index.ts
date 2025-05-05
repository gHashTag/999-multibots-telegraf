export const textToImageConfig = {
  apiKey: process.env.TEXT_TO_IMAGE_API_KEY || '',
  endpoint:
    process.env.TEXT_TO_IMAGE_ENDPOINT ||
    'https://api.example.com/text-to-image',
}
