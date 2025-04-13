#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "\n${CYAN}=== Запуск тестов для нейрофото / Running tests for neurophoto ===${NC}\n"

# Set variables
TEST=true
NODE_ENV=test

# Run NeuroPhoto (Flux) tests
echo -e "${BLUE}Running tests for NeuroPhoto (Flux)...${NC}"
./simplest-neurophoto-test.js
NEUROPHOTO_EXIT_CODE=$?

if [ $NEUROPHOTO_EXIT_CODE -eq 0 ]; then
    echo -e "\n${GREEN}✅ NeuroPhoto tests passed successfully!${NC}\n"
else 
    echo -e "\n${RED}❌ NeuroPhoto tests failed with exit code $NEUROPHOTO_EXIT_CODE${NC}\n"
fi

# Run NeuroPhoto V2 (Flux Pro) tests
echo -e "${BLUE}Running tests for NeuroPhoto V2 (Flux Pro)...${NC}"
./simplest-neurophoto-v2-test.js
NEUROPHOTO_V2_EXIT_CODE=$?

if [ $NEUROPHOTO_V2_EXIT_CODE -eq 0 ]; then
    echo -e "\n${GREEN}✅ NeuroPhoto V2 tests passed successfully!${NC}\n"
else 
    echo -e "\n${RED}❌ NeuroPhoto V2 tests failed with exit code $NEUROPHOTO_V2_EXIT_CODE${NC}\n"
fi

# Print summary
echo -e "${CYAN}=== Test Results Summary ===${NC}"
echo -e "NeuroPhoto (Flux): $([ $NEUROPHOTO_EXIT_CODE -eq 0 ] && echo -e "${GREEN}PASS${NC}" || echo -e "${RED}FAIL${NC}")"
echo -e "NeuroPhoto V2 (Flux Pro): $([ $NEUROPHOTO_V2_EXIT_CODE -eq 0 ] && echo -e "${GREEN}PASS${NC}" || echo -e "${RED}FAIL${NC}")"

# Exit with failure if any tests failed
if [ $NEUROPHOTO_EXIT_CODE -ne 0 ] || [ $NEUROPHOTO_V2_EXIT_CODE -ne 0 ]; then
    echo -e "\n${RED}❌ Some tests failed${NC}"
    exit 1
else
    echo -e "\n${GREEN}✅ All tests passed successfully!${NC}"
    exit 0
fi 