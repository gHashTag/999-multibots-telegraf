# Agent Type Validation System

## Overview

This document describes the comprehensive agent type validation and mapping system implemented to prevent errors when spawning agents and ensure proper fallbacks.

## Problem Solved

**Original Issue**: The agent type 'analyst' was being used but didn't exist in the system, causing spawn failures and server connection errors.

**Solution**: Comprehensive validation system with type mapping, error handling, and graceful fallbacks.

## Key Features

### 1. Agent Type Validation (`agentTypeValidator.ts`)

- **Complete validation** of agent types before spawning
- **Type mapping/aliases** for common mistakes (e.g., 'analyst' → 'code-analyzer')
- **Similarity suggestions** for invalid types using Levenshtein distance
- **Deprecation warnings** for outdated agent types
- **Fallback system** with sensible defaults

### 2. Connection Management (`agentConnectionManager.ts`)

- **Retry logic** with exponential backoff for failed connections
- **Health monitoring** for agent availability
- **Connection status tracking** with detailed metrics
- **Timeout handling** and error recovery
- **Batch spawning** support for multiple agents

### 3. High-Level Helper (`agentSpawnHelper.ts`)

- **Safe spawning** with full validation and error handling
- **Claude Flow hooks integration** for coordination
- **Batch operations** for spawning multiple agents
- **Memory storage** for spawn results and coordination
- **Performance metrics** and monitoring

### 4. Centralized Configuration (`agentConfig.ts`)

- **Environment-specific settings** (dev/test/production)
- **Agent priorities** for spawn ordering
- **Compatibility matrix** for agent collaboration
- **Feature flags** for enabling/disabling functionality
- **Performance tuning** parameters

## Usage Examples

### Basic Agent Spawning

```typescript
import { spawnAgentSafely } from '@/utils/agentSpawnHelper'

// Safe spawning with validation
const result = await spawnAgentSafely('analyst', 'Analyze code quality')
// Automatically maps 'analyst' → 'code-analyzer'

console.log(result.success) // true
console.log(result.agentType) // 'code-analyzer'
console.log(result.mappingWarning) // "Agent type 'analyst' mapped to 'code-analyzer'"
```

### Batch Agent Spawning

```typescript
import { spawnAgentsBatch } from '@/utils/agentSpawnHelper'

const agents = [
  { type: 'coder', description: 'Implement feature X' },
  { type: 'analyst', description: 'Analyze performance' }, // Will be mapped
  { type: 'tester', description: 'Write tests' },
  { type: 'invalid-type', description: 'Some task' } // Will use fallback
]

const results = await spawnAgentsBatch(agents)
// All agents spawned with proper validation and error handling
```

### Validation Only

```typescript
import { validateAgentTypeForSpawn } from '@/utils/agentSpawnHelper'

const validation = validateAgentTypeForSpawn('analyst')
console.log(validation.isValid) // true
console.log(validation.validatedType) // 'code-analyzer'
console.log(validation.errorMessage) // "Agent type 'analyst' will be mapped to 'code-analyzer'"
```

### Connection Management

```typescript
import { agentConnectionManager } from '@/utils/agentConnectionManager'

// Get health status
const health = await agentConnectionManager.performHealthCheck()
console.log(health.healthScore) // 0-100

// Get connection statuses
const statuses = agentConnectionManager.getAllConnectionStatuses()
console.log(agentConnectionManager.getStatusReport())
```

## Agent Type Mappings

### Core Mappings

| Alias | Maps To | Status |
|-------|---------|--------|
| `analyst` | `code-analyzer` | ⚠️ Deprecated |
| `analyzer` | `code-analyzer` | ✅ Valid |
| `dev` | `coder` | ✅ Valid |
| `test` | `tester` | ✅ Valid |
| `review` | `reviewer` | ✅ Valid |
| `architect` | `system-architect` | ✅ Valid |

### Complete Valid Types

**Core Development:**
- `coder`, `reviewer`, `tester`, `planner`, `researcher`

**Specialized:**
- `backend-dev`, `mobile-dev`, `ml-developer`, `cicd-engineer`
- `system-architect`, `code-analyzer`, `api-docs`

**SPARC Methodology:**
- `sparc-coord`, `sparc-coder`, `specification`, `pseudocode`, `architecture`, `refinement`

**GitHub Integration:**
- `github-modes`, `pr-manager`, `code-review-swarm`, `issue-tracker`

