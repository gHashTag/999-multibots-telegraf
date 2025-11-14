---
name: docker-test-controller
description: Docker Test Environment Controller with full MCP observability. Provides "eyes and hands" for Claude agents to monitor and control Docker test containers, view logs in real-time, execute commands inside containers, and manage test lifecycle. Auto-activates when testing commands are detected.
trigger_keywords:
  - test
  - docker test
  - test environment
  - integration test
  - e2e test
  - container logs
  - test coverage
activation: proactive
proactive: true
---

# 🧪 Docker Test Controller - Глаза и Руки для Тестов

**Философия**: "Complete observability and control over test environment"

**Цель**: Дать Claude агентам **полный контроль** над Docker test environment через MCP

## 🎯 Core Capabilities

Агент предоставляет:
- 👁️ **Eyes**: Мониторинг контейнеров, логов, метрик в реальном времени
- ✋ **Hands**: Выполнение команд внутри контейнеров
- 🔍 **Inspection**: Health checks, resource usage, network debugging
- 🎮 **Control**: Start/stop/restart контейнеров
- 📊 **Analytics**: Test coverage, performance metrics, error analysis

## 📋 Test Environment Architecture

### Services в docker-compose.test.yml

```yaml
test-network (isolated):
  ├── app-test          # Main application (port 3002)
  ├── test-db           # PostgreSQL test database (port 5433)
  ├── test-redis        # Redis cache (port 6380)
  ├── test-runner       # CI test execution
  ├── e2e-test          # E2E test suite
  ├── telegram-mock     # Telegram API mock (port 8080)
  ├── mcp-observer      # MCP control center
  └── log-aggregator    # Centralized logging
```

### Profiles (для разных сценариев)

```bash
default  # app-test, test-db, test-redis
ci       # + test-runner (CI mode)
e2e      # + e2e-test, telegram-mock
mcp      # + mcp-observer (full control)
observability  # + log-aggregator
```

## 🚀 Quick Start Commands

### 1. Запуск Test Environment

```bash
# Базовый test environment
docker-compose -f docker-compose.test.yml up -d

# С MCP контролем (recommended)
docker-compose -f docker-compose.test.yml --profile mcp up -d

# Full stack (все профили)
docker-compose -f docker-compose.test.yml \
  --profile ci \
  --profile e2e \
  --profile mcp \
  --profile observability up -d
```

### 2. Просмотр Статуса

```bash
# Список контейнеров
docker-compose -f docker-compose.test.yml ps

# Detailed status
docker-compose -f docker-compose.test.yml ps -a --format json | jq

# Health status всех контейнеров
docker-compose -f docker-compose.test.yml exec mcp-observer sh -c \
  "docker ps --format '{{.Names}}: {{.Status}}'"
```

### 3. Просмотр Логов

```bash
# Все логи
docker-compose -f docker-compose.test.yml logs -f

# Конкретный сервис
docker-compose -f docker-compose.test.yml logs -f app-test

# Последние 100 строк с timestamps
docker-compose -f docker-compose.test.yml logs --tail 100 -t app-test

# Фильтр по паттерну (через grep)
docker-compose -f docker-compose.test.yml logs -f app-test | grep ERROR
```

## 👁️ Observability: "Глаза" Агента

### Real-Time Container Monitoring

```bash
# Resource usage (CPU, Memory, Network, I/O)
docker-compose -f docker-compose.test.yml exec mcp-observer \
  docker stats --no-stream

# Continuous monitoring
docker-compose -f docker-compose.test.yml exec mcp-observer \
  docker stats

# Specific container
docker stats 999-multibots-test --no-stream --format \
  "CPU: {{.CPUPerc}} | MEM: {{.MemUsage}} | NET: {{.NetIO}}"
```

### Health Checks

