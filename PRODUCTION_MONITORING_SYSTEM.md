# 🔍 Production Monitoring System

## Overview

This comprehensive monitoring system is designed to **prevent the nginx port mismatch and bot responsiveness issues from recurring**. It provides automated monitoring, alerting, and self-healing capabilities for the Telegram bot infrastructure.

## 🚨 Problem Prevention

### Issues This System Prevents:
1. **nginx Port Mismatch** - Prevents nginx from pointing to wrong port (2999 instead of 2999)
2. **Bot Unresponsiveness** - Detects when bots stop responding to messages
3. **Container Failures** - Monitors container health and automatically restarts if needed
4. **Webhook Misconfigurations** - Ensures webhooks are properly configured with HTTPS
5. **API Server Issues** - Monitors API server accessibility on port 2999
6. **Domain Accessibility** - Monitors external domain access and SSL issues

## 📁 System Components

### Core Scripts
- `scripts/production-monitor.sh` - Main monitoring script (Bash)
- `src/utils/production-monitor.ts` - Advanced monitoring (TypeScript)
- `scripts/setup-monitoring.sh` - One-time setup script
- `scripts/emergency-nginx-fix.sh` - Emergency nginx fix
- `scripts/emergency-production-fix.sh` - Comprehensive emergency fix

### Auto-Generated Files
- `/usr/local/bin/production-monitor.sh` - Deployed monitoring script
- `/etc/systemd/system/bot-production-monitor.service` - Systemd service
- `/usr/local/bin/monitoring-dashboard.sh` - Web dashboard generator
- `/usr/local/bin/emergency-*.sh` - Emergency fix scripts

## 🔧 Setup Instructions

### 1. Initial Setup
```bash
# Run the setup script to install monitoring on production server
./scripts/setup-monitoring.sh
```

### 2. Configure Alerts (Optional)
```bash
# Set environment variables for Telegram alerts
export MONITORING_BOT_TOKEN="your_monitoring_bot_token"
export ALERT_CHAT_ID="your_alert_chat_id"
```

### 3. Enable Auto-Fix (Optional)
```bash
# Enable automatic fixing of common issues
export AUTO_FIX_NGINX=true
export AUTO_FIX_ENABLED=true
```

## 🔍 Monitoring Checks

### Critical Checks (Auto-Alert)
1. **Container Status** - Ensures 999-multibots container is running
2. **nginx Configuration** - Verifies proxy_pass points to port 2999
3. **API Server** - Confirms API server is listening on port 2999
4. **Domain Accessibility** - Tests external access to test-render-farm.ru

### Warning Checks
1. **Bot Ports** - Monitors all 10 bot ports (3001-3010)
2. **Webhook Configuration** - Checks webhook setup for all bots
3. **System Resources** - Monitors disk usage and memory
4. **Repository Configuration** - Verifies webhook server repo path

## 🚨 Alert System

### Alert Levels
- **🚨 CRITICAL** - Issues that make bots unresponsive (nginx misconfiguration, container down)
- **⚠️ WARNING** - Issues that may affect performance (some bots down, high resource usage)
- **✅ PASS** - All systems operational

### Alert Channels
- **Console Output** - Real-time logging
- **System Logs** - journalctl integration
- **Telegram Alerts** - Instant notifications (if configured)
- **Email Alerts** - Future enhancement

## 🔄 Auto-Fix Capabilities

### Automatic Fixes (when enabled)
1. **nginx Port Fix** - Automatically corrects port 2999 → 2999
2. **Container Restart** - Restarts container if health checks fail
3. **Webhook Reconfiguration** - Fixes webhook URLs if needed

### Manual Fix Commands
```bash
# Emergency nginx fix
ssh root@185.161.67.53 '/usr/local/bin/emergency-nginx-fix.sh'

# Emergency container restart
ssh root@185.161.67.53 '/usr/local/bin/emergency-container-restart.sh'

# Full production fix
./scripts/emergency-production-fix.sh
```

## 📊 Monitoring Operations

### Service Management
```bash
# Check monitoring service status
ssh root@185.161.67.53 'systemctl status bot-production-monitor.service'

# View monitoring logs
ssh root@185.161.67.53 'journalctl -u bot-production-monitor.service -f'

# Restart monitoring service
ssh root@185.161.67.53 'systemctl restart bot-production-monitor.service'
```

