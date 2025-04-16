export const RESERVED_PORTS = {
  INNGEST_DEV: {
    SERVE: 8288,
    DEV: 8289,
  },
  TELEGRAM_BOT: {
    WEBHOOK: 3000,
  },
  SUPABASE: {
    LOCAL: 54321,
    STUDIO: 54323,
  },
} as const

export type PortConfig = {
  port: number
  serviceName: string
  description: string
}

export const PORT_CONFIGS: PortConfig[] = [
  {
    port: RESERVED_PORTS.INNGEST_DEV.SERVE,
    serviceName: 'Inngest Serve',
    description: 'Inngest development server',
  },
  {
    port: RESERVED_PORTS.INNGEST_DEV.DEV,
    serviceName: 'Inngest Dev',
    description: 'Inngest development UI',
  },
  {
    port: RESERVED_PORTS.TELEGRAM_BOT.WEBHOOK,
    serviceName: 'Telegram Webhook',
    description: 'Telegram bot webhook server',
  },
  {
    port: RESERVED_PORTS.SUPABASE.LOCAL,
    serviceName: 'Supabase Local',
    description: 'Local Supabase instance',
  },
  {
    port: RESERVED_PORTS.SUPABASE.STUDIO,
    serviceName: 'Supabase Studio',
    description: 'Supabase Studio UI',
  },
]

export function getPortConfig(port: number): PortConfig | undefined {
  return PORT_CONFIGS.find(config => config.port === port)
}

export function isPortReserved(port: number): boolean {
  return PORT_CONFIGS.some(config => config.port === port)
}
