---
name: autonomous-monitor
description: Control autonomous error monitoring and auto-fix system
---

# Autonomous Error Monitor Control

Start, stop, and manage the autonomous error monitoring system that watches production logs 24/7 and automatically fixes errors.

## Commands

### Start Monitoring
```
/autonomous-monitor start
```
Launches the autonomous error fixer agent with real-time log monitoring.

**What it does:**
1. Connects to production server (212.86.115.30)
2. Starts real-time Docker log streaming
3. Monitors for JavaScript errors
4. Automatically creates fix branches and PRs
5. Sends Telegram notifications to admin

### Check Status
```
/autonomous-monitor status
```
Shows current monitoring status and recent errors.

**Output:**
- Is monitoring active?
- How many errors detected
- Recent error list
- Last action taken

### Stop Monitoring
```
/autonomous-monitor stop
```
Stops the autonomous monitoring process.

### Manual Fix Trigger
```
/autonomous-monitor fix <error-type>
```
Manually trigger auto-fix for a specific error type.

**Error types:**
- `MODULE_NOT_FOUND`
- `TYPE_ERROR`
- `REFERENCE_ERROR`
- `SYNTAX_ERROR`
- `UNHANDLED_REJECTION`

### View Recent Errors
```
/autonomous-monitor errors [limit]
```
Display recent errors from the monitoring buffer.

## Implementation

When this command is invoked, launch the `autonomous-error-fixer` agent with appropriate action:

```bash
# For /autonomous-monitor start
Task: "Start autonomous error monitoring on production server. Use the autonomous-monitor MCP server to begin real-time log streaming and error detection."
Agent: autonomous-error-fixer

# For /autonomous-monitor status
Task: "Check autonomous monitor status using the MCP server and report current state."
Agent: autonomous-error-fixer

# For /autonomous-monitor stop
Task: "Stop autonomous monitoring gracefully."
Agent: autonomous-error-fixer

# For /autonomous-monitor fix <type>
Task: "Manually trigger autofix for {type} error."
Agent: autonomous-error-fixer

# For /autonomous-monitor errors [limit]
Task: "Retrieve and display the last {limit} errors from monitoring buffer."
Agent: autonomous-error-fixer
```

## Configuration

Requires environment variables in production `.env`:
```bash
ADMIN_TELEGRAM_ID=<your-telegram-id>
NOTIFICATION_BOT_TOKEN=<notification-bot-token>
```

## Usage Examples

**Start 24/7 monitoring:**
```
/autonomous-monitor start
```

**Check if monitoring is active:**
```
/autonomous-monitor status
```

**View last 20 errors:**
```
/autonomous-monitor errors 20
```

**Manually fix a specific error:**
```
/autonomous-monitor fix MODULE_NOT_FOUND
```

**Stop monitoring:**
```
/autonomous-monitor stop
```

## Safety Features

- ✅ Never pushes to `production` directly
- ✅ Always creates isolated branches
- ✅ Creates PRs for admin review
- ✅ Notifies admin of all actions
- ✅ Tests changes before committing
- ✅ Validates fixes don't introduce new errors

## Expected Output

When started:
```
🤖 Autonomous Error Monitor Started

📡 Monitoring: 212.86.115.30
🐳 Container: 999-multibots
⏰ Mode: Real-time streaming
📱 Notifications: Enabled

Status: Waiting for errors to detect...
```

When error detected:
```
🚨 Error Detected!

Type: MODULE_NOT_FOUND
Message: Cannot find module '@/services/video'
Time: 2025-11-10 15:30:45

🔧 Auto-fix initiated...
📋 Creating branch: autofix/module-not-found-1731242445
✅ Fix applied
📤 PR created: #123
📱 Admin notified via Telegram

View PR: https://github.com/.../pull/123
```
