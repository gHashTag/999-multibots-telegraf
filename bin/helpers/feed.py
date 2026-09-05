"""Посты ленты с id — потому что в интерфейсе ссылок на посты нет вовсе."""
import json
import sys

данные = json.load(sys.stdin)
записи = данные.get('templates', [])
print('в ленте:', len(записи))
for з in записи:
    имя = (з.get('name') or '').replace('\n', ' ')[:70]
    автор = з.get('creatorUsername') or '?'
    print(f"  id {str(з.get('id')):>4}  @{автор:<12} {имя}")
