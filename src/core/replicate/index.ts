/**
 * 🚨 🚨 🚨 CRITICAL WARNING 🚨 🚨 🚨
 * 
 * DO NOT MODIFY THIS FILE WITHOUT UNDERSTANDING!
 * 
 * Midjourney v7 configuration is protected by commit ae06c56e
 * 
 * REQUIREMENTS:
 * - Model MUST include version hash: adminconteudosflix/midjourney-allcraft:40ab9b32cc4584bc069e22027fffb97e79ed550d4e7c20ed6d5d7ef89e8f08f5
 * - Without version hash, model returns 404 and breaks Midjourney generation
 * - All parameters (go_fast, lora_scale, megapixels, etc.) are REQUIRED
 * 
 * PROTECTED FILES:
 * 1. generateMidjourneyImage.ts - DO NOT CHANGE MODEL URL
 * 2. IMAGES_MODELS.ts - previewImage URL must be valid
 * 3. imageModelPrices.ts - pricing config
 * 4. textToImageWizard/index.ts - Create new button logic
 * 5. generateTextToImageDirect.ts - octet-stream validation
 * 
 * Breaking these files will cause Midjourney v7 to fail in production!
 * 
 * 🤖 Generated with [Claude Code](https://claude.com/claude-code)
 * 
 */

import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

export default replicate