**Telegram Bot Management:**
- `telegram-user-agent`

## Error Handling

### Invalid Agent Types

```typescript
// Input: 'invalid-agent-type'
// Output: Helpful error message with suggestions

🚨 Invalid Agent Type: 'invalid-agent-type'

❓ Did you mean one of these?
  • coder
  • code-analyzer
  • tester

💡 Most common agent types:
  • coder - General development tasks
  • code-analyzer - Code analysis (replaces 'analyst')
  • tester - Testing and QA

🔄 Using fallback: 'coder'
```

### Connection Failures

- **Automatic retries** with exponential backoff
- **Timeout handling** with configurable limits
- **Error callbacks** for custom handling
- **Health monitoring** to track failures
- **Graceful degradation** with fallback types

## Configuration

### Environment Settings

```typescript
// Development
{
  features: { enableMetricsCollection: false },
  performance: { maxConcurrentSpawns: 5 },
  environment: { logLevel: 'debug' }
}

// Production
{
  features: { /* all enabled */ },
  performance: { maxConcurrentSpawns: 20 },
  environment: { logLevel: 'info' }
}

// Testing
{
  features: { enableHealthMonitoring: false },
  connectionManagement: { enableHealthChecks: false },
  environment: { logLevel: 'warn' }
}
```

### Feature Flags

- `enableTypeValidation` - Enable/disable agent type validation
- `enableConnectionRetries` - Enable/disable retry logic
- `enableHealthMonitoring` - Enable/disable health checks
- `enableHooksIntegration` - Enable/disable Claude Flow hooks
- `enableBatchSpawning` - Enable/disable batch operations
- `enableMetricsCollection` - Enable/disable metrics

## Monitoring and Metrics

### Health Metrics

```typescript
const metrics = await getSpawnMetrics()

{
  totalSpawns: 150,
  successRate: 98.5,
  averageSpawnTime: 850, // ms
  agentTypeDistribution: {
    'coder': 45,
    'code-analyzer': 20, // includes mapped 'analyst'
    'tester': 30,
    'reviewer': 25
  },
  connectionHealth: {
    healthy: ['coder', 'tester'],
    unhealthy: [],
    healthScore: 100
  }
}
```

### Status Reports

```typescript
📊 Agent Connection Status
═══════════════════════════
🟢 Connected: 4/4 (100%)

✅ Connected Agents:
  • coder (850ms)
  • code-analyzer (920ms)
  • tester (780ms)
  • reviewer (1100ms)
```

## Testing

### Comprehensive Test Coverage

**Agent Type Validator Tests:**
- ✅ Valid type validation
- ✅ Alias mapping (analyst → code-analyzer)
- ✅ Invalid type handling with suggestions
- ✅ Edge cases (null, undefined, special characters)
- ✅ Performance testing (1000 validations < 1s)

**Connection Manager Tests:**
- ✅ Connection status tracking
- ✅ Retry logic and exponential backoff
- ✅ Health check calculations
- ✅ Concurrent spawning
- ✅ Error handling and recovery

**Integration Tests:**
- ✅ End-to-end spawning workflow
- ✅ Claude Flow hooks integration
- ✅ Memory storage and retrieval
- ✅ Batch operations
- ✅ Configuration validation

### Running Tests

```bash
# Run all agent validation tests
npm test -- --testPathPattern="agent"

# Run specific test suites
npm test -- tests/utils/agentTypeValidator.test.ts
npm test -- tests/utils/agentConnectionManager.test.ts

# Run with coverage
npm test -- --coverage --testPathPattern="agent"
```

## Migration Guide

### From Old System

**Before:**
```typescript
// Direct agent spawning (could fail with 'analyst')
spawn('analyst', 'Analyze code')
```

**After:**
```typescript
// Safe spawning with validation
import { spawnAgentSafely } from '@/utils/agentSpawnHelper'
const result = await spawnAgentSafely('analyst', 'Analyze code')
```

### Updating Existing Code

1. **Replace direct spawn calls** with `spawnAgentSafely()`
2. **Update 'analyst' references** to 'code-analyzer' (optional - mapping handles this)
3. **Add error handling** for spawn failures
4. **Use batch spawning** for multiple agents
5. **Enable health monitoring** in production

## Claude Flow Integration

### Hooks Execution

