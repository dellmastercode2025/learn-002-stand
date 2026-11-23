#!/usr/bin/env bash
# Собирает поставку в папку dist: основной скрипт из частей src/NN-*.ps1,
# файл настроек, шаблон каталога и файл запуска. Кодировки по ТЗ:
#   .ps1 и настройки - UTF-8 с BOM, окончания строк CRLF;
#   .bat - только латиница, без BOM, CRLF.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist

to_crlf() { sed -e 's/\r$//' -e 's/$/\r/'; }

{
  printf '\xef\xbb\xbf'
  for f in src/[0-9][0-9]-*.ps1; do
    cat "$f"
    printf '\n'
  done | to_crlf
} > dist/DesktopSorter.ps1

{ printf '\xef\xbb\xbf'; to_crlf < 'src/Настройки.txt'; } > 'dist/Настройки.txt'

if [ -f src/catalog-template.html ]; then
  to_crlf < src/catalog-template.html > dist/catalog-template.html
fi
if [ -f src/Start.bat ]; then
  to_crlf < src/Start.bat > dist/Start.bat
  if LC_ALL=C grep -q -P '[^\x00-\x7F]' dist/Start.bat; then
    echo "ОШИБКА: в Start.bat есть не-латинские символы" >&2; exit 1
  fi
fi
echo "Собрано: $(ls dist | tr '\n' ' ')"
