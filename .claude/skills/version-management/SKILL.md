---
name: 'Version Management & Snapshots'
description: 'Automated semantic versioning, git tagging, and production snapshot management with rollback capability'
---

# Version Management & Snapshots

## When to Use This Skill

Automatically activate when detecting:

- User mentions "создать версию", "сохранить snapshot", "version", "release"
- Successful production deployment completion
- Request to tag or snapshot current state
- Need to rollback to previous version
- "откатиться к версии", "rollback"

## Current Version

**Latest Stable**: v0.0.6 (2025-11-12)

## Version Numbering Scheme

```
v0.0.6
│ │ └─ Patch: Bug fixes, minor improvements
│ └─── Minor: New features, backward compatible
└───── Major: Breaking changes, major releases
```

### Version History

- **v0.0.6** (2025-11-12): Docker build optimization, HeyGen webhook stable
- **v0.0.5**: Previous working state
- **v0.0.3**: Stable version before major changes
- **v0.0.1**: Initial production release

## Creating New Version

### Step 1: Determine Version Number

**When to increment:**

- **Patch (0.0.X)**: Bug fixes, config changes, minor updates
- **Minor (0.X.0)**: New features, API additions (backward compatible)
- **Major (X.0.0)**: Breaking changes, architecture overhaul

### Step 2: Create Git Tag

```bash
# Current version pattern: v0.0.X
NEXT_VERSION="v0.0.7"  # Increment based on changes

# Create annotated tag with detailed message
git tag -a $NEXT_VERSION -m "🎉 RELEASE $NEXT_VERSION: Brief description

✅ Key achievement 1
✅ Key achievement 2
✅ Key achievement 3

Features:
- Feature 1
- Feature 2
- Feature 3

Performance:
- Metric 1
- Metric 2"

# Push tag to remote
git push origin $NEXT_VERSION
git push origin production
```

### Step 3: Create Production Snapshot

```bash
# SSH to production server
ssh prod999

# Create snapshot with version number
cd /root/bot-farm
tar -czf .snapshots/$NEXT_VERSION-$(date +%Y%m%d-%H%M%S).tar.gz \
  --exclude='.snapshots' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  .

# Verify snapshot created
ls -lah .snapshots/

# Keep only last 5 snapshots (delete old ones)
cd .snapshots
ls -t | tail -n +6 | xargs -r rm
```

### Step 4: Document Release

Update version tracking file if needed:

```bash
# On local machine
echo "$NEXT_VERSION - $(date +%Y-%m-%d) - Description" >> VERSION_HISTORY.md
git add VERSION_HISTORY.md
git commit -m "📝 DOC: Add version $NEXT_VERSION to history"
git push origin production
```

## Snapshot Management

### Snapshot Location

```
/root/bot-farm/.snapshots/
├── v0.0.6-20251112-030752.tar.gz  ← Current stable
├── v0.0.5-20251110-143022.tar.gz  ← Previous
└── v0.0.4-20251108-092341.tar.gz  ← Older
```

### Snapshot Naming Convention

```
v{MAJOR}.{MINOR}.{PATCH}-{YYYYMMDD}-{HHMMSS}.tar.gz

Examples:
v0.0.6-20251112-030752.tar.gz
v0.1.0-20251115-120000.tar.gz
v1.0.0-20260101-000000.tar.gz
```

### Creating Snapshot Manually

```bash
ssh prod999 "cd /root/bot-farm && \
  mkdir -p .snapshots && \
  tar -czf .snapshots/v0.0.7-$(date +%Y%m%d-%H%M%S).tar.gz \
  --exclude='.snapshots' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  ."
```

### Listing Snapshots

```bash
ssh prod999 "ls -lah /root/bot-farm/.snapshots/"
```

### Cleaning Old Snapshots

```bash
# Keep only last 5 snapshots
ssh prod999 "cd /root/bot-farm/.snapshots && ls -t | tail -n +6 | xargs -r rm"

# Or manually delete specific snapshot
ssh prod999 "rm /root/bot-farm/.snapshots/v0.0.3-*.tar.gz"
```

## Rollback to Previous Version

### Quick Rollback (Last Snapshot)

```bash
# 1. Stop current application
ssh prod999 "cd /root/bot-farm && docker compose down"

# 2. Find snapshot to restore
ssh prod999 "ls -lh /root/bot-farm/.snapshots/"

# 3. Extract snapshot (example: v0.0.5)
ssh prod999 "cd /root/bot-farm && \
  tar -xzf .snapshots/v0.0.5-20251110-143022.tar.gz"

# 4. Restart application
ssh prod999 "cd /root/bot-farm && docker compose up -d"

# 5. Verify logs
ssh prod999 "docker logs -f --tail 50 999-multibots"
```

### Full Rollback with Git

```bash
# 1. Checkout specific tag
git checkout v0.0.5

# 2. Deploy to production
/deploy

# 3. Verify deployment
ssh prod999 "docker logs -f --tail 50 999-multibots"
```

## Verification Checklist

After creating version, verify:

- [ ] Git tag created: `git tag -l | grep v0.0.6`
- [ ] Tag pushed to remote: Check GitHub tags
- [ ] Production snapshot exists: `ssh prod999 "ls -lah /root/bot-farm/.snapshots/"`
- [ ] Snapshot size reasonable (300-500MB)
- [ ] Old snapshots cleaned (max 5 snapshots)
- [ ] Version documented in history
- [ ] Application running: `ssh prod999 "docker ps"`
- [ ] No errors in logs: `ssh prod999 "docker logs --tail 100 999-multibots"`

