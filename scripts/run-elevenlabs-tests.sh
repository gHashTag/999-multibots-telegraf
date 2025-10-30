#!/bin/bash

# ElevenLabs Test Runner Script
# This script runs comprehensive tests for ElevenLabs integration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$PROJECT_ROOT/tests/elevenlabs"
COVERAGE_DIR="$PROJECT_ROOT/coverage/elevenlabs"
LOG_FILE="/tmp/elevenlabs-tests-$(date +%Y%m%d-%H%M%S).log"

echo -e "${BLUE}🧪 ElevenLabs Test Suite Runner${NC}"
echo "======================================"
echo "Project: $PROJECT_ROOT"
echo "Test Directory: $TEST_DIR"
echo "Log File: $LOG_FILE"
echo ""

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to run command and check exit code
run_command() {
    local cmd="$1"
    local description="$2"

    echo -e "${YELLOW}⏳ $description...${NC}"
    log "Running: $cmd"

    if eval "$cmd" >> "$LOG_FILE" 2>&1; then
        echo -e "${GREEN}✅ $description completed successfully${NC}"
        return 0
    else
        echo -e "${RED}❌ $description failed${NC}"
        echo "Check log file for details: $LOG_FILE"
        return 1
    fi
}

# Function to check if dependencies are available
check_dependencies() {
    echo -e "${BLUE}📋 Checking dependencies...${NC}"

    # Check if Jest is available
    if ! command -v npx &> /dev/null; then
        echo -e "${RED}❌ npx is not available. Please install Node.js${NC}"
        exit 1
    fi

    # Check if project dependencies are installed
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        echo -e "${YELLOW}⚠️ Dependencies not installed. Running npm install...${NC}"
        cd "$PROJECT_ROOT"
        npm install
    fi

    echo -e "${GREEN}✅ Dependencies check completed${NC}"
}

# Function to build the project
build_project() {
    echo -e "${BLUE}🔨 Building project...${NC}"
    cd "$PROJECT_ROOT"

    if [ -f "package.json" ]; then
        if grep -q '"build"' package.json; then
            run_command "npm run build" "Project build"
        else
            echo -e "${YELLOW}⚠️ No build script found in package.json${NC}"
        fi
    fi
}

# Function to run unit tests
run_unit_tests() {
    echo -e "${BLUE}🧪 Running unit tests...${NC}"
    cd "$PROJECT_ROOT"

    local jest_cmd="npx jest --config=tests/elevenlabs/jest.config.js"
    jest_cmd="$jest_cmd --testPathPattern=elevenlabs-api.test.ts"
    jest_cmd="$jest_cmd --coverage --coverageDirectory=$COVERAGE_DIR"
    jest_cmd="$jest_cmd --verbose"

    run_command "$jest_cmd" "Unit tests"
}

# Function to run smoke tests
run_smoke_tests() {
    echo -e "${BLUE}💨 Running smoke tests...${NC}"
    cd "$PROJECT_ROOT"

    local jest_cmd="npx jest --config=tests/elevenlabs/jest.config.js"
    jest_cmd="$jest_cmd --testPathPattern=elevenlabs-smoke.test.ts"
    jest_cmd="$jest_cmd --verbose"

    run_command "$jest_cmd" "Smoke tests"
}

# Function to run null validation tests
run_null_validation_tests() {
    echo -e "${BLUE}🔍 Running null validation tests...${NC}"
    cd "$PROJECT_ROOT"

    local jest_cmd="npx jest --config=tests/elevenlabs/jest.config.js"
    jest_cmd="$jest_cmd --testPathPattern=voice-id-null-validation.test.ts"
    jest_cmd="$jest_cmd --verbose"

    run_command "$jest_cmd" "Null validation tests"
}

# Function to run integration tests (if configured)
run_integration_tests() {
    if [ "$RUN_INTEGRATION_TESTS" = "true" ] && [ -n "$ELEVENLABS_API_KEY" ]; then
        echo -e "${BLUE}🔗 Running integration tests...${NC}"
        cd "$PROJECT_ROOT"

        local jest_cmd="npx jest --config=tests/elevenlabs/jest.config.js"
        jest_cmd="$jest_cmd --testPathPattern=elevenlabs-integration.test.ts"
        jest_cmd="$jest_cmd --verbose"

        run_command "$jest_cmd" "Integration tests"
    else
        echo -e "${YELLOW}⚠️ Skipping integration tests (set RUN_INTEGRATION_TESTS=true and provide ELEVENLABS_API_KEY)${NC}"
    fi
}

