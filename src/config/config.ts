import { logger } from '@/utils/logger'

// Environment type
export type Environment = 'development' | 'production' | 'test'

// Base configuration interface
interface Config {
  env: Environment
  server: {
    port: number
    host: string
    apiUrl: string
  }
  telegram: {
    webhookUrl: string
  }
  supabase: {
    url: string
    serviceKey: string
    serviceRoleKey: string
    anonKey: string
  }
  services: {
    elevenlabs: {
      apiKey: string
    }
    inngest: {
      eventKey: string
    }
    openai: {
      apiKey: string
    }
    openrouter: {
      apiKey: string
    }
    replicate: {
      apiToken: string
    }
    synclabs: {
      apiKey: string
    }
    bfl: {
      apiKey: string
      webhookSecret: string
      apiUrl: string
    }
    video: {
      apiKey: string
      apiUrl: string
    }
    glama: {
      apiKey: string
    }
  }
  payment: {
    password: string
    testPassword: string
    secretToken: string
  }
}

// Development configuration
const development: Config = {
  env: 'development',
  server: {
    port: 3000,
    host: 'localhost',
    apiUrl: process.env.API_URL || 'http://localhost:3000',
  },
  telegram: {
    webhookUrl: process.env.LOCAL_SERVER_URL || 'http://localhost:3000',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },
  services: {
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY || '',
    },
    inngest: {
      eventKey: process.env.INNGEST_EVENT_KEY || '',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY || '',
    },
    replicate: {
      apiToken: process.env.REPLICATE_API_TOKEN || '',
    },
    synclabs: {
      apiKey: process.env.SYNC_LABS_API_KEY || '',
    },
    bfl: {
      apiKey: process.env.BFL_API_KEY || '',
      webhookSecret: process.env.BFL_WEBHOOK_SECRET || '',
      apiUrl: process.env.BFL_API_URL || '',
    },
    video: {
      apiKey: process.env.VIDEO_API_KEY || '',
      apiUrl: process.env.VIDEO_API_URL || '',
    },
    glama: {
      apiKey: process.env.GLAMA_API_KEY || '',
    },
  },
  payment: {
    password: process.env.PASSWORD1 || '',
    testPassword: process.env.TEST_PASSWORD1 || '',
    secretToken: process.env.SECRET_TOKEN || '',
  },
}

// Production configuration
const production: Config = {
  ...development,
  env: 'production',
  server: {
    ...development.server,
    host: process.env.HOST || 'localhost',
    apiUrl: process.env.API_URL || 'https://api.production.com',
  },
  telegram: {
    webhookUrl: process.env.ORIGIN || 'https://production.com',
  },
}

// Test configuration
const test: Config = {
  ...development,
  env: 'test',
  server: {
    ...development.server,
    port: 3001,
  },
}

// Get current environment
const nodeEnv = (process.env.NODE_ENV || 'development') as Environment

// Select configuration based on environment
const config = {
  development,
  production,
  test,
}[nodeEnv]

if (!config) {
  logger.error('❌ Invalid environment specified', {
    description: 'Configuration error',
    environment: nodeEnv,
  })
  throw new Error(`Invalid environment specified: ${nodeEnv}`)
}

logger.info('✅ Configuration loaded', {
  description: 'Configuration initialized',
  environment: config.env,
})

export default config