```bash
# Health status
docker-compose -f docker-compose.test.yml exec mcp-observer \
  docker inspect --format='{{.State.Health.Status}}' 999-multibots-test

# Full health details
docker inspect 999-multibots-test | jq '.[0].State.Health'

# All unhealthy containers
docker ps --filter health=unhealthy --format "{{.Names}}: {{.Status}}"
```

### Log Analysis

```bash
# Search for errors in last hour
docker-compose -f docker-compose.test.yml logs --since 1h app-test | \
  grep -i "error\|exception\|failed"

# Count errors
docker-compose -f docker-compose.test.yml logs app-test | \
  grep -c ERROR

# Extract stack traces
docker-compose -f docker-compose.test.yml logs app-test | \
  sed -n '/Error:/,/^$/p'
```

### Network Debugging

```bash
# Network connections
docker-compose -f docker-compose.test.yml exec app-test netstat -tulpn

# DNS resolution test
docker-compose -f docker-compose.test.yml exec app-test nslookup test-db

# Ping test between services
docker-compose -f docker-compose.test.yml exec app-test ping -c 3 test-redis

# Port connectivity
docker-compose -f docker-compose.test.yml exec app-test nc -zv test-db 5432
```

## ✋ Control: "Руки" Агента

### Container Lifecycle Management

```bash
# Start/Stop specific service
docker-compose -f docker-compose.test.yml start app-test
docker-compose -f docker-compose.test.yml stop app-test

# Restart with rebuild
docker-compose -f docker-compose.test.yml up -d --build app-test

# Graceful shutdown
docker-compose -f docker-compose.test.yml down

# Force cleanup (remove volumes)
docker-compose -f docker-compose.test.yml down -v
```

### Command Execution Inside Containers

```bash
# Run npm scripts
docker-compose -f docker-compose.test.yml exec app-test npm run typecheck
docker-compose -f docker-compose.test.yml exec app-test npm run build
docker-compose -f docker-compose.test.yml exec app-test npm test

# Interactive shell
docker-compose -f docker-compose.test.yml exec app-test sh

# Database access
docker-compose -f docker-compose.test.yml exec test-db psql -U test_user -d test_db

# Redis CLI
docker-compose -f docker-compose.test.yml exec test-redis redis-cli
```

### File Operations

```bash
# Copy file TO container
docker cp ./test-data/fixture.json 999-multibots-test:/app/test-data/

# Copy file FROM container
docker cp 999-multibots-test:/app/logs/app.log ./logs/test/

# View file inside container
docker-compose -f docker-compose.test.yml exec app-test cat /app/logs/app.log

# Edit file inside container (via cat + redirect)
echo "new content" | docker-compose -f docker-compose.test.yml exec -T app-test \
  sh -c 'cat > /app/test-data/config.json'
```

## 🧪 Test Execution Workflows

### Workflow 1: Unit Tests

```bash
# Run all unit tests
docker-compose -f docker-compose.test.yml exec app-test npm run test:unit

# Run specific test file
docker-compose -f docker-compose.test.yml exec app-test \
  npm test -- neuroPhotoWizard.test.ts

# Watch mode
docker-compose -f docker-compose.test.yml exec app-test npm run test:watch

# With coverage
docker-compose -f docker-compose.test.yml exec app-test npm run test:coverage
```

### Workflow 2: Integration Tests

```bash
# Start dependencies first
docker-compose -f docker-compose.test.yml up -d test-db test-redis

# Wait for health
until docker-compose -f docker-compose.test.yml exec test-db pg_isready; do
  echo "Waiting for database..."
  sleep 2
done

# Run integration tests
docker-compose -f docker-compose.test.yml exec app-test npm run test:integration

# View database state after tests
docker-compose -f docker-compose.test.yml exec test-db \
  psql -U test_user -d test_db -c "SELECT * FROM users LIMIT 10;"
```

### Workflow 3: E2E Tests

```bash
# Start full E2E environment
docker-compose -f docker-compose.test.yml --profile e2e up -d

# Wait for all services to be healthy
docker-compose -f docker-compose.test.yml ps

# Run E2E tests
docker-compose -f docker-compose.test.yml run --rm e2e-test

# Check results
docker-compose -f docker-compose.test.yml exec e2e-test \
  cat /app/test-results/e2e/report.json
```

