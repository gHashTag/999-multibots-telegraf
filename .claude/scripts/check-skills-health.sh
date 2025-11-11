#!/bin/bash
# .claude/scripts/check-skills-health.sh
# Проверка здоровья всех Skills

echo "🔍 Checking Skills Health..."

SKILLS_DIR=".claude/skills"
ISSUES=0
WARNINGS=0

for skill_dir in "$SKILLS_DIR"/*/; do
  SKILL_NAME=$(basename "$skill_dir")
  SKILL_FILE="$skill_dir/SKILL.md"

  # Check 1: SKILL.md exists
  if [ ! -f "$SKILL_FILE" ]; then
    echo "❌ $SKILL_NAME: Missing SKILL.md"
    ((ISSUES++))
    continue
  fi

  # Check 2: Valid YAML frontmatter
  if ! head -n 10 "$SKILL_FILE" | grep -q "^---$"; then
    echo "⚠️  $SKILL_NAME: Invalid frontmatter"
    ((WARNINGS++))
  fi

  # Check 3: Has description
  if ! grep -q "^description:" "$SKILL_FILE"; then
    echo "⚠️  $SKILL_NAME: Missing description"
    ((WARNINGS++))
  fi

  # Check 4: Code examples present
  TS_BLOCKS=$(grep -c '```typescript' "$SKILL_FILE" || true)
  BASH_BLOCKS=$(grep -c '```bash' "$SKILL_FILE" || true)
  TOTAL_BLOCKS=$((TS_BLOCKS + BASH_BLOCKS))

  if [ $TOTAL_BLOCKS -gt 0 ]; then
    echo "  📝 $SKILL_NAME: Has $TOTAL_BLOCKS code examples"
  fi

  # Check 5: Last modified (freshness)
  if [ -f "$SKILL_FILE" ]; then
    if [ "$(uname)" == "Darwin" ]; then
      # macOS
      DAYS_OLD=$(( ($(date +%s) - $(stat -f %m "$SKILL_FILE")) / 86400 ))
    else
      # Linux
      DAYS_OLD=$(( ($(date +%s) - $(stat -c %Y "$SKILL_FILE")) / 86400 ))
    fi

    if [ $DAYS_OLD -gt 90 ]; then
      echo "📅 $SKILL_NAME: Not updated in $DAYS_OLD days (consider refresh)"
      ((WARNINGS++))
    fi
  fi

  echo "✅ $SKILL_NAME: OK"
done

echo ""
echo "📊 Summary:"
echo "  - Total Skills: $(find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
echo "  - Critical Issues: $ISSUES"
echo "  - Warnings: $WARNINGS"

if [ $ISSUES -eq 0 ]; then
  echo "🟢 All Skills healthy!"
  exit 0
else
  echo "🔴 Found $ISSUES critical issues"
  exit 1
fi
