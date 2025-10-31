#!/bin/bash

# 🚀 Script to fix Template 1 in Production
# This script restores FalVeo31Provider in production

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Template 1 Production Fix${NC}"
echo -e "${BLUE}=============================${NC}\n"

# Check if we're in production directory
if [ ! -f "src/scenes/lipSyncWizard/ai-reels-wizard.ts" ]; then
  echo -e "${RED}❌ Error: Not in production directory${NC}"
  echo -e "${YELLOW}Run this script from the production worktree${NC}"
  exit 1
fi

# Backup the file
echo -e "${YELLOW}📝 Creating backup...${NC}"
cp src/scenes/lipSyncWizard/ai-reels-wizard.ts src/scenes/lipSyncWizard/ai-reels-wizard.ts.backup
echo -e "${GREEN}✅ Backup created: ai-reels-wizard.ts.backup${NC}"

# Fix 1: Restore FalVeo31Provider import
echo -e "\n${YELLOW}🔧 Fix 1: Restoring FalVeo31Provider import...${NC}"
sed -i.tmp 's|// TEMPORARILY DISABLED: import { FalVeo31Provider } from '@/core/lipsync/providers/fal-veo31-provider'|import { FalVeo31Provider } from '@/core/lipsync/providers/fal-veo31-provider|g' src/scenes/lipSyncWizard/ai-reels-wizard.ts

if grep -q "import { FalVeo31Provider }" src/scenes/lipSyncWizard/ai-reels-wizard.ts; then
  echo -e "${GREEN}✅ Import restored${NC}"
else
  echo -e "${RED}❌ Failed to restore import${NC}"
  exit 1
fi

# Fix 2: Remove throw Error and restore falVeo31 usage
echo -e "\n${YELLOW}🔧 Fix 2: Restoring falVeo31 usage...${NC}"

# Create a temp file with the corrected code
cat > /tmp/fix_falveo31.py << 'EOF'
import re

with open('src/scenes/lipSyncWizard/ai-reels-wizard.ts', 'r') as f:
    content = f.read()

# Replace the throw Error section
pattern = r'throw new Error\("Fal Veo 3\.1 temporarily disabled - missing @fal-ai\/client"\);\s*// const falVeo31 = new FalVeo31Provider\(\)'
replacement = 'const falVeo31 = new FalVeo31Provider()'
content = re.sub(pattern, replacement, content)

# Also handle multiline version
pattern2 = r'throw new Error\("Fal Veo 3\.1 temporarily disabled - missing @fal-ai\/client"\);\s*\n\s*// const falVeo31 = new FalVeo31Provider\(\)'
replacement2 = 'const falVeo31 = new FalVeo31Provider()'
content = re.sub(pattern2, replacement2, content)

with open('src/scenes/lipSyncWizard/ai-reels-wizard.ts', 'w') as f:
    f.write(content)

print("✅ Code replaced")
EOF

python3 /tmp/fix_falveo31.py

if grep -q "const falVeo31 = new FalVeo31Provider()" src/scenes/lipSyncWizard/ai-reels-wizard.ts; then
  echo -e "${GREEN}✅ falVeo31 usage restored${NC}"
else
  echo -e "${RED}❌ Failed to restore falVeo31 usage${NC}"
  echo -e "${YELLOW}Manual fix required${NC}"
fi

# Verify the fixes
echo -e "\n${BLUE}🔍 Verifying fixes...${NC}"

if grep -q "import { FalVeo31Provider }" src/scenes/lipSyncWizard/ai-reels-wizard.ts; then
  echo -e "${GREEN}✅ Import statement is correct${NC}"
else
  echo -e "${RED}❌ Import statement still has issues${NC}"
fi

if ! grep -q "throw new Error.*Fal Veo 3.1" src/scenes/lipSyncWizard/ai-reels-wizard.ts; then
  echo -e "${GREEN}✅ No throw Error found${NC}"
else
  echo -e "${RED}❌ throw Error still present${NC}"
fi

if grep -q "const falVeo31 = new FalVeo31Provider()" src/scenes/lipSyncWizard/ai-reels-wizard.ts; then
  echo -e "${GREEN}✅ falVeo31 instantiation is correct${NC}"
else
  echo -e "${RED}❌ falVeo31 instantiation not found${NC}"
fi

# Summary
echo -e "\n${BLUE}📊 Summary${NC}"
echo -e "${GREEN}✅ Template 1 fixes applied!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Run 'npm run dev' to test"
echo -e "  2. Test Template 1 (Google Veo 3.1)"
echo -e "  3. If everything works, commit and deploy${NC}"

# Clean up
rm -f src/scenes/lipSyncWizard/ai-reels-wizard.ts.tmp
rm -f /tmp/fix_falveo31.py

echo -e "\n${GREEN}🎉 Done!${NC}"