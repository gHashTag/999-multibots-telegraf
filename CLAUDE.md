# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build & Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run build:prod` - Production build with prod tsconfig
- `npm run build:nocheck` - Build without type checking (faster)
- `npm start` - Start production server from dist/

### Testing
- `npm test` - Run Jest tests
- `npm run test:vitest` - Run Vitest tests with mocked environment
- `npm run test:instagram` - Test Instagram functionality
- `npm run test:instagram-prod` - Test Instagram in production mode

### Code Quality
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Type check without emitting files

### Docker Commands
- `docker-compose up -d` - Start all services in detached mode
- `docker-compose down` - Stop all services
- `make build` - Build production Docker image
- `make build-dev` - Build development Docker image

## Architecture Overview

This is a multi-bot Telegram system built with Node.js/TypeScript that manages multiple Telegram bots through a single server instance. The system supports both webhook and long-polling modes.

### Core Technologies
- **Runtime**: Node.js 20 with Bun for package management
- **Language**: TypeScript with strict mode disabled for flexibility
- **Bot Framework**: Telegraf 4.16.3 for Telegram Bot API
- **Database**: Supabase (PostgreSQL) for data persistence
- **Testing**: Jest with ts-jest for unit tests
- **Containerization**: Docker with multi-stage builds

### Key Architectural Components

#### 1. Multi-Bot System (`src/bot.ts`)
- Single server manages multiple bot instances
- Each bot runs on different ports (2999, 3000-3009)
- Shared session management and middleware
- Centralized error handling and logging

#### 2. Core Services (`src/core/`)
- **Supabase Integration**: Complete CRUD operations for users, payments, models
- **AI Services**: OpenAI, Replicate, ElevenLabs integrations
- **LipSync System**: Functional architecture with multiple providers
- **Payment Processing**: Robokassa integration for Russian market

#### 3. Scene-Based User Flow (`src/scenes/`)
- Telegraf scenes for complex user interactions
- Wizard patterns for multi-step processes
- State management through session storage

#### 4. Service Layer (`src/services/`)
- AI content generation (images, videos, text-to-speech)
- Instagram scraping and content processing
- Video processing and morphing capabilities
- Model training and fine-tuning workflows

#### 5. Pricing System (`src/price/`)
- Unified pricing calculator for all services
- Star-based currency system (Telegram Stars)
- Dynamic pricing strategies based on service complexity
- Cost calculation with margin management

### Critical Development Patterns

#### Supabase Integration Rules
1. Always use TypeScript interfaces for Supabase data
2. Check arguments before calling Supabase functions
3. Always handle the `error` field in responses
4. Use `.maybeSingle()` for optional records instead of `.single()`
5. Log all Supabase operations for debugging

#### Path Aliases (tsconfig.json)
- `@/*` maps to `src/*`
- `@/core/*` maps to `src/core/*`
- `@/services/*` maps to `src/services/*`
- All major directories have dedicated path aliases

#### Error Handling
- Centralized error handler in `src/helpers/error/`
- Service-specific error messages for users
- Admin notification system for critical errors
- Safe console logging to prevent Buffer exposure

## Environment Setup

### Required Environment Variables
```
# Bot Configuration
BOT_TOKEN_1, BOT_TOKEN_2, ... BOT_TOKEN_10
ORIGIN=https://your-domain.com
ADMIN_IDS=comma,separated,telegram,ids

# Database
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-service-key

# AI Services
OPENAI_API_KEY=your-openai-key
REPLICATE_API_TOKEN=your-replicate-token
ELEVENLABS_API_KEY=your-elevenlabs-key

# Payment System
SECRET_KEY=your-robokassa-secret
```

### Docker Environment
- Multi-stage build process removes test files
- Production image uses Node.js 20 Alpine
- Includes FFmpeg, Python3, and yt-dlp for media processing
- Nginx proxy for webhook handling

## Testing Strategy

### Unit Tests (`__tests__/`)
- Jest configuration with ts-jest preset
- Mock utilities for Telegraf context (`__tests__/utils/mockTelegrafContext.ts`)
- Supabase mocking patterns documented in README.md
- Coverage includes core business logic and service integrations

### Integration Tests
- Database integration tests with real Supabase instances
- Payment flow testing with mock payment providers
- Bot command testing with simulated user interactions

### Testing Best Practices
- Use `makeMockContext` utility for Telegraf tests
- Mock Supabase with proper error/success response patterns
- Test pricing calculations with edge cases
- Validate AI service integrations with API mocks

## Production Deployment

### Container Orchestration
- Docker Compose with nginx proxy
- Shared network configuration (172.27.0.0/16)
- Volume mounting for file persistence
- Health checks for service monitoring

### Critical Production Settings
- Network configuration must not be changed
- Port mappings (2999, 3000-3009) are fixed
- nginx proxy configuration is environment-specific
- File volumes must be properly mounted for media processing

### Monitoring & Logging
- Winston logger with multiple transports
- Structured logging for debugging
- Security logging for audit trails
- Performance metrics collection

## Development Workflows

### Adding New Services
1. Create service in `src/services/`
2. Add pricing configuration in `src/price/`
3. Create corresponding scene in `src/scenes/`
4. Update interfaces in `src/interfaces/`
5. Add tests in `__tests__/`

### AI Integration Pattern
1. Service wrapper in `src/core/[provider]/`
2. Error handling with user-friendly messages
3. Cost calculation and balance deduction
4. Result processing and file management
5. Cleanup and resource management

### Database Schema Changes
1. Create SQL migration in `scripts/`
2. Update TypeScript interfaces
3. Add database functions if needed
4. Test with integration tests
5. Document in service layer

This architecture supports high-scale operations with multiple AI services, complex pricing models, and robust error handling for production Telegram bot deployment.