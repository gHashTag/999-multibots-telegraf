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

## Admin Management Instructions

### Adding New Admin User (Quick Reference)

To add a new user as admin with specific subscription and stars balance:

1. **Find the user in database:**
   ```bash
   ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-vibecoder/services/bot-farm && node -e "
   const { supabase } = require(\"./dist/core/supabase/index.js\");
   // Check if user exists and get their current status
   supabase.from(\"users\").select(\"*\").eq(\"telegram_id\", \"USER_ID\").single()
   "'
   ```

2. **Set subscription type:**
   ```bash
   # Update user subscription (NEUROVIDEO, PREMIUM, NEUROPHOTO, etc.)
   supabase.from(\"users\").update({
     subscription: \"NEUROVIDEO\", 
     updated_at: new Date().toISOString()
   }).eq(\"telegram_id\", \"USER_ID\")
   ```

3. **Add stars balance:**
   ```bash
   # Add stars with correct payment structure
   supabase.from(\"payments_v2\").insert({
     telegram_id: \"USER_ID\",
     type: \"MONEY_INCOME\",
     description: \"Admin stars grant\",
     stars: 1000,
     amount: 0,
     currency: \"STARS\",
     status: \"COMPLETED\",
     bot_name: \"BOT_NAME\"
   })
   ```

4. **Add to admin list:**
   ```bash
   # Update .env file on server
   ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-vibecoder && 
   cp .env .env.backup && 
   sed -i "s/ADMIN_IDS=.*/ADMIN_IDS=144022504,1254048880,352374518,1852726961,7669741878,NEW_USER_ID/" .env'
   ```

5. **Rebuild and restart Docker:**
   ```bash
   ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-vibecoder && 
   docker-compose down && docker-compose up -d --build'
   ```

### Example Complete Command:
```bash
# For user 5794004227 with NEUROVIDEO subscription and 1000 stars:
# 1. Set subscription: NEUROVIDEO
# 2. Add 1000 stars with type MONEY_INCOME
# 3. Add to ADMIN_IDS: ,5794004227
# 4. Rebuild container
```

### Available Subscription Types:
- `NEUROVIDEO` - Video generation access
- `PREMIUM` - Full access to all features
- `NEUROPHOTO` - Photo generation access
- `stars` - Basic stars-based access

### Payment Types for Stars:
- `MONEY_INCOME` - Positive balance addition (recommended for admin grants)
- `MONEY_OUTCOME` - Deduction from balance (for service usage)
- Required fields: `status: "COMPLETED"`, `currency: "STARS"`

### Quick Stars Addition (One-Command Solution)

**Fast command to add stars to any user:**
```bash
# Replace USER_ID and AMOUNT with actual values
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-vibecoder/services/bot-farm && node -e "
const { supabase } = require(\"./dist/core/supabase/index.js\");
async function addStars() {
  const { data, error } = await supabase.from(\"payments_v2\").insert({
    telegram_id: \"USER_ID\",
    type: \"MONEY_INCOME\",
    description: \"Admin stars grant\",
    stars: AMOUNT,
    amount: 0,
    currency: \"STARS\",
    status: \"COMPLETED\",
    bot_name: \"HaimGroupMedia_bot\"
  }).select();
  if (error) console.error(\"❌ Error:\", error);
  else console.log(\"✅ Added \" + AMOUNT + \" stars to user USER_ID\");
  process.exit(0);
}
addStars();
"'
```

**Examples:**
```bash
# Add 1000 stars to user 5794004227
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-vibecoder/services/bot-farm && node -e "const { supabase } = require(\"./dist/core/supabase/index.js\"); async function addStars() { const { data, error } = await supabase.from(\"payments_v2\").insert({telegram_id: \"5794004227\", type: \"MONEY_INCOME\", description: \"Admin stars grant\", stars: 1000, amount: 0, currency: \"STARS\", status: \"COMPLETED\", bot_name: \"HaimGroupMedia_bot\"}).select(); if (error) console.error(\"❌ Error:\", error); else console.log(\"✅ Added 1000 stars\"); process.exit(0); } addStars();"'

# Add 10000 stars to user 5794004227
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-vibecoder/services/bot-farm && node -e "const { supabase } = require(\"./dist/core/supabase/index.js\"); async function addStars() { const { data, error } = await supabase.from(\"payments_v2\").insert({telegram_id: \"5794004227\", type: \"MONEY_INCOME\", description: \"Admin stars grant\", stars: 10000, amount: 0, currency: \"STARS\", status: \"COMPLETED\", bot_name: \"HaimGroupMedia_bot\"}).select(); if (error) console.error(\"❌ Error:\", error); else console.log(\"✅ Added 10000 stars\"); process.exit(0); } addStars();"'
```

**Ultra-Fast Template (Copy-Paste Ready):**
```bash
# Just replace USER_ID and AMOUNT in this one line:
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-vibecoder/services/bot-farm && node -e "const{supabase}=require(\"./dist/core/supabase/index.js\");(async()=>{const{error}=await supabase.from(\"payments_v2\").insert({telegram_id:\"USER_ID\",type:\"MONEY_INCOME\",description:\"Admin stars grant\",stars:AMOUNT,amount:0,currency:\"STARS\",status:\"COMPLETED\",bot_name:\"HaimGroupMedia_bot\"});console.log(error?\"❌ Error:\"+error.message:\"✅ Added AMOUNT stars to USER_ID\");process.exit(0)})();"'
```

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

