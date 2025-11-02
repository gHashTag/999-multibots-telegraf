# 🚨 MAKEFILE - DEPLOYMENT SAFETY

# Default target
.PHONY: help
help:
	@echo "🚀 DEPLOYMENT COMMANDS"
	@echo "======================="
	@echo ""
	@echo "📋 Pre-deployment checks:"
	@echo "  make check-deploy     - Run deployment validation"
	@echo "  make check-auto       - Run automatic deployment check"
	@echo "  make check-all        - Run all validation checks"
	@echo ""
	@echo "🔒 Protection:"
	@echo "  make install-hooks    - Install git protection hooks"
	@echo "  make check-hooks      - Verify git hooks installed"
	@echo ""
	@echo "🚀 Deployment:"
	@echo "  make deploy-dev       - Deploy to development server"
	@echo "  make deploy-prod      - Deploy to production server"
	@echo ""
	@echo "📚 Documentation:"
	@echo "  make guide            - Open deployment guide"
	@echo "  make readme           - Open README"
	@echo ""

# Pre-deployment validation
.PHONY: check-deploy
check-deploy:
	@echo "🔍 Running deployment validation..."
	@./scripts/deployment-validator.sh

.PHONY: check-auto
check-auto:
	@echo "🤖 Running automatic deployment check..."
	@./scripts/auto-deployment-check.sh

.PHONY: check-all
check-all: check-deploy check-auto
	@echo "✅ All validation checks complete!"

# Git hooks protection
.PHONY: install-hooks
install-hooks:
	@echo "🔒 Installing git protection hooks..."
	@./scripts/git-protection-hooks.sh

.PHONY: check-hooks
check-hooks:
	@echo "🔍 Checking git hooks..."
	@if [[ -f ".git/hooks/pre-push" ]]; then \
		echo "✅ pre-push hook installed"; \
	else \
		echo "❌ pre-push hook NOT installed"; \
		echo "   Run: make install-hooks"; \
	fi
	@if [[ -f ".git/hooks/pre-commit" ]]; then \
		echo "✅ pre-commit hook installed"; \
	else \
		echo "❌ pre-commit hook NOT installed"; \
		echo "   Run: make install-hooks"; \
	fi

# Deployment commands
.PHONY: deploy-dev
deploy-dev:
	@echo "🚀 Deploying to development server..."
	@echo "⚠️  Ensure you have run: make check-all"
	@echo ""
	@echo "📋 Deploy to development server (45.66.11.152):"
	@echo "   ssh root@45.66.11.152 'cd /root/999-agents-telegraf && ./scripts/deploy-development.sh'"

.PHONY: deploy-prod
deploy-prod:
	@echo "⚠️  ⚠️  ⚠️  PRODUCTION DEPLOYMENT! ⚠️  ⚠️  ⚠️  "
	@echo ""
	@echo "🚨 WARNING: This deploys to LIVE USERS!"
	@echo ""
	@echo "📋 Confirm you have:"
	@echo "   1. ✅ Tested on development server"
	@echo "   2. ✅ All health checks pass"
	@echo "   3. ✅ Team approval"
	@echo "   4. ✅ Read MASTER_DEPLOYMENT_GUIDE.md"
	@echo ""
	@echo "📋 Deploy to production server (212.86.115.30):"
	@echo "   ssh root@212.86.115.30 'cd /root/999-agents-telegraf && ./scripts/deploy-production.sh'"

# Health checks
.PHONY: health-dev
health-dev:
	@echo "🔍 Checking development server health..."
	@for i in 0 1; do \
		port=$$((3000 + i)); \
		echo -n "Bot $$i (port $$port): "; \
		curl -s -f http://45.66.11.152:$$port/health > /dev/null && echo "✅ OK" || echo "❌ FAILED"; \
	done

.PHONY: health-prod
health-prod:
	@echo "🔍 Checking production server health..."
	@for i in {0..9}; do \
		port=$$((3000 + i)); \
		echo -n "Bot $$i (port $$port): "; \
		curl -s -f http://212.86.115.30:$$port/health > /dev/null && echo "✅ OK" || echo "❌ FAILED"; \
	done

# Documentation
.PHONY: guide
guide:
	@echo "📚 Opening deployment guide..."
	@cat MASTER_DEPLOYMENT_GUIDE.md

.PHONY: readme
readme:
	@echo "📚 Opening deployment README..."
	@cat README_DEPLOYMENT.md

# Emergency procedures
.PHONY: emergency-stop-prod
emergency-stop-prod:
	@echo "🚨 EMERGENCY: Stopping all production containers..."
	@echo "⚠️  This will STOP ALL PRODUCTION BOTS!"
	@echo ""
	@echo "📋 Execute on production server:"
	@echo "   ssh root@212.86.115.30 'docker stop \$$(docker ps -aq) && docker rm \$$(docker ps -aq)'"

.PHONY: emergency-stop-dev
emergency-stop-dev:
	@echo "🚨 EMERGENCY: Stopping all development containers..."
	@echo "📋 Execute on development server:"
	@echo "   ssh root@45.66.11.152 'docker stop \$$(docker ps -aq) && docker rm \$$(docker ps -aq)'"

# CI/CD integration
.PHONY: ci-validate
ci-validate:
	@echo "🤖 CI/CD Validation..."
	@./scripts/auto-deployment-check.sh
	@echo ""
	@echo "✅ CI/CD validation passed!"