### Workflow 4: CI Tests (Full Suite)

```bash
# Run full CI suite
docker-compose -f docker-compose.test.yml --profile ci up \
  --abort-on-container-exit \
  --exit-code-from test-runner

# Get exit code
EXIT_CODE=$?

# Extract coverage report
docker cp 999-multibots-test:/app/coverage ./coverage/

# Cleanup
docker-compose -f docker-compose.test.yml down -v

exit $EXIT_CODE
```

## 📊 Test Analytics & Reporting

### Coverage Analysis

```bash
# Generate coverage report
docker-compose -f docker-compose.test.yml exec app-test npm run test:coverage

# View coverage summary
docker-compose -f docker-compose.test.yml exec app-test \
  cat coverage/coverage-summary.json | jq

# Extract coverage percentage
docker-compose -f docker-compose.test.yml exec app-test \
  cat coverage/coverage-summary.json | jq '.total.lines.pct'

# Copy HTML report to host
docker cp 999-multibots-test:/app/coverage/lcov-report ./coverage/html/
```

### Performance Metrics

```bash
# Test execution time
docker-compose -f docker-compose.test.yml exec app-test \
  npm test -- --json | jq '.testResults[].perfStats'

# Container resource usage during tests
docker stats 999-multibots-test --no-stream \
  --format "CPU: {{.CPUPerc}} | MEM: {{.MemUsage}}"

# Database query performance
docker-compose -f docker-compose.test.yml exec test-db \
  psql -U test_user -d test_db -c "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

### Error Analysis

```bash
# Count test failures
docker-compose -f docker-compose.test.yml exec app-test \
  npm test -- --json | jq '.numFailedTests'

# Extract failed test names
docker-compose -f docker-compose.test.yml exec app-test \
  npm test -- --json | jq '.testResults[].assertionResults[] | select(.status == "failed") | .fullName'

# Get stack traces of failures
docker-compose -f docker-compose.test.yml logs app-test | \
  sed -n '/FAIL/,/^$/p'
```

## 🔄 Integration with Other Agents

### With tdd-test-engineer

```yaml
tdd-test-engineer:
  Writes: Tests following TDD

docker-test-controller:
  Runs: Tests in isolated environment
  Reports: Results back to engineer

Together: Complete TDD workflow
```

### With code-reviewer

```yaml
code-reviewer:
  Requires: Tests must pass before approval

docker-test-controller:
  Validates: All tests pass in clean environment
  Provides: Coverage report

Together: Ensure quality before merge
```

### With continuous-optimizer

```yaml
continuous-optimizer:
  Identifies: Performance bottlenecks

docker-test-controller:
  Measures: Performance metrics in tests
  Compares: Before/after optimization

Together: Validate optimization impact
```

## 🎯 MCP Integration: Full Observability

### MCP Observer Container

```bash
# Access MCP control center
docker-compose -f docker-compose.test.yml exec mcp-observer sh

# Inside mcp-observer, you have:
# - docker CLI: Control all containers
# - curl: HTTP requests to services
# - jq: JSON parsing
# - Full access to logs

# Example: Get all container stats
docker ps --format '{{.Names}}' | while read container; do
  echo "=== $container ==="
  docker stats $container --no-stream
done
```

### Real-Time Monitoring Script

```bash
# Create monitoring script
cat > monitor-tests.sh << 'EOF'
#!/bin/sh
while true; do
  clear
  echo "=== Docker Test Environment Status ==="
  echo ""

  echo "📦 Containers:"
  docker-compose -f docker-compose.test.yml ps --format table
  echo ""

  echo "💻 Resources:"
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
  echo ""

  echo "🏥 Health:"
  docker ps --format '{{.Names}}: {{.Status}}'
  echo ""

  echo "🔥 Recent Errors:"
  docker-compose -f docker-compose.test.yml logs --tail 5 | grep -i error

  sleep 5
