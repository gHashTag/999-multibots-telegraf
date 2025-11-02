/**
 * Replicate client for AI model generation
 */

import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

export default replicate

// Model configurations for Replicate
export const models = {
  'neuro_coder': {
    key: 'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355',
    name: 'Neuro Coder Flux'
  }
}
