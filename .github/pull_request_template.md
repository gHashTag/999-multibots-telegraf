# 🚀 Pull Request Template

## 📝 Description
**Brief description of the changes:**

<!-- Describe what this PR does and why -->

## 🎯 Type of Change
<!-- Mark with an x -->
- [ ] 🐛 **Bug fix** (non-breaking change which fixes an issue)
- [ ] ✨ **New feature** (non-breaking change which adds functionality)
- [ ] 💥 **Breaking change** (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 **Documentation** (documentation only changes)
- [ ] 🎨 **Style** (formatting, missing semicolons, etc; no code change)
- [ ] ♻️ **Refactor** (refactoring production code)
- [ ] ✅ **Test** (adding missing tests, refactoring tests; no production code change)
- [ ] 🔧 **Chore** (updating build tasks, package manager configs, etc; no production code change)

## 🏷️ Related Issues
<!-- Link to issues this PR addresses -->
- Closes #(issue_number)
- Related to #(issue_number)

## 🧪 Testing Done
<!-- Mark with an x all that apply -->
- [ ] Unit tests pass locally
- [ ] Integration tests pass locally
- [ ] Manual testing completed
- [ ] No tests needed (documentation/configuration only)

**Test Details:**
<!-- Describe your testing -->

## 📋 Checklist
<!-- Mark with an x all completed items -->
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## 🔒 Security Review
<!-- Mark with an x if applicable -->
- [ ] This PR doesn't introduce security vulnerabilities
- [ ] Secrets/credentials are not exposed in code
- [ ] Input validation has been implemented where needed

## 📱 Screenshots/Videos
<!-- Add screenshots or videos if applicable -->

## 🚨 Breaking Changes
<!-- List any breaking changes -->

## 📚 Additional Context
<!-- Add any other context about the pull request here -->

---

## ⚠️ **MANDATORY RULES FOR CLAUDE CODE**

### 🤖 For AI Assistants (Claude, ChatGPT, etc.):
**КАЖДАЯ НОВАЯ ЗАДАЧА = НОВЫЙ PULL REQUEST**

**📋 Required Process:**
1. ✅ **New task started** → create new branch  
2. ✅ **Task completed** → open new PR
3. ❌ **DON'T reuse closed/existing PRs**
4. ✅ **One PR = one feature/task**

**🔄 Algorithm:**
```bash
git checkout main
git pull origin main  
git checkout -b branch-name-for-task
# complete task
git add . && git commit -m "description"
git push -u origin branch-name-for-task
gh pr create --title "title" --body "description" --base main
```

### 🏷️ Branch Naming Convention:
- `feat/description` - new features
- `fix/description` - bug fixes  
- `docs/description` - documentation
- `chore/description` - maintenance
- `test/description` - tests only

**Remember: One task = one branch = one NEW PR!** 🎯

---

*🤖 Generated with [Claude Code](https://claude.ai/code)*