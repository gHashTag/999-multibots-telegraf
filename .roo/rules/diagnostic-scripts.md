---
description: Скрипт диагностики 
globs: 
alwaysApply: false
---
# 🔍 Diagnostic Scripts Guide

## Core Diagnostic Tools
- [diagnose.sh](mdc:scripts/diagnose.sh) - Full system diagnostics
- [rainbow-bridge.sh](mdc:scripts/rainbow-bridge.sh) - AI-Human communication bridge
- [kill-port.cjs](mdc:scripts/kill-port.cjs) - Port management utility
- [create-logs-dir.sh](mdc:scripts/create-logs-dir.sh) - Log directory setup

## Quick Commands

### Run Full Diagnostics
```bash
chmod +x scripts/diagnose.sh && ./scripts/diagnose.sh
```

### Start Rainbow Bridge
```bash
chmod +x scripts/rainbow-bridge.sh && ./scripts/rainbow-bridge.sh
```

### Kill Process on Port
```bash
node scripts/kill-port.cjs <port-number>
```

### Setup Logging
```bash
chmod +x scripts/create-logs-dir.sh && ./scripts/create-logs-dir.sh
```

## Diagnostic Parameters
- `-v` : Verbose output
- `-d` : Debug mode
- `-f` : Full scan
- `-q` : Quick scan
- `-l` : Log level (1-5)
