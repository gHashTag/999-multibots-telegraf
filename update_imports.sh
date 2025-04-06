#!/bin/bash

# Обновляем импорты ModeEnum
find . -type f -name "*.ts" -exec sed -i '' 's|from '"'"'@/price/helpers/modelsCost'"'"'|from '"'"'@/interfaces/modes.interface'"'"'|g' {} +
find . -type f -name "*.ts" -exec sed -i '' 's|from '"'"'../price/helpers/modelsCost'"'"'|from '"'"'../interfaces/modes.interface'"'"'|g' {} +
find . -type f -name "*.ts" -exec sed -i '' 's|from '"'"'@/price/helpers'"'"'|from '"'"'@/interfaces/modes.interface'"'"'|g' {} + 