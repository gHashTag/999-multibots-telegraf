---
name: deploy
description: Deploy code changes to production server with Docker rebuild
---

Invoke the deployment-manager agent to perform a safe production deployment to server 212.86.115.30.

The agent will:
1. Validate pre-deployment conditions
2. Push code to production
3. Execute Docker rebuild protocol
4. Verify successful deployment

Use this command after committing changes that need to go to production.