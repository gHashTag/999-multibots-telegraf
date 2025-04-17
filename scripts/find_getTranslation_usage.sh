#!/bin/bash

# Поиск всех вызовов getTranslation
echo "=== Поиск использования getTranslation ==="
grep -r "getTranslation" --include="*.ts" --include="*.js" src/

echo -e "\n=== Поиск деструктуризации результата getTranslation ==="
grep -r "= await getTranslation" --include="*.ts" --include="*.js" src/

echo -e "\n=== Поиск использований replyWithPhoto с url ==="
grep -r "replyWithPhoto" --include="*.ts" --include="*.js" src/

echo -e "\n=== Поиск обработки исключений при вызове getTranslation ==="
grep -r "try.*getTranslation.*catch" --include="*.ts" --include="*.js" src/ 