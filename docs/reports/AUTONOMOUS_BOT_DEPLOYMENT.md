# 🤖 Autonomous Monitor Bot - Deployment Guide

## ✅ What's Done

1. ✅ Created `src/commands/autonomousMonitor.ts` - Full admin bot implementation
2. ✅ Registered commands in `src/registerCommands.ts`
3. ✅ Commands ready: `/start`, `/status`, `/logs`, `/errors`, `/metrics`, `/restart`, `/help`
4. ✅ Inline keyboard navigation implemented
5. ✅ SSH integration for production server monitoring

## 🚀 Deployment Steps

### Step 1: Add Bot Token to Infisical (REQUIRED)

The bot is integrated into the existing bot farm auto-discovery system. You need to add the token to Infisical:

1. **Open Infisical Dashboard**: https://app.infisical.com
2. **Navigate to**: Project `999-agents-telegraf` → Environment `prod`
3. **Add New Secret**:
   - Key: `BOT_TOKEN_11` (or next available BOT_TOKEN_N)
   - Value: `8309813696:AAG2QWKlmUSQ3BBDupoEv1RQ0m63KcKS-IQ`
   - Description: `Autonomous Monitor Admin Bot`

**Note**: The bot farm auto-discovers all `BOT_TOKEN_1` through `BOT_TOKEN_N` tokens. Adding it as `BOT_TOKEN_11` will automatically activate it on next deployment.

### Step 2: Build and Deploy to Production

```bash
# From project root
npm run build

# Deploy to production server
/deploy
```

### Step 3: Verify Bot is Running

```bash
# SSH to production
ssh -i ~/.ssh/zomro root@212.86.115.30

# Check logs
cd bot-farm
docker logs 999-multibots --tail 100 | grep "AUTONOMOUS MONITOR"

# Should see:
# ✅ [Autonomous Monitor] Commands registered
# 🤖 Бот agent_vibecoder_bot инициализирован
```

### Step 4: Test Commands

1. **Find the bot**: Search for `@agent_vibecoder_bot` in Telegram (or check bot username from getMe())
2. **Send `/start`**
3. **You should see**:

```
🤖 Autonomous Monitor Admin Bot

Добро пожаловать!

Сервер: 212.86.115.30
Контейнер: 999-multibots

Выбери действие:
[📊 Статус] [📋 Логи]
[🚨 Ошибки] [📈 Метрики]
[🔄 Рестарт] [❓ Помощь]
```

## 📱 Available Commands

### Monitoring
- `/status` - Server and container status with resource usage
- `/logs` - View container logs (50/100/200/500 lines)
- `/errors` - Automatically detect and categorize errors
- `/metrics` - Server metrics (uptime, disk, load, containers)

### Management
- `/restart` - Restart container (with confirmation dialog)

### Help
- `/help` - Show all commands
- `/start` - Main menu

## 🔒 Security

- Only admin (Telegram ID: `144022504`) can use the bot
- All other users get "Unauthorized" message
- SSH commands use private key authentication (`~/.ssh/zomro`)
- Destructive actions require confirmation

## 🐛 Troubleshooting

### Bot Not Responding

```bash
# Check bot is loaded
ssh -i ~/.ssh/zomro root@212.86.115.30
cd bot-farm
docker logs 999-multibots | grep "BOT_TOKEN_11"

# Should see:
# ✅ BOT_TOKEN_11 загружен
```

### Commands Not Showing in Menu

The bot automatically sets commands via `setMyCommands` on initialization. If menu doesn't appear:
1. Send `/start` to bot
2. Check for menu button (☰) next to message input
3. Tap to see command list

### SSH Errors

```bash
# Test SSH connection
ssh -i ~/.ssh/zomro root@212.86.115.30 'echo OK'

# Check key permissions
chmod 600 ~/.ssh/zomro
```

## 📊 Architecture

The autonomous monitor bot integrates seamlessly with the existing bot farm:

```
src/index.ts (Bot Farm)
  ↓
  Discovers BOT_TOKEN_1..BOT_TOKEN_N
  ↓
  Loads each bot with same middleware stack
  ↓
src/registerCommands.ts
  ↓
  Registers setupAutonomousMonitor(bot) for ALL bots
  ↓
src/commands/autonomousMonitor.ts
  ↓
  Checks if user is admin (ID: 144022504)
  ↓
  Provides monitoring commands ONLY to admin
```

This means:
- ✅ Autonomous monitor commands are registered on ALL bots
- ✅ Commands only work for admin user
- ✅ Other users won't see these commands
- ✅ No special configuration needed per-bot

## 🎯 Next Steps (Optional)

After basic deployment works:

1. **Add menu commands** to `setCommands.ts` for admin bot specifically
2. **Add alerting** - Proactive notifications when errors detected
3. **Add auto-fix** - Integration with autonomous-error-fixer agent
4. **Add metrics dashboards** - Grafana integration
5. **Add deployment commands** - Git pull, rebuild, restart workflow

## 📚 Related Documentation

- **Quick Start**: `TELEGRAM_BOT_START.md`
- **Setup Guide**: `docs/TELEGRAM_BOT_SETUP.md`
- **Bot Guide**: `docs/TELEGRAM_BOT_GUIDE.md`
- **System Summary**: `docs/AUTONOMOUS_SYSTEM_SUMMARY.md`

---

✅ **Ready to deploy!** Just add `BOT_TOKEN_11` to Infisical and run `/deploy`.

🤖 **Autonomous Monitor Admin Bot** - Your Production Command Center
