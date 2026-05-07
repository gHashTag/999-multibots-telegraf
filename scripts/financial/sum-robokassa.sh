#!/bin/bash

echo "💰 ПОДСЧЕТ СУММЫ В CSV ROBOKASSA"
echo "================================"

iconv -f WINDOWS-1251 -t UTF-8 "/Users/playra/999-multibots-telegraf/Spisok operacij s 30.01.2025 po 30.11.2025.csv" | \
awk -F';' '
BEGIN { sum = 0; count = 0 }
NR > 1 {
    # Поле 4 - это сумма (например: 2999,00 RUR)
    amount_str = $4
    # Убираем все кроме цифр и запятых
    gsub(/[^0-9,]/, "", amount_str)
    if (amount_str != "") {
        # Заменяем запятую на точку
        gsub(/,/, ".", amount_str)
        amount = amount_str + 0
        if (amount > 0) {
            sum += amount
            count++
        }
    }
}
END {
    printf "Сумма: %,.2f₽\n", sum
    printf "Транзакций: %d\n", count
}'
