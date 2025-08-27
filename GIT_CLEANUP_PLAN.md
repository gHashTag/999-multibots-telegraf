# Git History Cleanup Plan

## Overview
This document outlines the plan for cleaning up any sensitive information that may have been accidentally committed to the git history.

## Step 1: Pre-cleanup Preparation

### 1.1 Create Backup
```bash
# Create timestamped backup
cp -r . ../repo_backup_$(date +%Y%m%d_%H%M%S)
```

### 1.2 Install Required Tools
```bash
# Install git-filter-repo
brew install git-filter-repo

# Install other required tools
npm install
```

### 1.3 Notify Team
- Send notification to all team members
- Coordinate timing for the cleanup
- Ensure everyone has committed/pushed important changes

## Step 2: Security Scan

### 2.1 Initial Scan
```bash
# Run security scan
./scripts/security-scan.sh
```

### 2.2 Document Findings
- Note all instances of sensitive information
- Categorize by severity
- Document replacement values

## Step 3: Cleanup Process

### 3.1 Environment Setup
```bash
# Ensure clean working directory
git status
git stash # if needed

# Create cleanup branch
git checkout -b security/history-cleanup
```

### 3.2 Run Cleanup
```bash
# Execute cleanup script
./scripts/clean-git-secrets.sh
```

### 3.3 Verify Cleanup
```bash
# Check history for sensitive information
./scripts/security-scan.sh

# Manual review of key files
git log --patch
```

## Step 4: Post-cleanup Actions

### 4.1 Force Push Changes
```bash
# Force push to all branches
git push origin --force --all
git push origin --force --tags
```

### 4.2 Update Protected Branches
1. Temporarily disable branch protection
2. Force push changes
3. Re-enable branch protection

### 4.3 Clean Local Copies
Instructions for team members:
```bash
# Instructions for team
git fetch origin
git reset --hard origin/main
git clean -fd
```

## Step 5: Preventive Measures

### 5.1 Install Git Hooks
```bash
# Install pre-commit hooks
./scripts/install-hooks.sh
```

### 5.2 Update Security Practices
- Review .gitignore
- Set up automated security scanning
- Review deployment scripts

## Step 6: Documentation Updates

### 6.1 Update Security Docs
- Update SECURITY.md
- Document new security practices
- Create incident report

### 6.2 Team Training
- Schedule security training
- Review secure development practices
- Document lessons learned

## Important Files Changed
- .gitignore
- SECURITY.md
- scripts/security-scan.sh
- scripts/pre-commit-security.sh
- scripts/clean-git-secrets.sh
- src/api_server/index.ts
