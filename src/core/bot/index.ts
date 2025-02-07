import dotenv from 'dotenv'

dotenv.config()

import { NODE_ENV } from '@/config'

if (!process.env.BOT_TOKEN_1) {
  throw new Error('BOT_TOKEN_1 is not set')
}

if (!process.env.BOT_TOKEN_2) {
  throw new Error('BOT_TOKEN_2 is not set')
}

const BOT_TOKENS_PROD = [process.env.BOT_TOKEN_1, process.env.BOT_TOKEN_2]
const BOT_TOKENS_TEST = [
  process.env.BOT_TOKEN_TEST_1,
  process.env.BOT_TOKEN_TEST_2,
]

export const BOT_TOKENS =
  NODE_ENV === 'production' ? BOT_TOKENS_PROD : BOT_TOKENS_TEST