## CI/CD Best Practices & Automation

### GitHub Actions Workflows

#### Main CI/CD Pipeline (`.github/workflows/ci.yml`)
- **Multi-stage pipeline** with dependency detection and change analysis
- **Security-first approach** with audit checks and vulnerability scanning
- **Matrix testing** across Node.js versions (18, 20, 21)
- **Intelligent caching** for faster builds
- **Docker integration** with build verification
- **Artifact preservation** for debugging and deployment

#### PR Quality Gates (`.github/workflows/pr-checks.yml`)
- **Automatic PR validation** with conventional commit format enforcement
- **Incremental testing** - only tests changed files for faster feedback
- **Coverage requirements** - minimum 70% test coverage
- **Size analysis** - warnings for large PRs (>500 lines, >20 files)
- **Build verification** before merge approval
- **Automated commenting** with helpful feedback

#### Security Scanning (`.github/workflows/security.yml`)
- **Secrets detection** with TruffleHog for credential scanning
- **Dependency vulnerability** auditing with npm audit
- **Static Application Security Testing (SAST)** with custom rules
- **Docker image scanning** with Trivy
- **Malicious package detection** and security policy enforcement
- **Weekly scheduled scans** for continuous monitoring

### Required CI/CD Practices

#### Before Merging Any Feature
1. **All tests must pass** - Jest + Vitest test suites
2. **Security checks must pass** - No critical vulnerabilities
3. **Code quality gates** - ESLint + Prettier + TypeScript checks
4. **Build verification** - Clean production build
5. **Coverage threshold** - Minimum 70% test coverage

#### Automated Quality Checks
- **Lint on changed files only** for faster PR feedback
- **TypeScript strict compilation** 
- **Circular dependency detection**
- **Bundle size monitoring**
- **License compliance verification**

#### Security Enforcement
- **Critical vulnerabilities block deployment**
- **Hardcoded credentials detection**
- **Dangerous code pattern scanning** (eval, SQL injection)
- **Environment variable validation**
- **Docker image vulnerability scanning**

### Development Workflow Integration

#### Feature Development Cycle
1. **Create feature branch** from `main`
2. **Implement changes** with tests
3. **Push commits** - triggers PR checks automatically
4. **Address any failing checks** before requesting review
5. **Manual review** after all automated checks pass
6. **Merge to main** - triggers full CI/CD pipeline
7. **Automatic deployment** verification

#### Testing Requirements
- **Unit tests** for new functionality (Jest)
- **Integration tests** for API endpoints (Vitest)
- **Coverage reports** uploaded to Codecov
- **Test environment** isolation with `.env.test`
- **Supabase mocking** for database operations

#### Code Quality Standards
- **Conventional commits** format for PR titles
- **ESLint security rules** enforcement
- **Prettier formatting** consistency
- **TypeScript strict mode** for type safety
- **No console.log** in production code

### Monitoring and Alerting
- **Build status badges** for repository health
- **Security scan results** in GitHub Security tab
- **Coverage trends** tracking over time
- **Dependency update** notifications
- **Performance regression** detection

This CI/CD implementation ensures zero-downtime deployments with comprehensive testing, security validation, and quality assurance at every step.
## 🚀 АВТОМАТИЧЕСКОЕ РАЗВЕРТЫВАНИЕ В ПРОДАКШН

### 🎯 КОМАНДА DEPLOY - АВТОМАТИЗИРУЕТ ВСЕ!

```bash
# 🚀 ОДНА КОМАНДА ДЛЯ ПОЛНОГО РАЗВЕРТЫВАНИЯ:
npm run deploy
```

**Что делает команда `deploy`:**
1. ✅ Автоматически коммитит изменения
2. ✅ Пушит в production branch
3. ✅ Подключается к продакшн серверу  
4. ✅ Обновляет код через git pull
5. ✅ Останавливает и удаляет старый контейнер
6. ✅ **Принудительно пересобирает Docker БЕЗ кеша (--no-cache)**
7. ✅ Запускает новый контейнер
8. ✅ Проверяет статус и логи

**📖 Полная документация:** [`docs/DEPLOY.md`](../DEPLOY.md)

### 🚨 КРИТИЧЕСКИЕ ПРАВИЛА РАЗВЕРТЫВАНИЯ

**🔥 ПРАВИЛО #1: ВСЕГДА ИСПОЛЬЗУЙТЕ `npm run deploy` ДЛЯ ИЗМЕНЕНИЙ КОДА**

При изменении TypeScript/JavaScript кода НИКОГДА не используйте:
- ❌ `docker restart 999-multibots` - НЕ применит изменения!
- ❌ `docker build` без `--no-cache` - может использовать старый кеш!

**✅ ПРАВИЛЬНО:**
```bash
npm run deploy  # Автоматически все сделает правильно
```

**✅ ИЛИ ручной способ на сервере:**
```bash
ssh -i ~/.ssh/selectel root@185.161.67.53
cd /root/999-agents-telegraf
git pull origin production
docker stop 999-multibots
docker rm 999-multibots
docker build --no-cache -t 999-multibots .  # --no-cache ОБЯЗАТЕЛЬНО!
docker run -d --name 999-multibots --restart=always -p 3001:3001 -v /root/999-agents-telegraf/.env:/app/.env:ro 999-multibots
```

**🎯 Помните:** Без принудительной пересборки Docker изменения TypeScript/JavaScript НЕ попадают в продакшн!

