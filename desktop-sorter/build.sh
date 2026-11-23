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
# Инструкция на одну страницу (нужны node и пакет docx)
if command -v node >/dev/null 2>&1 && node -e "require('docx')" >/dev/null 2>&1; then
  node docs/make-instruction.js 'dist/Инструкция.docx' >/dev/null
  zip -d 'dist/Инструкция.docx' '*/' >/dev/null 2>&1 || true
fi

# Архив для передачи: файлы лежат в корне архива, имена записаны в UTF-8
python3 - <<'PY'
import zipfile, os
names = ['Start.bat', 'DesktopSorter.ps1', 'Настройки.txt', 'catalog-template.html', 'Инструкция.docx']
out = 'DesktopSorter.zip'
if os.path.exists(out): os.remove(out)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for n in names:
        z.write(os.path.join('dist', n), n)
PY
echo "Собрано: $(ls dist | tr '\n' ' ')и архив DesktopSorter.zip"
