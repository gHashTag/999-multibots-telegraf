#!/bin/sh
# Security token guard - check for leaked secrets in staged commits
# Called by .husky/pre-push and pre-commit

PATTERNS="(INFISICAL_CLIENT_SECRET|SUPABASE_SERVICE_KEY|REPLICATE_API_TOKEN)=['\"][a-zA-Z0-9]"

DIFF=$(git diff --cached -- . ':!*.md' ':!.env.example' ':!CLAUDE.md' ':!.claude/' 2>/dev/null || git diff origin/$(git rev-parse --abbrev-ref HEAD 2>/dev/null)..HEAD -- . ':!*.md' ':!.env.example' ':!CLAUDE.md' ':!.claude/' 2>/dev/null)

if echo "$DIFF" | grep -qE "$PATTERNS"; then
  echo "⚠️  Potential secret detected in diff!"
  exit 1
fi

exit 0
