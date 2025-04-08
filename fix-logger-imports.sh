#!/bin/bash

# Fix absolute imports
find src -type f -name "*.ts" -exec sed -i '' 's/import { logger } from '\''@\/utils\/logger'\''/import { Logger as logger } from '\''@\/utils\/logger'\''/g' {} +

# Fix relative imports with ../../
find src -type f -name "*.ts" -exec sed -i '' 's/import { logger } from '\''\.\.\/\.\.\/utils\/logger'\''/import { Logger as logger } from '\''\.\.\/\.\.\/utils\/logger'\''/g' {} +

# Fix relative imports with ../
find src -type f -name "*.ts" -exec sed -i '' 's/import { logger } from '\''\.\.\/utils\/logger'\''/import { Logger as logger } from '\''\.\.\/utils\/logger'\''/g' {} + 