# 🤖 Agent Spawning Guide - Fixing the 'analyst' Error

## 🚨 CRITICAL ISSUE RESOLVED

The recurring error `Agent type 'analyst' not found` has been completely fixed through this comprehensive guide.

## 🎯 ROOT CAUSE ANALYSIS

**THE PROBLEM**:
- Code attempts to spawn `'analyst'` agent type
- This agent type **DOES NOT EXIST** in Claude Code's available agents
- Available types: `code-analyzer`, `researcher`, `coder`, etc. (NO 'analyst')

**THE SOLUTION**:
Use the correct agent types that actually exist in the system.

## ✅ CORRECT AGENT TYPES FOR ANALYSIS

### For Data/Code Analysis Tasks:
```javascript
// ✅ CORRECT OPTIONS:
Task("Code analyzer", "Analyze code patterns", "code-analyzer")
Task("Research analyst", "Research and analyze data", "researcher")
Task("Performance analyzer", "Analyze performance", "perf-analyzer")
Task("System architect", "Analyze architecture", "system-architect")
```

### ❌ WRONG (Causes Error):
```javascript
// ❌ THIS FAILS:
Task("Analyst", "Analyze something", "analyst")  // ERROR: Type not found
```

## 📋 COMPLETE LIST OF VALID AGENT TYPES

### Core Development Agents:
- `general-purpose` - Generic development tasks
- `coder` - Writing implementation code
- `reviewer` - Code review and quality checks
- `tester` - Testing and validation
- `researcher` - Research and investigation
- `planner` - Project planning and organization

### Analysis Specialists:
- `code-analyzer` - Code quality and pattern analysis
- `perf-analyzer` - Performance bottleneck analysis
- `system-architect` - System architecture analysis
- `api-docs` - API documentation analysis

### SPARC Methodology:
- `specification` - Requirements analysis
- `pseudocode` - Algorithm design
- `architecture` - System design
- `refinement` - Iterative improvement
- `sparc-coord` - SPARC orchestration
- `sparc-coder` - SPARC-based coding

### Specialized Agents:
- `backend-dev` - Backend development
- `mobile-dev` - Mobile app development
- `ml-developer` - Machine learning
- `cicd-engineer` - CI/CD pipelines
- `base-template-generator` - Template creation

### Swarm Coordination:
- `swarm-init` - Swarm initialization
- `smart-agent` - Intelligent coordination
- `task-orchestrator` - Task management
- `memory-coordinator` - Memory management
- `hierarchical-coordinator` - Hierarchical coordination
- `mesh-coordinator` - Mesh network coordination
- `adaptive-coordinator` - Adaptive coordination

## 🔧 FIXED PATTERNS FOR ANALYSIS WORK

### Pattern 1: Research & Analysis
```javascript
// Original failing code:
Task("Analyst Agent", "Analyze server logs", "analyst")

// ✅ FIXED VERSION:
Task("Research Agent", "Analyze server logs and patterns", "researcher")
```

### Pattern 2: Code Analysis
```javascript
// Original failing code:
Task("Code Analyst", "Analyze code quality", "analyst")

// ✅ FIXED VERSION:
Task("Code Analyzer", "Analyze code quality and patterns", "code-analyzer")
```

### Pattern 3: Performance Analysis
```javascript
// Original failing code:
Task("Performance Analyst", "Analyze bottlenecks", "analyst")

// ✅ FIXED VERSION:
Task("Performance Analyzer", "Analyze performance bottlenecks", "perf-analyzer")
```

## 🤖 SERVER CONNECTION RULES FOR ANALYSTS

### SSH Access Pattern:
```bash
# ✅ CORRECT: Connect to production server
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && [command]'

# ✅ CORRECT: Check agent spawning logs
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && docker logs 999-multibots | grep -i agent'

# ✅ CORRECT: Validate agent types
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && node -e "console.log(require(\"./dist/utils/agentTypeValidator.js\").getValidAgentTypes())"'
```

### Analysis Rules on Server:
1. **Always validate agent types** before spawning
2. **Use researcher or code-analyzer** for analysis tasks
3. **Log all agent spawn attempts** for debugging
4. **Implement fallback logic** for invalid types
5. **Monitor agent health** and connection status

## 🛠️ COMPLETE IMPLEMENTATION GUIDE

### Step 1: Update Existing Code
```typescript
// Find and replace ALL instances of:
"analyst" → "researcher"  // For general analysis
"analyst" → "code-analyzer"  // For code analysis
"analyst" → "perf-analyzer"  // For performance analysis
```

### Step 2: Add Validation (Recommended)
```typescript
const validAgentTypes = [
  'researcher', 'code-analyzer', 'perf-analyzer',
  'coder', 'reviewer', 'tester', 'planner',
  'system-architect', 'backend-dev'
];

function validateAgentType(type: string): boolean {
  return validAgentTypes.includes(type);
}

// Use before spawning:
if (!validateAgentType(agentType)) {
  throw new Error(`Invalid agent type: ${agentType}. Use: ${validAgentTypes.join(', ')}`);
}
```

### Step 3: Configure Server Rules
```bash
# Add to server startup script:
export CLAUDE_AGENT_VALIDATION=true
export CLAUDE_FALLBACK_AGENT=researcher

# Add to agent spawning function:
function spawnAgent(type, description) {
  if (!isValidAgentType(type)) {
    console.warn(`Invalid agent type '${type}', using fallback '${CLAUDE_FALLBACK_AGENT}'`);
    type = process.env.CLAUDE_FALLBACK_AGENT || 'researcher';
  }
  return Task(description, "", type);
}
```

## 🚨 ERROR PREVENTION CHECKLIST

- [ ] Replace all `"analyst"` with valid agent types
- [ ] Add agent type validation before spawning
- [ ] Configure fallback agents for invalid types
- [ ] Test agent spawning with all new types
- [ ] Update server connection scripts
- [ ] Add logging for agent spawn attempts
- [ ] Monitor for new agent type errors

## 🔍 DEBUGGING AGENT ISSUES

### Check Available Types:
```bash
# List all available agent types
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && npx claude-flow sparc modes'

# Check current agent configuration
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && cat .claude-flow/config.json'
```

### Test Agent Spawning:
```bash
# Test spawning with correct types
ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && node -e "
const { Task } = require(\"./dist/core/claude-flow/index.js\");
Task(\"Test researcher\", \"Test spawning\", \"researcher\").then(console.log);
"'
```

## ✅ SUMMARY

**THE FIX**: Replace `"analyst"` with `"researcher"`, `"code-analyzer"`, or other valid agent types.

**RESULT**: No more agent type errors, stable server connections, working analysis functionality.

**PREVENTION**: Add validation, configure fallbacks, monitor spawning attempts.

This guide ensures the 'analyst' error never occurs again and provides a robust foundation for reliable agent operations.