```typescript
// Automatically executed for coordination
npx claude-flow@alpha hooks pre-task --description "Analyze code quality"
npx claude-flow@alpha hooks session-restore --session-id "swarm-analysis"
npx claude-flow@alpha hooks post-task --task-id "code-analyzer-123"
npx claude-flow@alpha hooks notify --message "Code analysis completed"
```

### Memory Storage

```typescript
// Spawn results stored for coordination
{
  "swarm/agents/code-analyzer/1758201084": {
    "agentType": "code-analyzer",
    "originalType": "analyst",
    "spawnedAt": "2025-09-18T13:11:24.000Z",
    "status": "completed",
    "result": { /* analysis results */ }
  }
}
```

## Best Practices

### 1. Always Use Safe Spawning

```typescript
// ✅ Good
const result = await spawnAgentSafely('analyst', 'Analyze performance')
if (result.success) {
  // Handle success
} else {
  // Handle error with result.error
}

// ❌ Avoid
spawn('analyst', 'Analyze performance') // No validation or error handling
```

### 2. Handle Mapping Warnings

```typescript
const result = await spawnAgentSafely('analyst', 'Analyze code')
if (result.mappingWarning) {
  logger.warn('Agent type mapped', {
    original: result.originalType,
    mapped: result.agentType,
    warning: result.mappingWarning
  })
}
```

### 3. Use Batch Operations

```typescript
// ✅ Good - Batch spawning
const agents = [
  { type: 'coder', description: 'Implement feature' },
  { type: 'tester', description: 'Write tests' },
  { type: 'reviewer', description: 'Review code' }
]
const results = await spawnAgentsBatch(agents)

// ❌ Less efficient - Sequential spawning
for (const agent of agents) {
  await spawnAgentSafely(agent.type, agent.description)
}
```

### 4. Monitor Health

```typescript
// Set up monitoring
setInterval(async () => {
  const health = await agentConnectionManager.performHealthCheck()
  if (health.healthScore < 80) {
    logger.warn('Low agent health detected', health)
  }
}, 60000)
```

### 5. Environment-Specific Configuration

```typescript
// Use environment-specific settings
import { agentConfig } from '@/config/agentConfig'

if (agentConfig.environment.isProduction) {
  // Enable all monitoring and metrics
} else if (agentConfig.environment.isDevelopment) {
  // Reduced overhead for development
}
```

## Troubleshooting

### Common Issues

**1. Agent Type Not Found**
```
Error: Invalid agent type 'analyst'
Solution: Use 'code-analyzer' or let the system auto-map
```

**2. Connection Timeouts**
```
Error: Agent spawn timeout after 30000ms
Solution: Increase timeout or check agent availability
```

**3. High Failure Rate**
```
Health Score: 45%
Solution: Check agent types, increase retries, verify configuration
```

### Debug Commands

```bash
# Check agent configuration
node -e "console.log(require('./dist/config/agentConfig').agentConfig)"

# Validate specific agent type
node -e "const {validateAndMapAgentType} = require('./dist/utils/agentTypeValidator'); console.log(validateAndMapAgentType('analyst'))"

# Check connection health
node -e "const {agentConnectionManager} = require('./dist/utils/agentConnectionManager'); agentConnectionManager.performHealthCheck().then(console.log)"
```

## Future Enhancements

### Planned Features

1. **Dynamic Agent Discovery** - Auto-detect available agents
2. **Load Balancing** - Distribute spawns across multiple instances
3. **Predictive Spawning** - Pre-spawn agents based on usage patterns
4. **Advanced Monitoring** - Integration with external monitoring systems
5. **Agent Mesh Networking** - Direct agent-to-agent communication

### API Extensions

1. **GraphQL Interface** - Query agent types and statuses
2. **WebSocket Updates** - Real-time agent status updates
3. **REST API** - HTTP endpoints for agent management
4. **CLI Tools** - Command-line agent management utilities

## Conclusion

The Agent Type Validation System provides:

- ✅ **Robust validation** preventing spawn failures
- ✅ **Seamless migration** from 'analyst' to 'code-analyzer'
- ✅ **Comprehensive error handling** with helpful messages
- ✅ **Health monitoring** and performance metrics
- ✅ **Future-proof architecture** with easy extensibility

This system ensures reliable agent spawning while maintaining backward compatibility and providing clear upgrade paths for improved functionality.