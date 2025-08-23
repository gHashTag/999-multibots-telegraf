---
name: 🤖 AI Assistant Task
about: Template for tasks to be completed by AI assistants (Claude, ChatGPT, etc.)
title: '[AI-TASK] '
labels: ai-assistant, task
assignees: ''
---

## 🎯 Task Description
<!-- Clearly describe what needs to be done -->

**Task Type:**
- [ ] 🆕 New feature implementation
- [ ] 🐛 Bug fix
- [ ] 📚 Documentation update
- [ ] 🔧 Code refactoring  
- [ ] 🧪 Testing
- [ ] ⚙️ Configuration/Setup

## 📋 Requirements
<!-- List specific requirements and acceptance criteria -->

- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

## 🔗 Context & Resources
<!-- Provide relevant context, links, or resources -->

- Related files:
- Documentation:
- Examples:

## 🚨 **IMPORTANT: AI Assistant Rules**

### 🔄 **MANDATORY: One Task = One PR**
When you start working on this task:

1. ✅ **Create a NEW branch** specifically for this task
2. ✅ **Create a NEW pull request** when completed
3. ❌ **DON'T reuse existing or closed PRs**

### 🏷️ **Branch Naming Required:**
```bash
git checkout -b type/task-description

# Examples based on task type:
git checkout -b feat/implement-admin-middleware
git checkout -b fix/resolve-webhook-timeout
git checkout -b docs/update-api-documentation
git checkout -b test/add-integration-tests
```

### 📝 **Workflow Checklist:**
- [ ] Read task requirements carefully
- [ ] Create appropriately named branch
- [ ] Implement solution with tests
- [ ] Run linting and type checking
- [ ] Create new PR with proper description
- [ ] Link PR back to this issue

## 🧪 Testing Requirements
<!-- Specify how the task should be tested -->

- [ ] Unit tests required
- [ ] Integration tests required
- [ ] Manual testing steps
- [ ] No testing required

**Test scenarios:**
1. 
2. 
3. 

## ✅ Definition of Done
<!-- Criteria for considering this task complete -->

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Code reviewed and approved
- [ ] PR merged to main

## 📚 Additional Notes
<!-- Any additional context or considerations -->

---

**🤖 For AI Assistants:** Remember to follow our workflow rules strictly. Each task gets its own branch and PR. This helps maintain clean git history and makes code review easier for everyone!

**📖 Resources:**
- [Contributing Guide](../CONTRIBUTING.md)
- [Branch Naming Guide](../.github/BRANCH_NAMING_GUIDE.md)
- [PR Template](../.github/pull_request_template.md)