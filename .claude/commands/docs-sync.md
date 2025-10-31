---
name: docs-sync
description: Synchronize deployment documentation across CLAUDE.md, deployment-manager.md, and DEPLOYMENT_GUIDE.md
---

Запусти агента docs-sync для синхронизации документации по деплою между файлами:
- /Users/playra/CLAUDE.md (секция деплоя)
- .claude/agents/deployment-manager.md
- docs/DEPLOYMENT_GUIDE.md

Агент проанализирует все три файла, найдет расхождения и синхронизирует критическую информацию о деплое, сохраняя специфичный для каждого файла контекст.
