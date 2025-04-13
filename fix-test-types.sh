#!/usr/bin/env bash

# Define colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}🔧 Test File Type Fixing Utility${NC}"
echo -e "${BLUE}============================================${NC}"

# Check if a test name was provided
if [ -z "$1" ]; then
  echo -e "${RED}ERROR: You must provide a test file name (without the .test.ts extension)${NC}"
  echo -e "Usage: $0 <test-name>"
  echo -e "Example: $0 startScene"
  exit 1
fi

TEST_NAME=$1
TEST_FILE="src/test-utils/tests/scenes/${TEST_NAME}.test.ts"

# Check if the test file exists
if [ ! -f "$TEST_FILE" ]; then
  echo -e "${RED}ERROR: Test file not found: ${TEST_FILE}${NC}"
  echo -e "Available tests:"
  find src/test-utils/tests/scenes -name "*.test.ts" | sed 's|src/test-utils/tests/scenes/||g' | sed 's|.test.ts||g' | sort
  exit 1
fi

echo -e "${YELLOW}Analyzing test file: ${TEST_FILE}${NC}"

# Create a temporary directory for analysis
TEMP_DIR=$(mktemp -d)
echo -e "${YELLOW}Working directory: ${TEMP_DIR}${NC}"

# Copy necessary files to temp directory
mkdir -p "$TEMP_DIR/interfaces"
mkdir -p "$TEMP_DIR/test-utils/core"
mkdir -p "$TEMP_DIR/test-utils/tests/scenes"

# Generate common type definitions
cat > "$TEMP_DIR/interfaces/index.ts" << EOL
export interface User {
  id: string;
  username: string;
  telegram_id: string;
  balance: number;
  is_admin: boolean;
  created_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  subscription_id: string;
  plan_id: string;
  tariff_id: string;
  discord_id: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MyContext {
  from?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    language_code: string;
  };
  message?: any;
  botInfo?: {
    username: string;
  };
  scene: {
    enter: (sceneId: string) => Promise<any>;
    leave: () => Promise<any>;
  };
  session: {
    balance?: number;
    isAdmin?: boolean;
    language?: string;
    username?: string;
    videoModel?: any;
    imageUrl?: string;
    prompt?: string;
    inviteCode?: string;
    user?: {
      id: number | string;
    };
  };
  reply: (text: string, extra?: any) => Promise<any>;
  replyWithPhoto: (url: string, extra?: any) => Promise<any>;
  replyWithHTML: (text: string, extra?: any) => Promise<any>;
  replyWithMarkdown: (text: string, extra?: any) => Promise<any>;
  telegram: {
    getFile: (fileId: string) => Promise<any>;
  };
  wizard: {
    cursor: number;
    next: () => number;
    selectStep: (step: number) => number;
    step: number;
  };
}

export enum VideoModel {
  Pika = 'pika-1.0',
  Gen1 = 'gen1',
  Gen2 = 'gen2',
  ZeroscopeV2XL = 'zeroscope_v2_XL'
}
EOL

echo -e "${GREEN}Generated interface definitions${NC}"

# Create a mock implementation helper
cat > "$TEMP_DIR/test-utils/core/mockHelper.ts" << EOL
import { User, UserSubscription, MyContext } from '../../interfaces';

// Constants for testing
export const TEST_USER_ID = 123456789;
export const TEST_USERNAME = 'test_user';
export const TEST_FIRST_NAME = 'Test';
export const TEST_BALANCE = 100;

/**
 * Create a proper mock of User with all required fields
 */
