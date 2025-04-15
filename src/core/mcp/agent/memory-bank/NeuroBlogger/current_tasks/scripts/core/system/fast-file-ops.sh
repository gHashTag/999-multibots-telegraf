#!/bin/bash
RED="[0;31m"; GREEN="[0;32m"; YELLOW="[1;33m"; BLUE="[0;34m"; NC="[0m"
fast_read() { local f="$1"; local s="${2:-1}"; local e="$3"; [ ! -f "$f" ] && echo -e "${RED}❌ Файл не найден${NC}" && return 1; [ -n "$e" ] && sed -n "${s},${e}p" "$f" || cat "$f"; }
fast_append() { echo "$2" >> "$1"; }; fast_update() { sed -i "" "s|$2|$3|g" "$1"; }
main() { case "$1" in "read") fast_read "$2" "$3" "$4" ;; "append") fast_append "$2" "$3" ;; "update") fast_update "$2" "$3" "$4" ;; *) echo "Use: $0 [read|append|update] [args]" ;; esac }; main "$@"
