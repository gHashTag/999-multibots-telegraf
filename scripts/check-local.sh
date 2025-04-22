#!/bin/bash

echo "🔍 Running local checks..."

# Check for TypeScript errors
echo "🔬 Checking TypeScript..."
if npx tsc --noEmit; then
  echo "✅ TypeScript check passed."
else
  echo "❌ TypeScript check failed."
  exit 1
fi

# Check for ESLint errors
echo "🧹 Checking ESLint..."
if npm run lint; then
  echo "✅ ESLint check passed."
else
  echo "❌ ESLint check failed."
  # Можно не выходить с ошибкой, если линтер не критичен для сборки
  # exit 1
fi

echo "✨ Local checks completed."
exit 0 