# Function to run production validation tests
run_production_tests() {
    if [ "$VALIDATE_PRODUCTION" = "true" ]; then
        echo -e "${BLUE}🏭 Running production validation tests...${NC}"
        cd "$PROJECT_ROOT"

        local jest_cmd="npx jest --config=tests/elevenlabs/jest.config.js"
        jest_cmd="$jest_cmd --testPathPattern=production-validator.test.ts"
        jest_cmd="$jest_cmd --verbose"

        run_command "$jest_cmd" "Production validation tests"
    else
        echo -e "${YELLOW}⚠️ Skipping production tests (set VALIDATE_PRODUCTION=true to run)${NC}"
    fi
}

# Function to run production validation script
run_production_validation_script() {
    if [ -f "$PROJECT_ROOT/scripts/validate-elevenlabs-production.js" ]; then
        echo -e "${BLUE}🔧 Running production validation script...${NC}"
        cd "$PROJECT_ROOT"

        run_command "node scripts/validate-elevenlabs-production.js" "Production validation script"
    else
        echo -e "${YELLOW}⚠️ Production validation script not found${NC}"
    fi
}

# Function to generate test report
generate_report() {
    echo -e "${BLUE}📊 Generating test report...${NC}"

    local report_file="$PROJECT_ROOT/test-reports/elevenlabs-$(date +%Y%m%d-%H%M%S).md"
    mkdir -p "$(dirname "$report_file")"

    cat > "$report_file" << EOF
# ElevenLabs Test Report

**Date:** $(date)
**Environment:** ${NODE_ENV:-development}
**API Key Configured:** ${ELEVENLABS_API_KEY:+Yes}
**AI Server Configured:** ${AI_SERVER_URL:+Yes}

## Test Results

EOF

    if [ -f "$COVERAGE_DIR/lcov-report/index.html" ]; then
        echo "**Coverage Report:** $COVERAGE_DIR/lcov-report/index.html" >> "$report_file"
        echo "" >> "$report_file"
    fi

    echo "**Log File:** $LOG_FILE" >> "$report_file"
    echo "" >> "$report_file"

    echo "## Summary" >> "$report_file"
    echo "" >> "$report_file"

    # Extract test results from log
    if grep -q "Tests:" "$LOG_FILE"; then
        echo "### Jest Results" >> "$report_file"
        echo "\`\`\`" >> "$report_file"
        grep "Tests:" "$LOG_FILE" | tail -1 >> "$report_file"
        echo "\`\`\`" >> "$report_file"
    fi

    echo -e "${GREEN}📋 Test report generated: $report_file${NC}"
}

# Function to cleanup
cleanup() {
    echo -e "${BLUE}🧹 Cleaning up...${NC}"

    # Clean up temporary files
    find /tmp -name "audio_*" -type f -delete 2>/dev/null || true
    find /tmp -name "*elevenlabs*" -type f -mtime +1 -delete 2>/dev/null || true

    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Main execution
main() {
    local start_time=$(date +%s)

    # Trap cleanup on exit
    trap cleanup EXIT

    # Check command line arguments
    case "${1:-all}" in
        "unit")
            check_dependencies
            build_project
            run_unit_tests
            ;;
        "smoke")
            check_dependencies
            run_smoke_tests
            ;;
        "null")
            check_dependencies
            build_project
            run_null_validation_tests
            ;;
        "integration")
            check_dependencies
            build_project
            run_integration_tests
            ;;
        "production")
            check_dependencies
            build_project
            run_production_tests
            run_production_validation_script
            ;;
        "all"|*)
            check_dependencies
            build_project
            run_unit_tests
            run_smoke_tests
            run_null_validation_tests
            run_integration_tests
            run_production_tests
            ;;
    esac

    generate_report

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    echo ""
    echo -e "${GREEN}🎉 Test suite completed in ${duration} seconds${NC}"
    echo -e "${BLUE}Log file: $LOG_FILE${NC}"

    if [ -f "$COVERAGE_DIR/lcov-report/index.html" ]; then
        echo -e "${BLUE}Coverage report: $COVERAGE_DIR/lcov-report/index.html${NC}"
    fi
}

# Show usage if help requested
if [ "$1" = "help" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [test-type]"
    echo ""
    echo "Test types:"
    echo "  unit        - Run unit tests only"
    echo "  smoke       - Run smoke tests only"
    echo "  null        - Run null validation tests only"
    echo "  integration - Run integration tests only"
    echo "  production  - Run production validation tests"
    echo "  all         - Run all tests (default)"
    echo ""
    echo "Environment variables:"
    echo "  RUN_INTEGRATION_TESTS=true  - Enable integration tests"
    echo "  VALIDATE_PRODUCTION=true    - Enable production tests"
    echo "  ELEVENLABS_API_KEY         - ElevenLabs API key"
    echo "  AI_SERVER_URL              - AI Server URL"
    echo ""
    exit 0
fi

# Run main function
main "$@"