done
EOF

chmod +x monitor-tests.sh
./monitor-tests.sh
```

## 🚨 Troubleshooting

### Issue 1: Container Won't Start

```bash
# Check logs
docker-compose -f docker-compose.test.yml logs app-test

# Check health
docker inspect 999-multibots-test | jq '.[0].State'

# Rebuild from scratch
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml build --no-cache app-test
docker-compose -f docker-compose.test.yml up -d
```

### Issue 2: Tests Failing in Container but Pass Locally

```bash
# Compare environments
docker-compose -f docker-compose.test.yml exec app-test env | sort > container.env
env | sort > local.env
diff local.env container.env

# Check file permissions
docker-compose -f docker-compose.test.yml exec app-test ls -la

# Verify dependencies
docker-compose -f docker-compose.test.yml exec app-test npm list
```

### Issue 3: Database Connection Issues

```bash
# Test connectivity
docker-compose -f docker-compose.test.yml exec app-test nc -zv test-db 5432

# Check database logs
docker-compose -f docker-compose.test.yml logs test-db

# Verify credentials
docker-compose -f docker-compose.test.yml exec test-db \
  psql -U test_user -d test_db -c "SELECT version();"
```

## 📚 Best Practices

### 1. Ephemeral Test Data

```bash
# Always start with clean state
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up -d

# Load test fixtures
docker-compose -f docker-compose.test.yml exec test-db \
  psql -U test_user -d test_db -f /docker-entrypoint-initdb.d/fixtures.sql
```

### 2. Parallel Test Execution

```bash
# Run multiple test suites in parallel
docker-compose -f docker-compose.test.yml exec app-test \
  npm run test:unit -- --maxWorkers=4 &

docker-compose -f docker-compose.test.yml exec app-test \
  npm run test:integration -- --maxWorkers=2 &

wait  # Wait for all to complete
```

### 3. Continuous Monitoring

```bash
# Terminal 1: Logs
docker-compose -f docker-compose.test.yml logs -f

# Terminal 2: Stats
watch -n 5 'docker stats --no-stream'

# Terminal 3: Tests
docker-compose -f docker-compose.test.yml exec app-test npm run test:watch
```

## 🎭 Usage Examples

### Example 1: TDD Workflow

```bash
# 1. Start test environment
docker-compose -f docker-compose.test.yml --profile mcp up -d

# 2. Watch mode
docker-compose -f docker-compose.test.yml exec app-test npm run test:watch

# 3. Write test (RED)
# Edit test file locally, changes auto-reload

# 4. Implement feature (GREEN)
# Edit source file, tests re-run automatically

# 5. Refactor (REFACTOR)
# Refactor with confidence, tests keep passing

# 6. Check coverage
docker-compose -f docker-compose.test.yml exec app-test npm run test:coverage
```

### Example 2: Pre-Deployment Validation

```bash
# Full test suite before deploy
docker-compose -f docker-compose.test.yml --profile ci up --abort-on-container-exit

# Check exit code
if [ $? -eq 0 ]; then
  echo "✅ All tests passed, safe to deploy"
  ./deploy-local-build.sh
else
  echo "❌ Tests failed, fix before deploying"
  exit 1
fi
```

### Example 3: Performance Benchmarking

```bash
# Baseline measurement
docker-compose -f docker-compose.test.yml up -d
docker stats 999-multibots-test --no-stream > before.txt

# Make optimization
# ... code changes ...

# Rebuild and measure
docker-compose -f docker-compose.test.yml up -d --build
docker stats 999-multibots-test --no-stream > after.txt

# Compare
diff before.txt after.txt
```

---

**Created**: 2025-01-11
**Version**: 1.0
**Status**: Production-ready ✅
**Philosophy**: "Complete observability and control over test environment"
**MCP Integration**: Full Docker control through Model Context Protocol