export function createMockUser(overrides = {}): User {
  return {
    id: TEST_USER_ID.toString(),
    username: TEST_USERNAME,
    telegram_id: TEST_USER_ID.toString(),
    balance: TEST_BALANCE,
    is_admin: false,
    created_at: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Create a proper mock of UserSubscription with all required fields
 */
export function createMockSubscription(overrides = {}): UserSubscription {
  return {
    id: '12345',
    user_id: TEST_USER_ID.toString(),
    subscription_id: 'sub_123',
    plan_id: 'plan_123',
    tariff_id: 'tariff_123',
    discord_id: 'discord_123',
    starts_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    expires_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Create properly typed mock context with better TypeScript compatibility
 */
export function createTypedContext(overrides = {}): MyContext {
  const ctx: MyContext = {
    from: { 
      id: TEST_USER_ID, 
      is_bot: false, 
      first_name: TEST_FIRST_NAME, 
      language_code: 'en' 
    },
    scene: {
      enter: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined)
    },
    session: {
      balance: TEST_BALANCE,
      isAdmin: false,
      language: 'en',
      username: TEST_USERNAME
    },
    reply: jest.fn().mockResolvedValue(undefined),
    replyWithPhoto: jest.fn().mockResolvedValue(undefined),
    replyWithHTML: jest.fn().mockResolvedValue(undefined),
    replyWithMarkdown: jest.fn().mockResolvedValue(undefined),
    telegram: {
      getFile: jest.fn().mockResolvedValue({ file_path: 'test/path.jpg' })
    },
    wizard: {
      cursor: 0,
      next: jest.fn().mockReturnValue(1),
      selectStep: jest.fn().mockReturnValue(0),
      step: 0
    }
  };
  
  // Apply overrides
  return {
    ...ctx,
    ...overrides,
    session: {
      ...ctx.session,
      ...(overrides.session || {})
    }
  };
}

/**
 * Helper for working with mock functions
 */
export function createMockFunction<T>(): jest.MockedFunction<T> {
  return jest.fn() as jest.MockedFunction<T>;
}
EOL

echo -e "${GREEN}Generated mock helpers${NC}"

# Generate a script to verify a test file with TypeScript
cat > "$TEMP_DIR/verify-test.ts" << EOL
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

// Get command line arguments
const args = process.argv.slice(2);
const testFile = args[0];

if (!testFile) {
  console.error('Please provide a test file path');
  process.exit(1);
}

// Read the test file
try {
  const fileContent = fs.readFileSync(testFile, 'utf8');
  
  // Create a TypeScript program to check the file
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    esModuleInterop: true,
    strict: true,
    skipLibCheck: true,
    baseUrl: '.',
    paths: {
      '@/*': ['./*']
    }
  };
  
  // Create a program with just this file
  const host = ts.createCompilerHost(options);
  const program = ts.createProgram([testFile], options, host);
  
  // Get diagnostics
  const diagnostics = ts.getPreEmitDiagnostics(program);
  
  if (diagnostics.length === 0) {
    console.log('No TypeScript errors found!');
  } else {
    console.log(\`Found \${diagnostics.length} TypeScript errors:\`);
    
    diagnostics.forEach(diagnostic => {
      if (diagnostic.file) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        console.log(\`Line \${line + 1}, Col \${character + 1}: \${message}\`);
      } else {
        console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      }
    });
  }
} catch (error) {
  console.error('Error reading or analyzing the file:', error);
  process.exit(1);
}
EOL

echo -e "${GREEN}Generated TypeScript verification script${NC}"

# Copy the test file to the temp directory
cp "$TEST_FILE" "$TEMP_DIR/test-utils/tests/scenes/"

echo -e "${YELLOW}Checking common TypeScript issues in ${TEST_NAME}.test.ts...${NC}"

# Run an analysis on the test file to identify common issues
grep -n "mockFunction<typeof" "$TEST_FILE" | while read -r line; do
  echo -e "${BLUE}Found mock function definition at line $(echo $line | cut -d':' -f1)${NC}"
done

grep -n "ctx\.from =" "$TEST_FILE" | while read -r line; do
  echo -e "${BLUE}Found context.from assignment at line $(echo $line | cut -d':' -f1)${NC}"
done

grep -n "ctx\.session\." "$TEST_FILE" | while read -r line; do
  echo -e "${BLUE}Found session property access at line $(echo $line | cut -d':' -f1)${NC}"
done

echo -e "${YELLOW}Suggestions for fixing TypeScript errors:${NC}"
echo -e "${GREEN}1. For mock functions, use the createMockFunction helper:${NC}"
echo -e "   const mockedGetUserBalance = createMockFunction<typeof getUserBalance>();"
echo -e "${GREEN}2. For context objects, use the createTypedContext helper:${NC}"
echo -e "   const ctx = createTypedContext({ /* overrides */ });"
echo -e "${GREEN}3. When setting up tests with user data, use createMockUser:${NC}"
echo -e "   mockedGetUserByTelegramId.mockResolvedValue(createMockUser());"
echo -e "${GREEN}4. When working with scene steps, use proper type assertions:${NC}"
echo -e "   await (scene.steps[0] as any)(ctx as unknown as MyContext);"
echo -e "${GREEN}5. For session properties, properly initialize the session object:${NC}"
echo -e "   ctx.session = { videoModel: 'model-name', ...ctx.session };"

echo -e "\n${BLUE}============================================${NC}"
echo -e "${BLUE}📋 Next steps to fix ${TEST_NAME}.test.ts${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "${YELLOW}1. Import the helper functions at the top of your test file:${NC}"
echo -e "   import { createMockUser, createMockSubscription, createTypedContext, createMockFunction } from '../../core/mockHelper';"
echo -e "${YELLOW}2. Replace mock function definitions with createMockFunction${NC}"
echo -e "${YELLOW}3. Replace context creation with createTypedContext${NC}"
echo -e "${YELLOW}4. Use proper type assertions for scene steps${NC}"
echo -e "${YELLOW}5. Initialize session properties correctly${NC}"

echo -e "\n${GREEN}You can copy the helper files from:${NC}"
echo -e "${YELLOW}$TEMP_DIR/interfaces/index.ts${NC}"
echo -e "${YELLOW}$TEMP_DIR/test-utils/core/mockHelper.ts${NC}"

echo -e "\n${BLUE}Script completed! Good luck fixing those TypeScript errors.${NC}" 