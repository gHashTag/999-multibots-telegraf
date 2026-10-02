#!/bin/bash
# tri card — как выглядит карточка владельца на живых данных.
set -u
. "$(dirname "${BASH_SOURCE[0]}")/rail.sh"  # rvars: Railway by explicit ids
ROOT="${1:?нужен корень репозитория}"
cd "$ROOT" || exit 1
KEY=$(rvars vibee-render \
       | grep -E '^RENDER_API_KEY=' | cut -d= -f2- )
[ -n "$KEY" ] || { echo "🛑 не прочитал ключ рендера — вывода НЕ делаю."; exit 2; }
RENDER_API_KEY="$KEY" npx tsx "$ROOT/bin/helpers/card.ts"