## Automation Script

> ⚠️ **TEMPLATE ONLY — `scripts/create-version.sh` does NOT exist in this repo.
> There is nothing here to run.**
>
> It existed once: added 2025-11-12 by commit `141095d07` (the same commit that
> created this skill) and deleted 2025-12-06 by commit `0fc05b4aa`
> ("Major cleanup and reorganization of project structure"). It was removed
> outright, not moved — `git ls-files` finds no `create-version.sh` anywhere in
> the tree today, and no other script replaced it.
>
> Two ways forward:
>
> 1. **Recover the real script from git history.** The deleted 112-line version
>    is still in the object store, and it is better than the sketch below
>    (argument validation, `vX.Y.Z` format check, duplicate-tag check, 5-step
>    progress log):
>    ```bash
>    git show 0fc05b4aa^:scripts/create-version.sh > scripts/create-version.sh
>    chmod +x scripts/create-version.sh
>    ```
> 2. **Or copy the abridged template below into `scripts/create-version.sh`
>    yourself** and `chmod +x` it. It is a shortened sketch, not the deleted
>    script, and it has not been executed from this tree — expect to debug it
>    before pointing it at production.
>
> Either way, review it against the current infrastructure first: the snapshot
> steps assume the `prod999` SSH host and the `/root/bot-farm` layout described
> above. Once you have saved the file, the `./scripts/create-version.sh` usage
> line it prints becomes accurate; until then it refers to nothing.

```bash
#!/bin/bash
# TEMPLATE — this file is NOT in the repo. Save it as scripts/create-version.sh
# before any of the usage below works.

VERSION=$1
MESSAGE=$2

if [ -z "$VERSION" ] || [ -z "$MESSAGE" ]; then
  echo "Usage: ./scripts/create-version.sh v0.0.7 'Description'"
  exit 1
fi

# Create git tag
git tag -a "$VERSION" -m "🎉 RELEASE $VERSION: $MESSAGE"

# Push tag
git push origin "$VERSION"
git push origin production

# Create snapshot
ssh prod999 "cd /root/bot-farm && \
  mkdir -p .snapshots && \
  tar -czf .snapshots/$VERSION-$(date +%Y%m%d-%H%M%S).tar.gz \
  --exclude='.snapshots' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  . && \
  cd .snapshots && ls -t | tail -n +6 | xargs -r rm"

echo "✅ Version $VERSION created successfully"
```

## Common Issues & Fixes

### Issue 1: Snapshot too large (>1GB)

**Problem**: Snapshot includes node_modules or dist
**Fix**: Verify exclude patterns in tar command

```bash
# Check what's being included
ssh prod999 "cd /root/bot-farm && \
  tar -czf - --exclude='.snapshots' --exclude='node_modules' --exclude='.git' --exclude='dist' . | wc -c"
```

### Issue 2: Git tag already exists

**Problem**: Tag name conflict
**Fix**: Delete and recreate or use new version number

```bash
# Delete local tag
git tag -d v0.0.6

# Delete remote tag
git push origin --delete v0.0.6

# Create new tag
git tag -a v0.0.6 -m "Updated message"
git push origin v0.0.6
```

### Issue 3: Snapshot restore fails

**Problem**: Corrupted or incomplete snapshot
**Fix**: Try previous snapshot or restore from git

```bash
# List all snapshots
ssh prod999 "ls -lah /root/bot-farm/.snapshots/"

# Try older snapshot
ssh prod999 "cd /root/bot-farm && tar -xzf .snapshots/v0.0.5-*.tar.gz"
```

## Performance Metrics

- **Snapshot creation**: 30-60 seconds (391MB typical size)
- **Snapshot extraction**: 20-40 seconds
- **Git tag creation**: <1 second
- **Total version creation time**: 1-2 minutes

## Related Resources

- **Git Tags**: `git tag -l` to list all versions
- **GitHub Releases**: https://github.com/gHashTag/999-multibots-telegraf/tags
- **Production Server**: 212.86.115.30 (ssh alias: prod999)
- **Snapshots Directory**: `/root/bot-farm/.snapshots/`
- **Rollback script** — the only script this skill actually ships:
  `.claude/skills/version-management/scripts/rollback.sh`. Its own header says
  `./scripts/rollback.sh`, but there is no such file at the repo root; invoke it
  from the skill path above.
- **Version-creation script**: none. See the "Automation Script" section — the
  former `scripts/create-version.sh` was deleted in December 2025 and only
  survives in git history.

## Safety Notes

**Before creating new version:**

1. Ensure all tests pass
2. Verify production deployment successful
3. Check logs for errors
4. Confirm all services operational

**Before rollback:**

1. Create snapshot of current state (safety backup)
2. Notify team about rollback
3. Document reason for rollback
4. Verify snapshot integrity before extraction

## Next Version Prediction

Based on current pattern (v0.0.6):

- **Next patch**: v0.0.7 (bug fixes, minor improvements)
- **Next minor**: v0.1.0 (new features, backward compatible)
- **Next major**: v1.0.0 (production-ready milestone)

## Success Indicators

After version creation:

```bash
# Verify tag exists
git tag | grep v0.0.6

# Verify snapshot exists
ssh prod999 "ls -lah /root/bot-farm/.snapshots/ | grep v0.0.6"

# Verify application running
ssh prod999 "docker ps | grep 999-multibots"

# Should show: Up X minutes
```
