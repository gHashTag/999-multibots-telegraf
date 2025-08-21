# Architecture Overview

This is a Node.js Telegram bot application built with TypeScript, focusing on AI-powered content generation.

## Technology Stack

- **Runtime**: Node.js with Bun
- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Supabase (PostgreSQL)
- **AI Services**: OpenAI, Replicate, ElevenLabs
- **Logging**: Winston with structured logging
- **Testing**: Vitest, Jest
- **Deployment**: Docker, PM2, Ansible

## Project Structure

```
├── src/                          # Application source code
│   ├── bot.ts                   # Main bot entry point
│   ├── commands/                # Bot commands
│   ├── scenes/                  # Conversation scenes/wizards
│   ├── handlers/                # Message handlers  
│   ├── services/                # External API integrations
│   ├── core/                    # Core functionality
│   │   ├── openai/             # OpenAI integration
│   │   ├── replicate/          # Replicate AI integration
│   │   ├── supabase/           # Database operations
│   │   └── elevenlabs/         # Voice synthesis
│   ├── helpers/                 # Utility functions
│   │   └── error/              # Error handling
│   ├── middlewares/             # Bot middlewares
│   ├── menu/                    # UI menus and keyboards
│   ├── price/                   # Pricing logic
│   └── utils/                   # Shared utilities
├── deployment/                   # Deployment configurations
│   ├── docker/                 # Docker files
│   ├── ansible/                # Ansible playbooks  
│   └── scripts/                # Deployment scripts
├── config/                      # Configuration files
│   ├── nginx/                  # Nginx configurations
│   └── pm2/                    # PM2 configurations
└── docs/                        # Documentation
```

## Key Components

### Bot Framework
- **Telegraf**: Handles Telegram Bot API interactions
- **Scenes**: Conversational workflows using Telegraf scenes
- **Middlewares**: Authentication, subscription checks, logging

### AI Services Integration
- **OpenAI**: Text generation, chat completion
- **Replicate**: Image and video generation
- **ElevenLabs**: Text-to-speech synthesis

### Database Layer
- **Supabase**: PostgreSQL with real-time features
- **User Management**: Profiles, subscriptions, usage tracking
- **Payment Processing**: Transaction records, balance management

### Error Handling & Logging
- **GlobalErrorHandler**: Centralized error processing
- **Structured Logging**: JSON logs with correlation IDs
- **Security Logging**: Separate audit trail

## Data Flow

1. **User Message** → Telegraf → **Handler/Scene**
2. **Handler** → **Service Layer** → **AI APIs**
3. **Service** → **Database** (save/retrieve data)
4. **Response** → **User Interface** → **Telegram**

## Security Features

- **Environment Variables**: All secrets in .env files
- **Input Validation**: Sanitized user inputs
- **Rate Limiting**: Usage limits per user
- **Audit Logging**: Security events tracking
- **Error Sanitization**: No sensitive data in logs

## Scalability Considerations

- **Stateless Design**: No server-side session storage
- **Database Connection Pooling**: Efficient database usage
- **Async Processing**: Non-blocking operations
- **Log Rotation**: Prevents disk space issues
- **Resource Monitoring**: Memory and CPU tracking

## Development Workflow

1. **Local Development**: `npm run dev` (hot reload)
2. **Testing**: `npm test` (unit tests)
3. **Type Checking**: `npm run typecheck`
4. **Building**: `npm run build` (production build)
5. **Deployment**: Docker + Ansible automation