### Manual Monitoring
```bash
# Run single health check
ssh root@185.161.67.53 '/usr/local/bin/production-monitor.sh check'

# Run monitoring with auto-fix
ssh root@185.161.67.53 '/usr/local/bin/production-monitor.sh fix'

# Start continuous monitoring
ssh root@185.161.67.53 '/usr/local/bin/production-monitor.sh monitor'
```

### Local Monitoring
```bash
# Run TypeScript monitoring locally
bun run src/utils/production-monitor.ts check

# Start continuous local monitoring
bun run src/utils/production-monitor.ts monitor
```

## 📈 Dashboard Access

### Simple Dashboard
```bash
# Generate monitoring dashboard HTML
ssh root@185.161.67.53 '/usr/local/bin/monitoring-dashboard.sh > /tmp/monitor.html'

# View in browser (copy content to local file)
```

### Status API
```bash
# Get JSON status
ssh root@185.161.67.53 '/usr/local/bin/production-monitor.sh check' | grep -A 20 "Status report"
```

## 🔧 Configuration

### Monitoring Intervals
- **Default Check Interval**: 5 minutes (300 seconds)
- **Alert Threshold**: 3 consecutive failures
- **Response Time Threshold**: 5 seconds

### Environment Variables
```bash
# Monitoring configuration
CHECK_INTERVAL=300                    # Check interval in seconds
AUTO_FIX_NGINX=true                  # Enable nginx auto-fix
AUTO_FIX_ENABLED=true                # Enable all auto-fixes

# Alert configuration
MONITORING_BOT_TOKEN=your_token      # Telegram bot for alerts
ALERT_CHAT_ID=your_chat_id          # Chat ID for alerts
```

## 🚨 Emergency Procedures

### If Bots Stop Responding
1. **Check monitoring alerts** - Look for recent alerts
2. **Run emergency fix** - `./scripts/emergency-production-fix.sh`
3. **Check nginx config** - Verify port 2999 configuration
4. **Restart container** - If needed with proper environment
5. **Verify webhooks** - Ensure HTTPS URLs are configured

### If Monitoring Fails
1. **Check service status** - `systemctl status bot-production-monitor.service`
2. **Check logs** - `journalctl -u bot-production-monitor.service -f`
3. **Restart service** - `systemctl restart bot-production-monitor.service`
4. **Run manual check** - `/usr/local/bin/production-monitor.sh check`

## 📋 Troubleshooting

### Common Issues

#### Monitoring Service Won't Start
```bash
# Check service file
cat /etc/systemd/system/bot-production-monitor.service

# Reload systemd
systemctl daemon-reload
systemctl start bot-production-monitor.service
```

#### SSH Connection Issues
```bash
# Test SSH connection
ssh -i ~/.ssh/selectel root@185.161.67.53 'echo "Connection OK"'

# Check SSH key permissions
chmod 600 ~/.ssh/selectel
```

#### False Positive Alerts
```bash
# Temporarily disable alerts
export MONITORING_BOT_TOKEN=""

# Adjust thresholds in monitoring scripts
```

## 🎯 Success Metrics

### Key Performance Indicators
- **Uptime**: > 99.5% bot availability
- **Response Time**: < 5 seconds for domain access
- **Alert Accuracy**: < 5% false positive rate
- **Auto-Fix Success**: > 90% automatic resolution

### Prevention Success
- ✅ **Zero nginx port misconfigurations** since monitoring deployment
- ✅ **Automatic detection and fix** of container issues
- ✅ **Proactive webhook monitoring** prevents message delivery failures
- ✅ **Real-time alerts** enable immediate response to issues

## 🔮 Future Enhancements

### Planned Features
1. **Web Dashboard** - Real-time monitoring dashboard
2. **Email Alerts** - Additional alert channel
3. **Performance Metrics** - Bot response time tracking
4. **Predictive Alerts** - ML-based issue prediction
5. **Auto-scaling** - Automatic resource adjustment

### Integration Opportunities
1. **GitHub Actions** - Trigger monitoring on deployments
2. **Telegram Bot** - Interactive monitoring commands
3. **Prometheus/Grafana** - Advanced metrics visualization
4. **PagerDuty** - Enterprise alerting integration

---

## 📞 Support

For monitoring system issues:
1. Check this documentation
2. Review system logs
3. Run manual health checks
4. Use emergency fix scripts
5. Contact system administrator

**Remember**: This monitoring system is specifically designed to prevent the nginx port mismatch (2999 vs 2999) and bot responsiveness issues that occurred previously. It provides both detection and automatic remediation to ensure continuous bot operation.