#requires -Version 5.1
# =====================================================================
#  Разбор рабочего стола: раскладка файлов по папкам, переименование,
#  журнал с откатом и HTML-каталог. Запускается через Start.bat.
#  Работает под обычной учётной записью, ничего не устанавливает,
#  реестр и системные настройки не меняет.
# =====================================================================
[CmdletBinding()]
param(
    [string]$Mode = '',          # режим без меню: 1..5 (нужен для самопроверки)
    [string]$Root = '',          # папка вместо рабочего стола (нужна для самопроверки)
    [string]$SettingsPath = '',  # другой файл настроек (нужен для самопроверки)
    [string]$ApiUrl = '',        # другой адрес API (нужен для самопроверки)
    [switch]$Yes,                # отвечать «да» на подтверждения (нужно для самопроверки)
    [switch]$NoPause
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:Version      = '1.0'
$script:IsWin        = ($env:OS -eq 'Windows_NT')
$script:DS           = [IO.Path]::DirectorySeparatorChar
$script:Inv          = [Globalization.CultureInfo]::InvariantCulture
$script:Utf8NoBom    = New-Object System.Text.UTF8Encoding($false)
$script:Utf8Bom      = New-Object System.Text.UTF8Encoding($true)
$script:ProgramDir   = $PSScriptRoot
$script:AutoYes      = [bool]$Yes
$script:LogPath      = $null
$script:RunId        = (Get-Date).ToString('yyyyMMdd-HHmmss', $script:Inv)
$script:ServiceName  = '_Каталог'

# Имена служебных файлов в папке «_Каталог»
$script:FileNames = @{
    Db        = 'files.jsonl'
    Cache     = 'api-cache.jsonl'
    Meta      = 'meta.json'
    Journal   = 'Журнал операций.csv'
    Log       = 'Ход работы.log'
    PlanJson  = 'plan.json'
    PlanHtml  = 'План разбора.html'
    PlanXlsx  = 'План разбора.xlsx'
    PlanCsv   = 'План разбора.csv'
    Catalog   = 'catalog.json'
    Labels    = 'labels.json'
    Key       = 'api-key.dat'
    Template  = 'catalog-template.html'
    Settings  = 'Настройки.txt'
    Lock      = 'run.lock'
    ToolsDoc  = 'Описание инструментов.html'
}

# =====================================================================
#  Общие вспомогательные функции
# =====================================================================

function Write-Log([string]$text) {
    if (-not $script:LogPath) { return }
    try {
        $line = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss', $script:Inv) + ' ' + $text + "`r`n"
        [IO.File]::AppendAllText($script:LogPath, $line, $script:Utf8Bom)
    } catch { }
}

function Say([string]$text = '', [string]$color = '') {
    if ($color) { Write-Host $text -ForegroundColor $color } else { Write-Host $text }
    if ($text) { Write-Log $text }
}
function Warn([string]$text) { Say ('ВНИМАНИЕ: ' + $text) 'Yellow' }
function Fail([string]$text) { Say ('ОШИБКА: ' + $text) 'Red' }

# Строка состояния, которая переписывается на месте
$script:StatusLen = 0
function Show-Status([string]$text) {
    try {
        $w = 100
        try { $w = [Math]::Max(40, [Console]::WindowWidth - 1) } catch { }
        if ($text.Length -gt $w) { $text = $text.Substring(0, $w - 1) + '…' }
        $pad = ''
        if ($script:StatusLen -gt $text.Length) { $pad = ' ' * ($script:StatusLen - $text.Length) }
        Write-Host ("`r" + $text + $pad) -NoNewline
        $script:StatusLen = $text.Length
    } catch { }
}
function Clear-Status {
    if ($script:StatusLen -gt 0) {
        try { Write-Host ("`r" + (' ' * $script:StatusLen) + "`r") -NoNewline } catch { }
        $script:StatusLen = 0
    }
}

function Ask-YesNo([string]$question) {
    if ($script:AutoYes) { Say ($question + ' да (автоматически)'); return $true }
    while ($true) {
        $a = Read-Host ($question + ' Введите «да» или «нет»')
        if ($null -eq $a) { return $false }
        $a = $a.Trim().ToLowerInvariant()
        if ($a -eq 'да' -or $a -eq 'д' -or $a -eq 'yes' -or $a -eq 'y') { Write-Log ($question + ' -> да'); return $true }
        if ($a -eq 'нет' -or $a -eq 'н' -or $a -eq 'no' -or $a -eq 'n' -or $a -eq '') { Write-Log ($question + ' -> нет'); return $false }
    }
}

function Get-ErrText($err) {
    # Короткий текст ошибки в одну строку
    $msg = ''
    try {
        if ($err -is [System.Management.Automation.ErrorRecord]) {
            $ex = $err.Exception
            while ($ex.InnerException) { $ex = $ex.InnerException }
            $msg = $ex.Message
        } elseif ($err -is [Exception]) {
            $ex = $err
            while ($ex.InnerException) { $ex = $ex.InnerException }
            $msg = $ex.Message
        } else { $msg = [string]$err }
    } catch { $msg = [string]$err }
    return (($msg -replace '\s+', ' ').Trim())
}

# ---------------------------------------------------------------------
#  Пути. В базе относительные пути хранятся с обратной чертой.
# ---------------------------------------------------------------------
function Join-Rel([string]$base, [string]$rel) {
    if (-not $rel) { return $base }
    return [IO.Path]::Combine($base, ($rel.Replace('\', [string]$script:DS)))
}
function Get-RelPath([string]$full, [string]$root) {
    $r = $full.Substring($root.Length).TrimStart('\', '/')
    return $r.Replace('/', '\')
}
function Get-RelParent([string]$rel) {
    $i = $rel.LastIndexOf('\')
    if ($i -lt 0) { return '' }
    return $rel.Substring(0, $i)
}
function Get-RelName([string]$rel) {
    $i = $rel.LastIndexOf('\')
    if ($i -lt 0) { return $rel }
    return $rel.Substring($i + 1)
}
function Join-RelParts([string]$a, [string]$b) {
    if (-not $a) { return $b }
    if (-not $b) { return $a }
    return ($a.TrimEnd('\') + '\' + $b.TrimStart('\'))
}
function Test-RelUnder([string]$rel, [string]$dir) {
    # Истина, если $rel равен $dir или лежит внутри него
    if (-not $dir) { return $true }
    if ($rel.Length -lt $dir.Length) { return $false }
    if ([string]::Compare($rel, 0, $dir, 0, $dir.Length, [StringComparison]::OrdinalIgnoreCase) -ne 0) { return $false }
    return ($rel.Length -eq $dir.Length -or $rel[$dir.Length] -eq '\')
}
function Get-NameNoExt([string]$name) {
    $i = $name.LastIndexOf('.')
    if ($i -le 0) { return $name }
    return $name.Substring(0, $i)
}
function Get-Ext([string]$name) {
    $i = $name.LastIndexOf('.')
    if ($i -le 0) { return '' }
    return $name.Substring($i).ToLowerInvariant()
}

# ---------------------------------------------------------------------
#  Текст
# ---------------------------------------------------------------------
function ConvertTo-SafeName([string]$s) {
    # Убирает знаки, запрещённые в именах Windows
    if (-not $s) { return '' }
    $t = $s -replace '[\\/:*?"<>|\x00-\x1f]', ' '
    $t = ($t -replace '\s+', ' ').Trim().TrimEnd('.', ' ')
    if ($t -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$') { $t = '_' + $t }
    return $t
}
function Limit-Text([string]$s, [int]$max) {
    # Обрезает текст до $max знаков, по возможности по границе слова
    if (-not $s) { return '' }
    if ($s.Length -le $max) { return $s }
    $cut = $s.Substring(0, $max)
    $i = $cut.LastIndexOf(' ')
    if ($i -gt [int]($max / 2)) { $cut = $cut.Substring(0, $i) }
    return $cut.Trim().TrimEnd('.', ',', ';', ':', '-', ' ')
}
function Format-Size([long]$bytes) {
    if ($bytes -ge 1073741824) { return ('{0:N2} ГБ' -f ($bytes / 1073741824)) }
    if ($bytes -ge 1048576)    { return ('{0:N1} МБ' -f ($bytes / 1048576)) }
    if ($bytes -ge 1024)       { return ('{0:N0} КБ' -f ($bytes / 1024)) }
    return ('{0} Б' -f $bytes)
}
function Get-LetterCount([string]$s) {
    if (-not $s) { return 0 }
    return ([regex]::Matches($s, '\p{L}')).Count
}
function Get-NormKey([string]$s) {
    # Ключ для сравнения названий: без кавычек, знаков и лишних пробелов, в нижнем регистре
    if (-not $s) { return '' }
    $t = $s.ToLowerInvariant() -replace '[«»"“”„''`]', ' '
    $t = $t -replace '[^\p{L}\p{Nd}]+', ' '
    return ($t -replace '\s+', ' ').Trim()
}

# ---------------------------------------------------------------------
#  Время. В базе время хранится строкой с числом тактов UTC (точное сравнение).
# ---------------------------------------------------------------------
function ConvertTo-TicksText([datetime]$utc) { return $utc.Ticks.ToString($script:Inv) }
function ConvertFrom-TicksText([string]$t) {
    $n = [long]0
    if (-not [long]::TryParse($t, [ref]$n)) { return [datetime]::MinValue }
    return (New-Object datetime($n, [DateTimeKind]::Utc))
}
function Get-DateStamp([string]$ticksText) {
    # Дата изменения файла в виде ДД-ММ-ГГГГ по местному времени
    return (ConvertFrom-TicksText $ticksText).ToLocalTime().ToString('dd-MM-yyyy', $script:Inv)
}
function Get-NowText { return (Get-Date).ToString('yyyy-MM-dd HH:mm:ss', $script:Inv) }

# ---------------------------------------------------------------------
#  Контрольные суммы
# ---------------------------------------------------------------------
function Get-FileSha256([string]$path) {
    $fs = $null
    $sha = $null
    try {
        $fs = New-Object IO.FileStream($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]'ReadWrite, Delete'), 1048576)
        $sha = [Security.Cryptography.SHA256]::Create()
        $h = $sha.ComputeHash($fs)
        return ([BitConverter]::ToString($h).Replace('-', '').ToLowerInvariant())
    } finally {
        if ($sha) { $sha.Dispose() }
        if ($fs) { $fs.Dispose() }
    }
}
function Get-TextSha256([string]$text) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $h = $sha.ComputeHash($script:Utf8NoBom.GetBytes($text))
        return ([BitConverter]::ToString($h).Replace('-', '').ToLowerInvariant())
    } finally { $sha.Dispose() }
}

# ---------------------------------------------------------------------
#  JSON. Запись своя (быстрая и с предсказуемым порядком ключей),
#  чтение через ConvertFrom-Json с переводом в хеш-таблицы.
# ---------------------------------------------------------------------
# Управляющие знаки, разделители строк U+2028 и U+2029, а также < > & (чтобы JSON можно было вставлять в HTML)
$script:JsonEscapeRx = New-Object regex('[\x00-\x1f' + [char]0x2028 + [char]0x2029 + '<>&]')
function Add-JsonString([System.Text.StringBuilder]$sb, [string]$s) {
    [void]$sb.Append('"')
    if ($s) {
        $t = $s.Replace('\', '\\').Replace('"', '\"')
        if ($script:JsonEscapeRx.IsMatch($t)) {
            $t = $t.Replace("`n", '\n').Replace("`r", '\r').Replace("`t", '\t')
            $t = $script:JsonEscapeRx.Replace($t, { param($m) '\u' + ([int][char]$m.Value).ToString('x4') })
        }
        [void]$sb.Append($t)
    }
    [void]$sb.Append('"')
}
function Add-JsonValue([System.Text.StringBuilder]$sb, $v) {
    if ($null -eq $v) { [void]$sb.Append('null'); return }
    if ($v -is [string]) { Add-JsonString $sb $v; return }
    if ($v -is [bool]) { if ($v) { [void]$sb.Append('true') } else { [void]$sb.Append('false') }; return }
    if ($v -is [int] -or $v -is [long] -or $v -is [byte] -or $v -is [int16] -or $v -is [uint32] -or $v -is [uint64]) {
        [void]$sb.Append(([IConvertible]$v).ToString($script:Inv)); return
    }
    if ($v -is [double] -or $v -is [single] -or $v -is [decimal]) {
        [void]$sb.Append(([double]$v).ToString('R', $script:Inv)); return
    }
    if ($v -is [datetime]) { Add-JsonString $sb ($v.ToString('yyyy-MM-dd HH:mm:ss', $script:Inv)); return }
    if ($v -is [System.Collections.IDictionary]) {
        [void]$sb.Append('{')
        $keys = @($v.Keys)
        if (-not ($v -is [System.Collections.Specialized.OrderedDictionary])) { $keys = @($keys | Sort-Object) }
        $first = $true
        foreach ($k in $keys) {
            if (-not $first) { [void]$sb.Append(',') }
            $first = $false
            Add-JsonString $sb ([string]$k)
            [void]$sb.Append(':')
            Add-JsonValue $sb $v[$k]
        }
        [void]$sb.Append('}')
        return
    }
    if ($v -is [System.Collections.IEnumerable]) {
        [void]$sb.Append('[')
        $first = $true
        foreach ($x in $v) {
            if (-not $first) { [void]$sb.Append(',') }
            $first = $false
            Add-JsonValue $sb $x
        }
        [void]$sb.Append(']')
        return
    }
    if ($v -is [System.Management.Automation.PSCustomObject]) {
        [void]$sb.Append('{')
        $first = $true
        foreach ($p in $v.PSObject.Properties) {
            if (-not $first) { [void]$sb.Append(',') }
            $first = $false
            Add-JsonString $sb $p.Name
            [void]$sb.Append(':')
            Add-JsonValue $sb $p.Value
        }
        [void]$sb.Append('}')
        return
    }
    Add-JsonString $sb ([string]$v)
}
function ConvertTo-JsonText($value) {
    $sb = New-Object System.Text.StringBuilder
    Add-JsonValue $sb $value
    return $sb.ToString()
}
function ConvertTo-Hash($o) {
    # Переводит результат ConvertFrom-Json в хеш-таблицы и массивы
    if ($null -eq $o) { return $null }
    if ($o -is [string]) { return $o }
    if ($o -is [datetime]) { return $o.ToString('yyyy-MM-dd HH:mm:ss', $script:Inv) }
    if ($o -is [ValueType]) { return $o }
    if ($o -is [System.Collections.IDictionary]) {
        $h = @{}
        foreach ($k in @($o.Keys)) { $h[[string]$k] = ConvertTo-Hash $o[$k] }
        return $h
    }
    if ($o -is [System.Collections.IEnumerable]) {
        $l = New-Object System.Collections.ArrayList
        foreach ($x in $o) { [void]$l.Add((ConvertTo-Hash $x)) }
        return ,($l.ToArray())
    }
    if ($o -is [System.Management.Automation.PSCustomObject]) {
        $h = @{}
        foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = ConvertTo-Hash $p.Value }
        return $h
    }
    return $o
}
function ConvertFrom-JsonText([string]$text) {
    if (-not $text) { return $null }
    $o = ConvertFrom-Json -InputObject $text
    return (ConvertTo-Hash $o)
}
function Get-Val($h, [string]$key, $default = $null) {
    # Безопасное чтение ключа из хеш-таблицы
    if ($null -eq $h) { return $default }
    if ($h -is [System.Collections.IDictionary]) {
        if ($h.Contains($key)) { $v = $h[$key]; if ($null -ne $v) { return $v } }
        return $default
    }
    return $default
}
function Get-Str($h, [string]$key) {
    $v = Get-Val $h $key ''
    if ($null -eq $v) { return '' }
    return ([string]$v).Trim()
}

# ---------------------------------------------------------------------
#  Файлы
# ---------------------------------------------------------------------
function Write-TextFile([string]$path, [string]$text, [Text.Encoding]$encoding) {
    # Запись через временный файл, чтобы сбой не оставил половину файла
    $tmp = $path + '.tmp'
    [IO.File]::WriteAllText($tmp, $text, $encoding)
    if ([IO.File]::Exists($path)) {
        try { [IO.File]::Replace($tmp, $path, $null) }
        catch {
            [IO.File]::Delete($path)
            [IO.File]::Move($tmp, $path)
        }
    } else { [IO.File]::Move($tmp, $path) }
}
function Read-TextFile([string]$path) {
    return [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
}

# ---------------------------------------------------------------------
#  CSV с разделителем «;» (так его открывает русский Excel)
# ---------------------------------------------------------------------
function Format-CsvLine([object[]]$fields) {
    $parts = New-Object System.Collections.ArrayList
    foreach ($f in $fields) {
        $s = ''
        if ($null -ne $f) { $s = ([string]$f) -replace '[\r\n]+', ' ' }
        if ($s.IndexOfAny([char[]]@(';', '"')) -ge 0 -or $s.StartsWith(' ') -or $s.EndsWith(' ')) {
            $s = '"' + $s.Replace('"', '""') + '"'
        }
        [void]$parts.Add($s)
    }
    return ($parts -join ';')
}
function Split-CsvLine([string]$line) {
    $res = New-Object System.Collections.ArrayList
    $sb = New-Object System.Text.StringBuilder
    $inQ = $false
    $i = 0
    $n = $line.Length
    while ($i -lt $n) {
        $c = $line[$i]
        if ($inQ) {
            if ($c -eq '"') {
                if ($i + 1 -lt $n -and $line[$i + 1] -eq '"') { [void]$sb.Append('"'); $i++ }
                else { $inQ = $false }
            } else { [void]$sb.Append($c) }
        } else {
            if ($c -eq '"') { $inQ = $true }
            elseif ($c -eq ';') { [void]$res.Add($sb.ToString()); [void]$sb.Clear() }
            else { [void]$sb.Append($c) }
        }
        $i++
    }
    [void]$res.Add($sb.ToString())
    return ,($res.ToArray())
}

# ---------------------------------------------------------------------
#  Сравнение с шаблоном, где * - любые знаки, # - цифра
# ---------------------------------------------------------------------
function ConvertTo-MaskRegex([string]$mask) {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('^')
    foreach ($ch in $mask.ToCharArray()) {
        if ($ch -eq '*') { [void]$sb.Append('.*') }
        elseif ($ch -eq '#') { [void]$sb.Append('\d') }
        elseif ($ch -eq '?') { [void]$sb.Append('.') }
        else { [void]$sb.Append([regex]::Escape([string]$ch)) }
    }
    [void]$sb.Append('$')
    return (New-Object regex($sb.ToString(), [System.Text.RegularExpressions.RegexOptions]::IgnoreCase))
}

# =====================================================================
#  Настройки
# =====================================================================

$script:Placeholders = @('{год договора}', '{год страхования}', '{год изменения}', '{вид сертификата}', '{вид страхования}', '{наименование ВНД}', '{папка заключения}')

$script:Defaults = @{
    'Организация'                        = 'ТОО «НМСК «Казмортрансфлот» (КМТФ)'
    'Модель'                             = 'claude-haiku-5-5'
    'АдресAPI'                           = 'https://api.anthropic.com/v1/messages'
    'ВерсияAPI'                          = '2026-10-21'
    'УсилиеМодели'                       = 'low'
    'МаксТокеновОтвета'                  = '4096'
    'ОдновременныхЗапросов'              = '3'
    'ПовторовПриОшибке'                  = '3'
    'ТаймаутЗапроса_сек'                 = '120'
    'ПорогУверенности'                   = '0.7'
    'ЗнаковТекста'                       = '3000'
    'СтрокExcel'                         = '30'
    'РежимPDF'                           = 'первая страница'
    'МаксРазмерPDF_МБ'                   = '20'
    'МаксРазмерИзображения_МБ'           = '30'
    'ДлиннаяСторонаКартинки'             = '1568'
    'ЕслиСканНеПроверен'                 = 'не отправлять'
    'МинБуквДляПроверкиСкана'            = '20'
    'ТаймаутOffice_сек'                  = '60'
    'ПересчитыватьХешВсегда'             = 'нет'
    'СоздаватьВсюСтруктуру'              = 'да'
    'РазбиратьНовыеФайлыВнутриСтруктуры' = 'нет'
    'МаксДлинаПути'                      = '240'
    'МаксДлинаНазвания'                  = '80'
    'МаксДлинаПапкиВНД'                  = '60'
    'ПапкаНаРазбор'                      = 'На разбор'
    'ПапкаДляФайловСПаролем'             = 'Файлы ДСП'
    'ПапкаЗаключенияСДоговором'          = 'Заключения\{папка заключения}'
    'ИмяКаталога'                        = 'Каталог рабочего стола.html'
    'ОткрыватьПланПослеФормирования'     = 'да'
    'ТестоваяПапка'                      = ''
}

function Read-SettingsFile([string]$path) {
    # Возвращает @{ General = @{}; Lists = @{ 'Раздел' = список @{Line; Text} } }
    if (-not [IO.File]::Exists($path)) { throw "Не найден файл настроек: $path" }
    $text = Read-TextFile $path
    $res = @{ General = @{}; Lists = @{} }
    $section = ''
    $lineNo = 0
    foreach ($raw in ($text -split "`r?`n")) {
        $lineNo++
        $line = $raw.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }
        if ($line -match '^\[(.+)\]$') {
            $section = $Matches[1].Trim()
            if ($section -ne 'Общие' -and -not $res.Lists.ContainsKey($section)) {
                $res.Lists[$section] = New-Object System.Collections.ArrayList
            }
            continue
        }
        if ($section -eq '') { throw "Файл настроек, строка ${lineNo}: текст стоит до первого раздела в квадратных скобках." }
        if ($section -eq 'Общие') {
            $i = $line.IndexOf('=')
            if ($i -lt 1) { throw "Файл настроек, строка ${lineNo}: ожидается запись вида «Параметр = значение»." }
            $res.General[$line.Substring(0, $i).Trim()] = $line.Substring($i + 1).Trim()
        } else {
            [void]$res.Lists[$section].Add(@{ Line = $lineNo; Text = $line })
        }
    }
    return $res
}

function Split-SettingLine([string]$text) {
    # Делит строку списка по знаку | с пробелами
    return ,@([regex]::Split($text, '\s+\|\s+') | ForEach-Object { $_.Trim() })
}

function Get-Opt([string]$name) {
    if ($script:Cfg.General.ContainsKey($name)) { return [string]$script:Cfg.General[$name] }
    if ($script:Defaults.ContainsKey($name)) { return [string]$script:Defaults[$name] }
    return ''
}
function Get-OptInt([string]$name) {
    $n = 0
    $v = Get-Opt $name
    if (-not [int]::TryParse($v, [ref]$n)) { throw "Файл настроек: параметр «$name» должен быть целым числом, а указано «$v»." }
    return $n
}
function Get-OptNum([string]$name) {
    $d = [double]0
    $v = (Get-Opt $name).Replace(',', '.')
    if (-not [double]::TryParse($v, [Globalization.NumberStyles]::Float, $script:Inv, [ref]$d)) {
        throw "Файл настроек: параметр «$name» должен быть числом, а указано «$v»."
    }
    return $d
}
function Get-OptBool([string]$name) {
    $v = (Get-Opt $name).ToLowerInvariant()
    if ($v -eq 'да' -or $v -eq 'yes' -or $v -eq 'true' -or $v -eq '1') { return $true }
    if ($v -eq 'нет' -or $v -eq 'no' -or $v -eq 'false' -or $v -eq '0' -or $v -eq '') { return $false }
    throw "Файл настроек: параметр «$name» должен быть «да» или «нет», а указано «$v»."
}

function New-FolderTemplate([string]$path, [string]$desc, [int]$line) {
    $p = $path.Trim().Trim('\')
    $segs = @($p -split '\\')
    foreach ($s in $segs) {
        if ($s -eq '') { throw "Файл настроек, строка ${line}: в пути «$path» есть пустая часть." }
        if ($s.StartsWith('{')) {
            if ($script:Placeholders -notcontains $s) {
                throw "Файл настроек, строка ${line}: неизвестная подстановка $s. Допустимы: $($script:Placeholders -join ', ')."
            }
        } elseif ($s -match '[\\/:*?"<>|{}]' -or $s -ne (ConvertTo-SafeName $s)) {
            throw "Файл настроек, строка ${line}: в названии папки «$s» есть знаки, запрещённые в Windows."
        }
    }
    return @{ Path = ($segs -join '\'); Desc = $desc; Segs = $segs; Line = $line }
}

function Get-StaticPrefix($template) {
    # Часть пути до первой подстановки
    $parts = New-Object System.Collections.ArrayList
    foreach ($s in $template.Segs) {
        if ($s.StartsWith('{')) { break }
        [void]$parts.Add($s)
    }
    return ($parts -join '\')
}

function Initialize-Config([string]$path) {
    $raw = Read-SettingsFile $path
    $script:Cfg = @{ General = $raw.General; Path = $path }
    foreach ($k in @($raw.General.Keys)) {
        if (-not $script:Defaults.ContainsKey($k)) { Warn "В файле настроек есть неизвестный параметр «$k». Он не используется." }
    }
    $lists = $raw.Lists
    function Get-List([string]$name) { if ($lists.ContainsKey($name)) { return ,@($lists[$name]) } return ,@() }

    # --- Папки
    $folders = New-Object System.Collections.ArrayList
    $seen = @{}
    foreach ($e in (Get-List 'Папки')) {
        $parts = Split-SettingLine $e.Text
        if ($parts.Count -lt 2 -or -not $parts[1]) { throw "Файл настроек, строка $($e.Line): для папки нужно описание после знака |." }
        $t = New-FolderTemplate $parts[0] $parts[1] $e.Line
        if ($t.Path -like '*{папка заключения}*') { throw "Файл настроек, строка $($e.Line): подстановку {папка заключения} можно использовать только в параметре «ПапкаЗаключенияСДоговором»." }
        if ($seen.ContainsKey($t.Path)) { throw "Файл настроек, строка $($e.Line): папка «$($t.Path)» указана дважды." }
        $seen[$t.Path] = $true
        [void]$folders.Add($t)
    }
    if ($folders.Count -eq 0) { throw 'Файл настроек: раздел [Папки] пуст.' }
    $script:Cfg.Folders = $folders.ToArray()

    # Особые папки
    $script:Cfg.ReviewFolder    = ConvertTo-SafeName (Get-Opt 'ПапкаНаРазбор')
    $script:Cfg.ProtectedFolder = ConvertTo-SafeName (Get-Opt 'ПапкаДляФайловСПаролем')
    if (-not $script:Cfg.ReviewFolder) { throw 'Файл настроек: параметр «ПапкаНаРазбор» не задан.' }
    if (-not $script:Cfg.ProtectedFolder) { throw 'Файл настроек: параметр «ПапкаДляФайловСПаролем» не задан.' }
    $script:Cfg.GroupTemplate = New-FolderTemplate (Get-Opt 'ПапкаЗаключенияСДоговором') '' 0
    if ($script:Cfg.GroupTemplate.Segs[-1] -ne '{папка заключения}') {
        throw 'Файл настроек: параметр «ПапкаЗаключенияСДоговором» должен заканчиваться подстановкой {папка заключения}.'
    }

    # --- Правила
    $script:Cfg.Rules = @((Get-List 'Правила распределения') | ForEach-Object { $_.Text })

    # --- Виды сертификатов и страхования
    $kinds = New-Object System.Collections.ArrayList
    foreach ($e in (Get-List 'Виды сертификатов')) {
        $parts = Split-SettingLine $e.Text
        $nm = ConvertTo-SafeName $parts[0]
        if (-not $nm) { continue }
        $d = ''; if ($parts.Count -gt 1) { $d = $parts[1] }
        [void]$kinds.Add(@{ Name = $nm; Desc = $d })
    }
    if ($kinds.Count -eq 0) { [void]$kinds.Add(@{ Name = 'Прочие'; Desc = 'Остальные сертификаты' }) }
    $script:Cfg.CertKinds = $kinds.ToArray()

    $ins = New-Object System.Collections.ArrayList
    foreach ($e in (Get-List 'Виды страхования')) {
        $parts = Split-SettingLine $e.Text
        $nm = ConvertTo-SafeName $parts[0]
        if (-not $nm) { continue }
        $d = ''; if ($parts.Count -gt 1) { $d = $parts[1] }
        [void]$ins.Add(@{ Name = $nm; Desc = $d })
    }
    $script:Cfg.InsKinds = $ins.ToArray()

    $script:Cfg.Clubs = @((Get-List 'Клубы P&I') | ForEach-Object { $_.Text })

    # --- Суда
    $fleet = New-Object System.Collections.ArrayList
    foreach ($e in (Get-List 'Суда КМТФ')) {
        $parts = Split-SettingLine $e.Text
        $names = @($parts[0] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        $imo = ''; if ($parts.Count -gt 1) { $imo = ($parts[1] -replace '\D', '') }
        if ($names.Count -eq 0) { continue }
        [void]$fleet.Add(@{ Names = $names; Imo = $imo })
    }
    $script:Cfg.Fleet = $fleet.ToArray()

    # --- Исключения
    $ex = New-Object System.Collections.ArrayList
    foreach ($e in (Get-List 'Исключения')) {
        $t = $e.Text.Trim().Trim('\').Replace('/', '\')
        if (-not $t) { continue }
        if ($t.IndexOfAny([char[]]@('*', '?')) -ge 0) {
            [void]$ex.Add(@{ Kind = 'mask'; Raw = $t; Regex = (ConvertTo-MaskRegex $t); HasDir = ($t.Contains('\')) })
        } else {
            [void]$ex.Add(@{ Kind = 'path'; Raw = $t })
        }
    }
    $script:Cfg.Exclusions = $ex.ToArray()

    # --- Неинформативные имена
    $script:Cfg.BadNames = @((Get-List 'Неинформативные имена') | ForEach-Object { ConvertTo-MaskRegex $_.Text })

    # --- Признаки ДСП
    $marks = New-Object System.Collections.ArrayList
    foreach ($e in (Get-List 'Признаки ДСП')) {
        $t = $e.Text.Trim()
        if (-not $t) { continue }
        if ($t -match '^точно:\s*(.+)$') {
            $w = $Matches[1].Trim()
            $rx = New-Object regex('(?<![\p{L}\p{Nd}])' + [regex]::Escape($w) + '(?![\p{L}\p{Nd}])')
            [void]$marks.Add(@{ Text = $w; Regex = $rx })
        } else {
            $pat = ([regex]::Escape($t)) -replace '(\\ )+', '\s+'
            $rx = New-Object regex($pat, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            [void]$marks.Add(@{ Text = $t; Regex = $rx })
        }
    }
    $script:Cfg.DspMarks = $marks.ToArray()

    # --- Ключевые слова
    $kw = New-Object System.Collections.ArrayList
    foreach ($e in (Get-List 'Ключевые слова')) {
        $parts = Split-SettingLine $e.Text
        if ($parts.Count -lt 2) { continue }
        $fp = $parts[0].Trim().Trim('\')
        if (-not (Get-FolderTemplate $fp)) {
            Warn "Файл настроек, строка $($e.Line): папки «$fp» нет в разделе [Папки]. Строка ключевых слов пропущена."
            continue
        }
        $words = @($parts[1] -split ',' | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
        if ($words.Count -gt 0) { [void]$kw.Add(@{ Folder = (Get-FolderTemplate $fp).Path; Words = $words }) }
    }
    $script:Cfg.Keywords = $kw.ToArray()

    # --- Проверка чисел
    foreach ($n in @('МаксТокеновОтвета', 'ОдновременныхЗапросов', 'ПовторовПриОшибке', 'ТаймаутЗапроса_сек', 'ЗнаковТекста', 'СтрокExcel',
                     'МаксРазмерPDF_МБ', 'МаксРазмерИзображения_МБ', 'ДлиннаяСторонаКартинки', 'МинБуквДляПроверкиСкана', 'ТаймаутOffice_сек',
                     'МаксДлинаПути', 'МаксДлинаНазвания', 'МаксДлинаПапкиВНД')) { [void](Get-OptInt $n) }
    $thr = Get-OptNum 'ПорогУверенности'
    if ($thr -lt 0 -or $thr -gt 1) { throw 'Файл настроек: «ПорогУверенности» должен быть от 0 до 1.' }
    foreach ($n in @('ПересчитыватьХешВсегда', 'СоздаватьВсюСтруктуру', 'РазбиратьНовыеФайлыВнутриСтруктуры', 'ОткрыватьПланПослеФормирования')) { [void](Get-OptBool $n) }
    $mode = (Get-Opt 'РежимPDF').ToLowerInvariant()
    if ($mode -ne 'первая страница' -and $mode -ne 'целиком') { throw 'Файл настроек: «РежимPDF» должен быть «первая страница» или «целиком».' }
    $scan = (Get-Opt 'ЕслиСканНеПроверен').ToLowerInvariant()
    if ($scan -ne 'не отправлять' -and $scan -ne 'отправлять') { throw 'Файл настроек: «ЕслиСканНеПроверен» должен быть «не отправлять» или «отправлять».' }
    $eff = (Get-Opt 'УсилиеМодели').ToLowerInvariant()
    if (@('low', 'medium', 'high', 'xhigh', 'max') -notcontains $eff) { throw 'Файл настроек: «УсилиеМодели» должно быть low, medium или high.' }
}

function Get-FolderTemplate([string]$path) {
    # Ищет шаблон папки по пути без учёта регистра
    $p = $path.Trim().Trim('\')
    foreach ($t in $script:Cfg.Folders) {
        if ([string]::Equals($t.Path, $p, [StringComparison]::OrdinalIgnoreCase)) { return $t }
    }
    return $null
}

function Get-AllTemplates {
    # Все шаблоны структуры, включая особые папки
    $all = New-Object System.Collections.ArrayList
    foreach ($t in $script:Cfg.Folders) { [void]$all.Add($t) }
    [void]$all.Add(@{ Path = $script:Cfg.ReviewFolder; Segs = @($script:Cfg.ReviewFolder); Desc = '' })
    [void]$all.Add(@{ Path = $script:Cfg.ProtectedFolder; Segs = @($script:Cfg.ProtectedFolder); Desc = '' })
    [void]$all.Add($script:Cfg.GroupTemplate)
    return ,($all.ToArray())
}

function Test-InStructure([string]$relDir) {
    # Истина, если папка относится к целевой структуре:
    # это начало пути одной из папок структуры, сама папка или папка внутри неё.
    if (-not $relDir) { return $false }
    $segs = @($relDir -split '\\')
    foreach ($t in (Get-AllTemplates)) {
        $n = [Math]::Min($segs.Count, $t.Segs.Count)
        $ok = $true
        for ($i = 0; $i -lt $n; $i++) {
            $ts = $t.Segs[$i]
            if ($ts.StartsWith('{')) { continue }
            if (-not [string]::Equals($ts, $segs[$i], [StringComparison]::OrdinalIgnoreCase)) { $ok = $false; break }
        }
        if ($ok) { return $true }
    }
    return $false
}

function Get-StructureDirs {
    # Постоянные папки структуры, которые создаются заранее
    $set = New-Object 'System.Collections.Generic.SortedSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($t in (Get-AllTemplates)) {
        $p = Get-StaticPrefix $t
        while ($p) { [void]$set.Add($p); $p = Get-RelParent $p }
    }
    return ,@($set)
}

function Test-Excluded([string]$rel, [bool]$isDir) {
    foreach ($e in $script:Cfg.Exclusions) {
        if ($e.Kind -eq 'path') {
            if (Test-RelUnder $rel $e.Raw) { return $true }
        } else {
            if ($e.HasDir) { if ($e.Regex.IsMatch($rel)) { return $true } }
            elseif ($e.Regex.IsMatch((Get-RelName $rel))) { return $true }
        }
    }
    return $false
}

function Test-BadName([string]$nameNoExt) {
    # Истина, если имя неинформативно: пустое, из одних цифр или подходит под шаблон
    $n = $nameNoExt.Trim()
    if ($n -eq '') { return $true }
    if ($n -match '^[\d\s\-_.()]+$') { return $true }
    foreach ($rx in $script:Cfg.BadNames) { if ($rx.IsMatch($n)) { return $true } }
    return $false
}

function Find-DspMark([string]$text) {
    # Возвращает найденный признак ДСП или пустую строку
    if (-not $text) { return '' }
    foreach ($m in $script:Cfg.DspMarks) {
        if ($m.Regex.IsMatch($text)) { return $m.Text }
    }
    return ''
}

function Find-FleetVessel([string]$name, [string]$imo) {
    # Истина, если судно есть в перечне судов КМТФ (по номеру ИМО или по названию)
    $imoDigits = ''
    if ($imo) { $imoDigits = ($imo -replace '\D', '') }
    $key = Get-NormKey $name
    foreach ($v in $script:Cfg.Fleet) {
        if ($imoDigits -and $v.Imo -and $v.Imo -eq $imoDigits) { return $true }
        if ($key) {
            foreach ($n in $v.Names) { if ((Get-NormKey $n) -eq $key) { return $true } }
        }
    }
    return $false
}

# =====================================================================
#  Чтение содержимого файлов встроенными средствами .NET.
#  Файлы открываются только на чтение, содержимое и даты не меняются.
# =====================================================================

function Initialize-Readers {
    try { Add-Type -AssemblyName System.IO.Compression } catch { }
    try { Add-Type -AssemblyName System.IO.Compression.FileSystem } catch { }
    $script:Enc1251 = [Text.Encoding]::GetEncoding(1251)
    $script:Enc866  = [Text.Encoding]::GetEncoding(866)
    $script:Utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
    $x = New-Object System.Xml.XmlReaderSettings
    $x.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $x.XmlResolver = $null
    $x.IgnoreComments = $true
    $x.IgnoreProcessingInstructions = $true
    $script:XmlSettings = $x
    $script:NtElement = [System.Xml.XmlNodeType]::Element
    $script:NtEnd     = [System.Xml.XmlNodeType]::EndElement
    $script:NtText    = [System.Xml.XmlNodeType]::Text
    $script:NtWs      = [System.Xml.XmlNodeType]::Whitespace
    $script:NtSws     = [System.Xml.XmlNodeType]::SignificantWhitespace
    $script:NtCData   = [System.Xml.XmlNodeType]::CDATA
    $script:RelNs = @('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships')
}

function Open-ReadStream([string]$path) {
    return (New-Object IO.FileStream($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]'ReadWrite, Delete'), 65536))
}

function Test-FileBusy($err) {
    # Истина, если ошибка означает «файл занят другой программой»
    try {
        $ex = $err
        if ($err -is [System.Management.Automation.ErrorRecord]) { $ex = $err.Exception }
        while ($ex) {
            if ($ex -is [IO.IOException]) {
                $code = $ex.HResult -band 0xFFFF
                if ($code -eq 32 -or $code -eq 33) { return $true }
            }
            $ex = $ex.InnerException
        }
    } catch { }
    return $false
}

function Read-Head([string]$path, [int]$count) {
    # Первые байты файла
    $fs = Open-ReadStream $path
    try {
        $buf = New-Object byte[] $count
        $got = 0
        while ($got -lt $count) {
            $n = $fs.Read($buf, $got, $count - $got)
            if ($n -le 0) { break }
            $got += $n
        }
        if ($got -lt $count) { $res = New-Object byte[] $got; [Array]::Copy($buf, $res, $got); return ,$res }
        return ,$buf
    } finally { $fs.Dispose() }
}

function Format-Extract([string]$text, [int]$max) {
    # Приводит извлечённый текст в порядок и обрезает до $max знаков
    if (-not $text) { return '' }
    $t = $text.Replace("`r", '')
    $t = $t -replace "[ `t]+`n", "`n"
    $t = $t -replace "`n{3,}", "`n`n"
    $t = $t -replace "[ ]{2,}", ' '
    $t = $t.Trim()
    if ($t.Length -gt $max) { $t = $t.Substring(0, $max) }
    return $t
}

# ---------------------------------------------------------------------
#  Текстовые файлы с определением кодировки
# ---------------------------------------------------------------------
function ConvertFrom-TextBytes([byte[]]$b) {
    if ($null -eq $b -or $b.Length -eq 0) { return '' }
    if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { return $script:Utf8NoBom.GetString($b, 3, $b.Length - 3) }
    if ($b.Length -ge 2 -and $b[0] -eq 0xFF -and $b[1] -eq 0xFE) { return [Text.Encoding]::Unicode.GetString($b, 2, $b.Length - 2) }
    if ($b.Length -ge 2 -and $b[0] -eq 0xFE -and $b[1] -eq 0xFF) { return [Text.Encoding]::BigEndianUnicode.GetString($b, 2, $b.Length - 2) }
    # UTF-16 без метки: много нулевых байтов на чётных или нечётных местах
    $zOdd = 0; $zEven = 0
    $lim = [Math]::Min($b.Length, 2000)
    for ($i = 0; $i -lt $lim; $i++) { if ($b[$i] -eq 0) { if ($i % 2) { $zOdd++ } else { $zEven++ } } }
    if ($zOdd -gt $lim / 4 -and $zEven -lt $lim / 20) { return [Text.Encoding]::Unicode.GetString($b) }
    if ($zEven -gt $lim / 4 -and $zOdd -lt $lim / 20) { return [Text.Encoding]::BigEndianUnicode.GetString($b) }
    $s = $script:Utf8NoBom.GetString($b)
    # Знак замены в середине текста означает, что это не UTF-8
    $bad = 0
    $end = $s.Length - 3
    for ($i = 0; $i -lt $end; $i++) { if ($s[$i] -eq [char]0xFFFD) { $bad++; if ($bad -gt 0) { break } } }
    if ($bad -eq 0) { return $s }
    return $script:Enc1251.GetString($b)
}

function Read-TextHead([string]$path, [int]$max) {
    $bytes = Read-Head $path ([Math]::Max(8192, $max * 4))
    return (Format-Extract (ConvertFrom-TextBytes $bytes) $max)
}

# ---------------------------------------------------------------------
#  ZIP и XML
# ---------------------------------------------------------------------
function Open-ZipRead([string]$path) {
    $fs = Open-ReadStream $path
    try { return (New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Read, $false, $script:Enc866)) }
    catch { $fs.Dispose(); throw }
}

function Get-ZipEntry($zip, [string]$name) {
    $n = $name.TrimStart('/')
    $e = $zip.GetEntry($n)
    if ($e) { return $e }
    foreach ($x in $zip.Entries) { if ([string]::Equals($x.FullName, $n, [StringComparison]::OrdinalIgnoreCase)) { return $x } }
    return $null
}

function Read-Rels($zip, [string]$relsPath) {
    # Возвращает список @{Id; Type; Target} из файла связей
    $res = New-Object System.Collections.ArrayList
    $e = Get-ZipEntry $zip $relsPath
    if (-not $e) { return ,@() }
    $st = $e.Open()
    try {
        $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
        while ($r.Read()) {
            if ($r.NodeType -eq $script:NtElement -and $r.LocalName -eq 'Relationship') {
                [void]$res.Add(@{ Id = [string]$r.GetAttribute('Id'); Type = [string]$r.GetAttribute('Type'); Target = [string]$r.GetAttribute('Target') })
            }
        }
        $r.Dispose()
    } finally { $st.Dispose() }
    return ,($res.ToArray())
}

function Resolve-PartPath([string]$baseDir, [string]$target) {
    # Путь части внутри архива по ссылке из файла связей
    if ($target.StartsWith('/')) { return $target.TrimStart('/') }
    $parts = New-Object System.Collections.ArrayList
    foreach ($p in (($baseDir.Trim('/') + '/' + $target) -split '/')) {
        if ($p -eq '' -or $p -eq '.') { continue }
        if ($p -eq '..') { if ($parts.Count -gt 0) { $parts.RemoveAt($parts.Count - 1) }; continue }
        [void]$parts.Add($p)
    }
    return ($parts -join '/')
}

function Get-MainPart($zip, [string]$default) {
    foreach ($rel in (Read-Rels $zip '_rels/.rels')) {
        if ($rel.Type -like '*/officeDocument') { return (Resolve-PartPath '' $rel.Target) }
    }
    return $default
}

function Get-RelAttr($reader) {
    # Значение атрибута r:id у текущего элемента
    foreach ($ns in $script:RelNs) { $v = $reader.GetAttribute('id', $ns); if ($v) { return $v } }
    return ''
}

function Read-DocxText($zip, [int]$max) {
    $part = Get-MainPart $zip 'word/document.xml'
    $e = Get-ZipEntry $zip $part
    if (-not $e) { throw 'в файле нет текста документа' }
    $sb = New-Object System.Text.StringBuilder
    $st = $e.Open()
    try {
        $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
        $inT = $false
        $limit = $max + 200
        while ($sb.Length -lt $limit -and $r.Read()) {
            $nt = $r.NodeType
            if ($nt -eq $script:NtElement) {
                $ln = $r.LocalName
                if ($ln -eq 't') { if (-not $r.IsEmptyElement) { $inT = $true } }
                elseif ($ln -eq 'tab') { [void]$sb.Append("`t") }
                elseif ($ln -eq 'br' -or $ln -eq 'cr') { [void]$sb.Append("`n") }
                elseif ($ln -eq 'tc') { [void]$sb.Append(' ') }
            } elseif ($nt -eq $script:NtEnd) {
                $ln = $r.LocalName
                if ($ln -eq 't') { $inT = $false }
                elseif ($ln -eq 'p') { [void]$sb.Append("`n") }
            } elseif ($inT -and ($nt -eq $script:NtText -or $nt -eq $script:NtSws -or $nt -eq $script:NtWs -or $nt -eq $script:NtCData)) {
                [void]$sb.Append($r.Value)
            }
        }
        $r.Dispose()
    } finally { $st.Dispose() }
    return (Format-Extract $sb.ToString() $max)
}

function Read-XlsxText($zip, [int]$rows, [int]$max) {
    $wbPart = Get-MainPart $zip 'xl/workbook.xml'
    $wbDir = ''
    $i = $wbPart.LastIndexOf('/')
    if ($i -ge 0) { $wbDir = $wbPart.Substring(0, $i) }
    $wbName = $wbPart.Substring($i + 1)
    $rels = Read-Rels $zip ($wbDir + '/_rels/' + $wbName + '.rels')

    # Имена листов
    $sheets = New-Object System.Collections.ArrayList
    $e = Get-ZipEntry $zip $wbPart
    if (-not $e) { throw 'в файле нет книги Excel' }
    $st = $e.Open()
    try {
        $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
        while ($r.Read()) {
            if ($r.NodeType -eq $script:NtElement -and $r.LocalName -eq 'sheet') {
                [void]$sheets.Add(@{ Name = [string]$r.GetAttribute('name'); Rid = (Get-RelAttr $r) })
            }
        }
        $r.Dispose()
    } finally { $st.Dispose() }

    # Первый лист
    $sheetPart = ''
    if ($sheets.Count -gt 0) {
        foreach ($rel in $rels) { if ($rel.Id -eq $sheets[0].Rid) { $sheetPart = Resolve-PartPath $wbDir $rel.Target; break } }
    }
    if (-not $sheetPart) { $sheetPart = Resolve-PartPath $wbDir 'worksheets/sheet1.xml' }
    $sstPart = ''
    foreach ($rel in $rels) { if ($rel.Type -like '*/sharedStrings') { $sstPart = Resolve-PartPath $wbDir $rel.Target; break } }
    if (-not $sstPart) { $sstPart = Resolve-PartPath $wbDir 'sharedStrings.xml' }

    # Ячейки первых строк: список строк, в каждой список @{T; V}
    $rowList = New-Object System.Collections.ArrayList
    $need = @{}
    $maxIdx = -1
    $e = Get-ZipEntry $zip $sheetPart
    if ($e) {
        $st = $e.Open()
        try {
            $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
            $cur = $null; $cellType = ''; $inV = $false; $inIs = $false; $val = $null; $chars = 0
            while ($r.Read()) {
                $nt = $r.NodeType
                if ($nt -eq $script:NtElement) {
                    $ln = $r.LocalName
                    if ($ln -eq 'row') {
                        if ($rowList.Count -ge $rows) { break }
                        $cur = New-Object System.Collections.ArrayList
                        [void]$rowList.Add($cur)
                    } elseif ($ln -eq 'c') {
                        $cellType = [string]$r.GetAttribute('t')
                        $val = New-Object System.Text.StringBuilder
                    } elseif ($ln -eq 'v') { if (-not $r.IsEmptyElement) { $inV = $true } }
                    elseif ($ln -eq 'is') { $inIs = $true }
                    elseif ($ln -eq 't' -and $inIs) { if (-not $r.IsEmptyElement) { $inV = $true } }
                } elseif ($nt -eq $script:NtEnd) {
                    $ln = $r.LocalName
                    if ($ln -eq 'v' -or $ln -eq 't') { $inV = $false }
                    elseif ($ln -eq 'is') { $inIs = $false }
                    elseif ($ln -eq 'c') {
                        if ($null -ne $cur -and $null -ne $val -and $val.Length -gt 0) {
                            $v = $val.ToString()
                            if ($cellType -eq 's') {
                                $idx = 0
                                if ([int]::TryParse($v, [ref]$idx)) { $need[$idx] = $true; if ($idx -gt $maxIdx) { $maxIdx = $idx } }
                            }
                            [void]$cur.Add(@{ T = $cellType; V = $v })
                            $chars += $v.Length
                        }
                        $val = $null
                    } elseif ($ln -eq 'sheetData') { break }
                } elseif ($inV -and $null -ne $val -and ($nt -eq $script:NtText -or $nt -eq $script:NtSws -or $nt -eq $script:NtWs -or $nt -eq $script:NtCData)) {
                    [void]$val.Append($r.Value)
                }
                if ($chars -gt $max * 4) { break }
            }
            $r.Dispose()
        } finally { $st.Dispose() }
    }

    # Общие строки, только нужные номера
    $sst = @{}
    if ($maxIdx -ge 0) {
        $e = Get-ZipEntry $zip $sstPart
        if ($e) {
            $st = $e.Open()
            try {
                $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
                $idx = -1; $inT = $false; $skip = 0; $sbS = $null
                while ($r.Read()) {
                    $nt = $r.NodeType
                    if ($nt -eq $script:NtElement) {
                        $ln = $r.LocalName
                        if ($ln -eq 'si') { $idx++; if ($idx -gt $maxIdx) { break }; $sbS = New-Object System.Text.StringBuilder }
                        elseif ($ln -eq 'rPh') { if (-not $r.IsEmptyElement) { $skip++ } }
                        elseif ($ln -eq 't' -and $skip -eq 0) { if (-not $r.IsEmptyElement) { $inT = $true } }
                    } elseif ($nt -eq $script:NtEnd) {
                        $ln = $r.LocalName
                        if ($ln -eq 't') { $inT = $false }
                        elseif ($ln -eq 'rPh') { if ($skip -gt 0) { $skip-- } }
                        elseif ($ln -eq 'si') { if ($need.ContainsKey($idx)) { $sst[$idx] = $sbS.ToString() } }
                    } elseif ($inT -and ($nt -eq $script:NtText -or $nt -eq $script:NtSws -or $nt -eq $script:NtWs -or $nt -eq $script:NtCData)) {
                        if ($need.ContainsKey($idx)) { [void]$sbS.Append($r.Value) }
                    }
                }
                $r.Dispose()
            } finally { $st.Dispose() }
        }
    }

    $out = New-Object System.Text.StringBuilder
    $names = @($sheets | ForEach-Object { $_.Name })
    [void]$out.Append('Листы: ' + ($names -join ', ') + "`n")
    foreach ($row in $rowList) {
        $cells = New-Object System.Collections.ArrayList
        foreach ($c in $row) {
            $v = $c.V
            if ($c.T -eq 's') { $k = 0; if ([int]::TryParse($v, [ref]$k) -and $sst.ContainsKey($k)) { $v = $sst[$k] } else { $v = '' } }
            $v = ($v -replace '\s+', ' ').Trim()
            if ($v) { [void]$cells.Add($v) }
        }
        if ($cells.Count -gt 0) { [void]$out.Append(($cells -join ' | ') + "`n") }
        if ($out.Length -gt $max) { break }
    }
    return (Format-Extract $out.ToString() $max)
}

function Read-SlideText($zip, [string]$part, [bool]$titleOnly) {
    $e = Get-ZipEntry $zip $part
    if (-not $e) { return '' }
    $all = New-Object System.Text.StringBuilder
    $title = ''
    $st = $e.Open()
    try {
        $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
        $inT = $false; $inSp = $false; $isTitle = $false; $sp = $null
        while ($r.Read()) {
            $nt = $r.NodeType
            if ($nt -eq $script:NtElement) {
                $ln = $r.LocalName
                if ($ln -eq 'sp') { $inSp = $true; $isTitle = $false; $sp = New-Object System.Text.StringBuilder }
                elseif ($ln -eq 'ph') { $ty = [string]$r.GetAttribute('type'); if ($ty -eq 'title' -or $ty -eq 'ctrTitle') { $isTitle = $true } }
                elseif ($ln -eq 't') { if (-not $r.IsEmptyElement) { $inT = $true } }
                elseif ($ln -eq 'br') { [void]$all.Append("`n"); if ($sp) { [void]$sp.Append(' ') } }
            } elseif ($nt -eq $script:NtEnd) {
                $ln = $r.LocalName
                if ($ln -eq 't') { $inT = $false }
                elseif ($ln -eq 'p') { [void]$all.Append("`n"); if ($sp) { [void]$sp.Append(' ') } }
                elseif ($ln -eq 'sp') {
                    if ($isTitle -and -not $title -and $sp) { $title = ($sp.ToString() -replace '\s+', ' ').Trim() }
                    $inSp = $false; $sp = $null
                }
            } elseif ($inT -and ($nt -eq $script:NtText -or $nt -eq $script:NtSws -or $nt -eq $script:NtWs -or $nt -eq $script:NtCData)) {
                [void]$all.Append($r.Value)
                if ($sp) { [void]$sp.Append($r.Value) }
            }
            if ($titleOnly -and $title) { break }
        }
        $r.Dispose()
    } finally { $st.Dispose() }
    if ($titleOnly) {
        if ($title) { return $title }
        foreach ($line in ($all.ToString() -split "`n")) { $t = $line.Trim(); if ($t) { return $t } }
        return ''
    }
    return $all.ToString()
}

function Read-PptxText($zip, [int]$max) {
    $pPart = Get-MainPart $zip 'ppt/presentation.xml'
    $pDir = ''
    $i = $pPart.LastIndexOf('/')
    if ($i -ge 0) { $pDir = $pPart.Substring(0, $i) }
    $pName = $pPart.Substring($i + 1)
    $rels = Read-Rels $zip ($pDir + '/_rels/' + $pName + '.rels')
    $ids = New-Object System.Collections.ArrayList
    $e = Get-ZipEntry $zip $pPart
    if (-not $e) { throw 'в файле нет презентации' }
    $st = $e.Open()
    try {
        $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
        while ($r.Read()) {
            if ($r.NodeType -eq $script:NtElement -and $r.LocalName -eq 'sldId') { [void]$ids.Add((Get-RelAttr $r)) }
        }
        $r.Dispose()
    } finally { $st.Dispose() }
    $slides = New-Object System.Collections.ArrayList
    foreach ($id in $ids) {
        foreach ($rel in $rels) { if ($rel.Id -eq $id) { [void]$slides.Add((Resolve-PartPath $pDir $rel.Target)); break } }
    }
    if ($slides.Count -eq 0) { [void]$slides.Add((Resolve-PartPath $pDir 'slides/slide1.xml')) }
    $out = New-Object System.Text.StringBuilder
    [void]$out.Append("Слайдов: $($slides.Count)`nПервый слайд:`n")
    [void]$out.Append((Read-SlideText $zip $slides[0] $false))
    $titles = New-Object System.Collections.ArrayList
    for ($k = 1; $k -lt $slides.Count -and $k -le 5; $k++) {
        $t = Read-SlideText $zip $slides[$k] $true
        if ($t) { [void]$titles.Add($t) }
    }
    if ($titles.Count -gt 0) { [void]$out.Append("`nЗаголовки следующих слайдов:`n" + ($titles -join "`n")) }
    return (Format-Extract $out.ToString() $max)
}

function Get-ZipEntryName($entry) {
    # Имя файла внутри архива. Архив открыт в кодировке 866 (так пишут имена русские
    # архиваторы), но имя могло быть записано и в UTF-8: тогда его байты читаются как UTF-8.
    $name = $entry.FullName
    try {
        $bytes = $script:Enc866.GetBytes($name)
        $multi = $false
        foreach ($b in $bytes) { if ($b -ge 0x80) { $multi = $true; break } }
        if ($multi) { return $script:Utf8Strict.GetString($bytes) }
    } catch { }
    return $name
}

function Read-ZipListing($zip, [int]$max) {
    $names = New-Object System.Collections.ArrayList
    $n = 0
    foreach ($e in $zip.Entries) {
        $n++
        if ($names.Count -lt 60) { [void]$names.Add((Get-ZipEntryName $e)) }
    }
    $t = "Архив, файлов внутри: $n`n" + ($names -join "`n")
    return (Format-Extract $t $max)
}

# ---------------------------------------------------------------------
#  Составные файлы OLE (старые форматы Office, письма .msg, зашифрованные OOXML)
# ---------------------------------------------------------------------
function Test-CfbFile([string]$path) {
    $h = Read-Head $path 8
    if ($h.Length -lt 8) { return $false }
    $sig = @(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1)
    for ($i = 0; $i -lt 8; $i++) { if ($h[$i] -ne $sig[$i]) { return $false } }
    return $true
}

function Read-Exact($stream, [byte[]]$buf, [int]$count) {
    $got = 0
    while ($got -lt $count) {
        $n = $stream.Read($buf, $got, $count - $got)
        if ($n -le 0) { break }
        $got += $n
    }
    return $got
}

function Read-CfbChain($c, [int]$start, [long]$maxBytes) {
    # Читает цепочку секторов обычного размера
    $ms = New-Object IO.MemoryStream
    $buf = New-Object byte[] $c.SecSize
    $s = $start
    $guard = 0
    $fatLen = $c.Fat.Length
    while ($s -ge 0 -and $s -lt $fatLen -and $ms.Length -lt $maxBytes -and $guard -le $fatLen) {
        $c.Stream.Position = ([long]$s + 1) * $c.SecSize
        $got = Read-Exact $c.Stream $buf $c.SecSize
        if ($got -le 0) { break }
        $ms.Write($buf, 0, $got)
        $s = $c.Fat[$s]
        $guard++
    }
    $res = $ms.ToArray()
    $ms.Dispose()
    return ,$res
}

function Open-Cfb([string]$path) {
    $fs = Open-ReadStream $path
    try {
        $hdr = New-Object byte[] 512
        if ((Read-Exact $fs $hdr 512) -ne 512) { throw 'файл слишком короткий' }
        $sig = @(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1)
        for ($i = 0; $i -lt 8; $i++) { if ($hdr[$i] -ne $sig[$i]) { throw 'это не составной файл Office' } }
        $c = @{ Stream = $fs; MiniStream = $null }
        $c.SecSize  = 1 -shl [BitConverter]::ToUInt16($hdr, 0x1E)
        $c.MiniSize = 1 -shl [BitConverter]::ToUInt16($hdr, 0x20)
        if ($c.SecSize -lt 512 -or $c.SecSize -gt 65536 -or $c.MiniSize -lt 8 -or $c.MiniSize -gt 4096) { throw 'неверный заголовок файла' }
        $dirStart     = [BitConverter]::ToInt32($hdr, 0x30)
        $c.Cutoff     = [BitConverter]::ToInt32($hdr, 0x38)
        $miniFatStart = [BitConverter]::ToInt32($hdr, 0x3C)
        $difatStart   = [BitConverter]::ToInt32($hdr, 0x44)

        # Список секторов таблицы размещения
        $fatSecs = New-Object System.Collections.ArrayList
        for ($i = 0; $i -lt 109; $i++) {
            $v = [BitConverter]::ToInt32($hdr, 0x4C + 4 * $i)
            if ($v -ge 0) { [void]$fatSecs.Add($v) }
        }
        $buf = New-Object byte[] $c.SecSize
        $per = [int]($c.SecSize / 4)
        $s = $difatStart
        $guard = 0
        while ($s -ge 0 -and $guard -lt 10000) {
            $fs.Position = ([long]$s + 1) * $c.SecSize
            if ((Read-Exact $fs $buf $c.SecSize) -ne $c.SecSize) { break }
            for ($i = 0; $i -lt $per - 1; $i++) {
                $v = [BitConverter]::ToInt32($buf, 4 * $i)
                if ($v -ge 0) { [void]$fatSecs.Add($v) }
            }
            $s = [BitConverter]::ToInt32($buf, 4 * ($per - 1))
            $guard++
        }
        $fat = New-Object int[] ($fatSecs.Count * $per)
        for ($i = 0; $i -lt $fatSecs.Count; $i++) {
            $fs.Position = ([long]$fatSecs[$i] + 1) * $c.SecSize
            $got = Read-Exact $fs $buf $c.SecSize
            if ($got -ne $c.SecSize) { break }
            [Buffer]::BlockCopy($buf, 0, $fat, $i * $c.SecSize, $c.SecSize)
        }
        $c.Fat = $fat

        # Каталог
        $dir = Read-CfbChain $c $dirStart 8388608
        $entries = New-Object System.Collections.ArrayList
        for ($off = 0; $off + 128 -le $dir.Length; $off += 128) {
            $nameLen = [BitConverter]::ToUInt16($dir, $off + 0x40)
            $name = ''
            if ($nameLen -ge 2 -and $nameLen -le 64) { $name = [Text.Encoding]::Unicode.GetString($dir, $off, $nameLen - 2) }
            [void]$entries.Add(@{
                Name  = $name
                Type  = [int]$dir[$off + 0x42]
                Left  = [BitConverter]::ToInt32($dir, $off + 0x44)
                Right = [BitConverter]::ToInt32($dir, $off + 0x48)
                Child = [BitConverter]::ToInt32($dir, $off + 0x4C)
                Start = [BitConverter]::ToInt32($dir, $off + 0x74)
                Size  = [long][BitConverter]::ToUInt32($dir, $off + 0x78)
            })
        }
        if ($entries.Count -eq 0) { throw 'в файле нет каталога' }
        $c.Entries = $entries.ToArray()

        # Таблица малых секторов
        $mf = Read-CfbChain $c $miniFatStart 16777216
        $miniFat = New-Object int[] ([int]($mf.Length / 4))
        if ($miniFat.Length -gt 0) { [Buffer]::BlockCopy($mf, 0, $miniFat, 0, $miniFat.Length * 4) }
        $c.MiniFat = $miniFat
        return $c
    } catch { $fs.Dispose(); throw }
}

function Close-Cfb($c) { if ($c -and $c.Stream) { try { $c.Stream.Dispose() } catch { } } }

function Get-CfbChildren($c, [int]$index) {
    # Возвращает таблицу «имя -> номер записи» для вложенных элементов хранилища
    $res = @{}
    $root = $c.Entries[$index].Child
    $stack = New-Object System.Collections.Stack
    if ($root -ge 0) { $stack.Push($root) }
    $guard = 0
    $count = $c.Entries.Length
    while ($stack.Count -gt 0 -and $guard -lt $count * 2 + 10) {
        $guard++
        $i = [int]$stack.Pop()
        if ($i -lt 0 -or $i -ge $count) { continue }
        $e = $c.Entries[$i]
        if ($e.Name -and -not $res.ContainsKey($e.Name)) { $res[$e.Name] = $i }
        if ($e.Left -ge 0) { $stack.Push($e.Left) }
        if ($e.Right -ge 0) { $stack.Push($e.Right) }
    }
    return $res
}

function Get-CfbStream($c, [int]$index, [long]$maxBytes) {
    $e = $c.Entries[$index]
    $size = [Math]::Min($e.Size, $maxBytes)
    if ($size -le 0) { return ,(New-Object byte[] 0) }
    if ($e.Size -lt $c.Cutoff -and $index -ne 0) {
        if ($null -eq $c.MiniStream) { $c.MiniStream = Read-CfbChain $c $c.Entries[0].Start ([Math]::Max($c.Entries[0].Size, 1)) }
        $res = New-Object byte[] $size
        $s = $e.Start
        $pos = 0
        $guard = 0
        while ($s -ge 0 -and $s -lt $c.MiniFat.Length -and $pos -lt $size -and $guard -le $c.MiniFat.Length) {
            $off = [long]$s * $c.MiniSize
            $n = [Math]::Min($c.MiniSize, $size - $pos)
            if ($off + $n -gt $c.MiniStream.Length) { break }
            [Array]::Copy($c.MiniStream, $off, $res, $pos, $n)
            $pos += $n
            $s = $c.MiniFat[$s]
            $guard++
        }
        return ,$res
    }
    $all = Read-CfbChain $c $e.Start $size
    if ($all.Length -gt $size) { $res = New-Object byte[] $size; [Array]::Copy($all, $res, $size); return ,$res }
    return ,$all
}

function Test-OoxmlEncrypted([string]$path) {
    # Файл с расширением docx/xlsx/pptx, защищённый паролем, хранится как составной файл с потоком EncryptedPackage
    $c = $null
    try {
        $c = Open-Cfb $path
        $kids = Get-CfbChildren $c 0
        return ($kids.ContainsKey('EncryptedPackage') -or $kids.ContainsKey('EncryptionInfo'))
    } catch { return $false }
    finally { Close-Cfb $c }
}

function Test-DocEncrypted([string]$path) {
    # Признак шифрования в заголовке документа Word 97-2003
    $c = $null
    try {
        $c = Open-Cfb $path
        $kids = Get-CfbChildren $c 0
        if (-not $kids.ContainsKey('WordDocument')) { return $false }
        $b = Get-CfbStream $c $kids['WordDocument'] 32
        if ($b.Length -lt 12) { return $false }
        return (([BitConverter]::ToUInt16($b, 0x0A) -band 0x0100) -ne 0)
    } catch { return $false }
    finally { Close-Cfb $c }
}

function ConvertFrom-HtmlSimple([string]$html) {
    $t = $html -replace '(?is)<(script|style)\b.*?</\1>', ' '
    $t = $t -replace '(?i)<br\s*/?>|</p>|</div>|</tr>|</h\d>', "`n"
    $t = $t -replace '<[^>]+>', ' '
    $t = $t.Replace('&nbsp;', ' ').Replace('&amp;', '&').Replace('&lt;', '<').Replace('&gt;', '>').Replace('&quot;', '"')
    return $t
}

function Read-MsgText([string]$path, [int]$max) {
    $c = Open-Cfb $path
    try {
        $kids = Get-CfbChildren $c 0
        if (-not $kids.ContainsKey('__properties_version1.0')) { throw 'это не письмо Outlook' }

        # Свойства: даты и кодовая страница
        $cp = 1251
        $date = ''
        $props = Get-CfbStream $c $kids['__properties_version1.0'] 65536
        for ($off = 32; $off + 16 -le $props.Length; $off += 16) {
            $type = [BitConverter]::ToUInt16($props, $off)
            $id   = [BitConverter]::ToUInt16($props, $off + 2)
            if ($type -eq 0x0040 -and ($id -eq 0x0039 -or $id -eq 0x0E06) -and -not $date) {
                $ft = [BitConverter]::ToInt64($props, $off + 8)
                if ($ft -gt 0) { try { $date = [datetime]::FromFileTimeUtc($ft).ToLocalTime().ToString('dd.MM.yyyy HH:mm', $script:Inv) } catch { } }
            } elseif ($type -eq 0x0003 -and ($id -eq 0x3FDE -or $id -eq 0x3FFD)) {
                $v = [BitConverter]::ToInt32($props, $off + 8)
                if ($v -gt 0 -and $v -ne 65001 -and $id -eq 0x3FFD) { $cp = $v }
            }
        }
        $ansi = $script:Enc1251
        try { $ansi = [Text.Encoding]::GetEncoding($cp) } catch { }

        $getStr = {
            param([string]$propId, [long]$limit)
            $n = '__substg1.0_' + $propId + '001F'
            if ($kids.ContainsKey($n)) { return [Text.Encoding]::Unicode.GetString((Get-CfbStream $c $kids[$n] $limit)) }
            $n = '__substg1.0_' + $propId + '001E'
            if ($kids.ContainsKey($n)) { return $ansi.GetString((Get-CfbStream $c $kids[$n] $limit)) }
            return ''
        }
        $subject = (& $getStr '0037' 2000).Trim([char]0, ' ')
        $from    = (& $getStr '0C1A' 1000).Trim([char]0, ' ')
        $to      = (& $getStr '0E04' 2000).Trim([char]0, ' ')
        $body    = & $getStr '1000' ([long]$max * 4 + 64)
        if (-not $body.Trim()) {
            $n = '__substg1.0_10130102'
            if ($kids.ContainsKey($n)) {
                $hb = Get-CfbStream $c $kids[$n] ([long]$max * 40 + 4096)
                $body = ConvertFrom-HtmlSimple (ConvertFrom-TextBytes $hb)
            }
        }

        # Имена вложений
        $att = New-Object System.Collections.ArrayList
        foreach ($k in @($kids.Keys)) {
            if ($k -like '__attach_version1.0_#*') {
                $ak = Get-CfbChildren $c $kids[$k]
                $nm = ''
                foreach ($pn in @('__substg1.0_3707001F', '__substg1.0_3704001F')) {
                    if ($ak.ContainsKey($pn)) { $nm = [Text.Encoding]::Unicode.GetString((Get-CfbStream $c $ak[$pn] 1000)).Trim([char]0, ' '); break }
                }
                if (-not $nm) {
                    foreach ($pn in @('__substg1.0_3707001E', '__substg1.0_3704001E')) {
                        if ($ak.ContainsKey($pn)) { $nm = $ansi.GetString((Get-CfbStream $c $ak[$pn] 1000)).Trim([char]0, ' '); break }
                    }
                }
                if ($nm -and $att.Count -lt 20) { [void]$att.Add($nm) }
            }
        }

        $sb = New-Object System.Text.StringBuilder
        [void]$sb.Append("Письмо`nТема: $subject`nОт: $from`n")
        if ($to) { [void]$sb.Append("Кому: $to`n") }
        if ($date) { [void]$sb.Append("Дата: $date`n") }
        if ($att.Count -gt 0) { [void]$sb.Append('Вложения: ' + ($att -join '; ') + "`n") }
        [void]$sb.Append("`n")
        $head = $sb.ToString()
        return ($head + (Format-Extract $body.Replace([string][char]0, '') $max))
    } finally { Close-Cfb $c }
}

# ---------------------------------------------------------------------
#  RTF
# ---------------------------------------------------------------------
function ConvertFrom-RtfSimple([string]$rtf, [int]$max) {
    $sb = New-Object System.Text.StringBuilder
    $n = $rtf.Length
    $i = 0
    $depth = 0
    $skipDepth = -1
    $enc = $script:Enc1251
    $ucSkip = 1
    $pending = 0
    $hex = New-Object System.Collections.Generic.List[byte]
    $ignore = @{}
    foreach ($w in @('fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf',
                     'ftnsep', 'ftnsepc', 'themedata', 'datastore', 'listtable', 'listoverridetable', 'revtbl', 'rsidtbl', 'generator', 'xmlnstbl', 'latentstyles',
                     'fldinst', 'colorschememapping', 'datafield', 'pgdsctbl', 'filetbl', 'mmathPr', 'wgrffmtfilter', 'bkmkstart', 'bkmkend')) { $ignore[$w] = $true }
    $braces = [char[]]@('{', '}')
    while ($i -lt $n -and $sb.Length -lt $max) {
        $ch = $rtf[$i]
        if ($skipDepth -ge 0) {
            # Пропускаем содержимое служебной группы до её закрытия
            $j = $rtf.IndexOfAny($braces, $i)
            if ($j -lt 0) { break }
            if ($j -gt 0 -and $rtf[$j - 1] -eq '\') { $i = $j + 1; continue }
            if ($rtf[$j] -eq '{') { $depth++ }
            else {
                if ($depth -le $skipDepth) { $skipDepth = -1 }
                $depth--
            }
            $i = $j + 1
            continue
        }
        if ($ch -eq '{') { if ($hex.Count) { [void]$sb.Append($enc.GetString($hex.ToArray())); $hex.Clear() }; $depth++; $i++; continue }
        if ($ch -eq '}') { if ($hex.Count) { [void]$sb.Append($enc.GetString($hex.ToArray())); $hex.Clear() }; $depth--; $i++; continue }
        if ($ch -eq '\') {
            $i++
            if ($i -ge $n) { break }
            $c2 = $rtf[$i]
            if ($c2 -eq "'") {
                if ($i + 2 -lt $n) {
                    $b = 0
                    if ([int]::TryParse($rtf.Substring($i + 1, 2), [Globalization.NumberStyles]::HexNumber, $script:Inv, [ref]$b)) {
                        if ($pending -gt 0) { $pending-- } else { $hex.Add([byte]$b) }
                    }
                }
                $i += 3
                continue
            }
            if ($hex.Count) { [void]$sb.Append($enc.GetString($hex.ToArray())); $hex.Clear() }
            if ($c2 -eq '\' -or $c2 -eq '{' -or $c2 -eq '}') { [void]$sb.Append($c2); $i++; continue }
            if ($c2 -eq '*') { $skipDepth = $depth; $i++; continue }
            if ($c2 -eq '~') { [void]$sb.Append(' '); $i++; continue }
            if ($c2 -eq '-') { $i++; continue }
            if ($c2 -eq '_') { [void]$sb.Append('-'); $i++; continue }
            if ($c2 -eq "`r" -or $c2 -eq "`n") { [void]$sb.Append("`n"); $i++; continue }
            $j = $i
            while ($j -lt $n -and (($rtf[$j] -ge 'a' -and $rtf[$j] -le 'z') -or ($rtf[$j] -ge 'A' -and $rtf[$j] -le 'Z'))) { $j++ }
            if ($j -eq $i) { $i++; continue }
            $word = $rtf.Substring($i, $j - $i)
            $k = $j
            if ($k -lt $n -and ($rtf[$k] -eq '-' -or [char]::IsDigit($rtf[$k]))) {
                $k++
                while ($k -lt $n -and [char]::IsDigit($rtf[$k])) { $k++ }
            }
            $param = $rtf.Substring($j, $k - $j)
            if ($k -lt $n -and $rtf[$k] -eq ' ') { $k++ }
            $i = $k
            if ($word -ceq 'par' -or $word -ceq 'line' -or $word -ceq 'sect' -or $word -ceq 'page' -or $word -ceq 'row') { [void]$sb.Append("`n") }
            elseif ($word -ceq 'tab' -or $word -ceq 'cell') { [void]$sb.Append("`t") }
            elseif ($word -ceq 'u') {
                $code = 0
                if ([int]::TryParse($param, [ref]$code)) {
                    if ($code -lt 0) { $code += 65536 }
                    if ($code -gt 0 -and $code -le 65535) { [void]$sb.Append([char]$code) }
                    $pending = $ucSkip
                }
            }
            elseif ($word -ceq 'uc') { $v = 1; if ([int]::TryParse($param, [ref]$v)) { $ucSkip = $v } }
            elseif ($word -ceq 'ansicpg') { $v = 0; if ([int]::TryParse($param, [ref]$v)) { try { $enc = [Text.Encoding]::GetEncoding($v) } catch { } } }
            elseif ($word -ceq 'emdash') { [void]$sb.Append([char]0x2014) }
            elseif ($word -ceq 'endash') { [void]$sb.Append([char]0x2013) }
            elseif ($word -ceq 'lquote' -or $word -ceq 'rquote') { [void]$sb.Append("'") }
            elseif ($word -ceq 'ldblquote' -or $word -ceq 'rdblquote') { [void]$sb.Append('"') }
            elseif ($word -ceq 'bullet') { [void]$sb.Append('*') }
            elseif ($ignore.ContainsKey($word)) { $skipDepth = $depth }
            continue
        }
        if ($ch -eq "`r" -or $ch -eq "`n") { $i++; continue }
        if ($pending -gt 0) { $pending--; $i++; continue }
        if ($hex.Count) { [void]$sb.Append($enc.GetString($hex.ToArray())); $hex.Clear() }
        [void]$sb.Append($ch)
        $i++
    }
    if ($hex.Count) { [void]$sb.Append($enc.GetString($hex.ToArray())) }
    return $sb.ToString()
}

function Read-RtfText([string]$path, [long]$size, [int]$max) {
    if ($script:IsWin -and $size -lt 31457280) {
        # Встроенный класс .NET RichTextBox, Word не запускается
        $rtb = $null
        try {
            Add-Type -AssemblyName System.Windows.Forms
            $rtb = New-Object System.Windows.Forms.RichTextBox
            $rtb.LoadFile($path, [System.Windows.Forms.RichTextBoxStreamType]::RichText)
            $t = $rtb.Text
            if ($t -and $t.Trim()) { return (Format-Extract $t $max) }
        } catch { Write-Log ('RichTextBox не прочитал RTF, читаю запасным способом: ' + (Get-ErrText $_)) }
        finally { if ($rtb) { try { $rtb.Dispose() } catch { } } }
    }
    $bytes = Read-Head $path ([int][Math]::Min($size, 4194304))
    $raw = [Text.Encoding]::GetEncoding(28591).GetString($bytes)
    return (Format-Extract (ConvertFrom-RtfSimple $raw ($max + 200)) $max)
}

# ---------------------------------------------------------------------
#  HTML: текст и признаки самостоятельного инструмента
# ---------------------------------------------------------------------
function Get-HtmlInfo([string]$path) {
    # Возвращает @{ Title; InlineScript; Saved; Refs; Head }
    $bytes = Read-Head $path 400000
    $html = ConvertFrom-TextBytes $bytes
    $info = @{ Title = ''; InlineScript = 0; Saved = $false; Refs = @(); Html = $html }
    $m = [regex]::Match($html, '(?is)<title[^>]*>(.*?)</title>')
    if ($m.Success) { $info.Title = (($m.Groups[1].Value -replace '\s+', ' ').Trim()) }
    if ($html -match '(?i)<!--\s*saved from url=' -or $html -match '(?i)<meta[^>]+name=["'']?savepage') { $info.Saved = $true }
    $total = 0
    foreach ($sm in [regex]::Matches($html, '(?is)<script\b([^>]*)>(.*?)(</script>|$)')) {
        if ($sm.Groups[1].Value -notmatch '(?i)\bsrc\s*=') { $total += $sm.Groups[2].Value.Trim().Length }
    }
    $info.InlineScript = $total
    $refs = New-Object System.Collections.ArrayList
    foreach ($rm in [regex]::Matches($html, '(?i)\b(?:src|href)\s*=\s*["'']([^"''#?]+)["'']')) {
        $v = $rm.Groups[1].Value.Trim()
        if ($v -match '^(?i)(https?:|data:|mailto:|javascript:|file:|//)') { continue }
        if ($refs.Count -lt 200) { [void]$refs.Add($v) }
    }
    $info.Refs = $refs.ToArray()
    return $info
}

# =====================================================================
#  Чтение старых форматов (.doc, .xls, .ppt) через установленный Office.
#  Office работает в отдельном потоке: без окна, только на чтение, с отключёнными
#  макросами и предупреждениями. Читается временная копия файла, поэтому исходный
#  файл Office не открывает вовсе. На каждое чтение задан тайм-аут: если программа
#  Office не ответила, она завершается.
# =====================================================================

# Код, который выполняется в рабочем потоке
$script:OfficeInit = @'
$ErrorActionPreference = 'Stop'
$global:Word = $null
$global:Excel = $null
$global:PP = $null

function Get-ProcIds([string]$name) {
    $ids = @()
    try { $ids = @(Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }) } catch { }
    return ,$ids
}
function Register-NewProc([string]$key, [string]$name, $before) {
    foreach ($id in (Get-ProcIds $name)) { if ($before -notcontains $id) { $Shared.Pids[$key] = $id } }
}
function Test-PasswordError($err) {
    $m = [string]$err.Exception.Message
    $ex = $err.Exception
    while ($ex.InnerException) { $ex = $ex.InnerException; $m += ' ' + $ex.Message }
    return ($m -match '(?i)парол|password')
}
function Clear-ComText([string]$t) {
    if (-not $t) { return '' }
    $t = $t.Replace("`r", "`n")
    return ($t -replace '[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ')
}

function Read-WordFile([string]$path, [int]$max) {
    if (-not $global:Word) {
        $before = Get-ProcIds 'WINWORD'
        try { $global:Word = New-Object -ComObject Word.Application }
        catch { $global:Word = $null; return @{ ok = $false; appError = $true; error = ('не удалось запустить Word: ' + $_.Exception.Message) } }
        Register-NewProc 'word' 'WINWORD' $before
        try { $global:Word.Visible = $false } catch { }
        try { $global:Word.DisplayAlerts = 0 } catch { }
        try { $global:Word.AutomationSecurity = 3 } catch { }
        try { $global:Word.Options.UpdateLinksAtOpen = $false } catch { }
    }
    $doc = $null
    try {
        $m = [Type]::Missing
        $pw = 'zz-net-parolya-zz'
        try {
            $doc = $global:Word.Documents.Open($path, $false, $true, $false, $pw, $pw, $false, $pw, $pw, $m, $m, $false, $false, $m, $true)
        } catch {
            if (Test-PasswordError $_) { return @{ ok = $false; protected = $true; error = 'защищён паролем' } }
            throw
        }
        $end = [int]$doc.Content.End
        $n = [Math]::Min($max + 300, $end)
        $text = ''
        if ($n -gt 0) { $text = [string]$doc.Range(0, $n).Text }
        return @{ ok = $true; text = (Clear-ComText $text) }
    } finally {
        if ($doc) {
            try { $doc.Close(0) } catch { }
            try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($doc) } catch { }
        }
    }
}

function Read-ExcelFile([string]$path, [int]$rows, [int]$max) {
    if (-not $global:Excel) {
        $before = Get-ProcIds 'EXCEL'
        try { $global:Excel = New-Object -ComObject Excel.Application }
        catch { $global:Excel = $null; return @{ ok = $false; appError = $true; error = ('не удалось запустить Excel: ' + $_.Exception.Message) } }
        Register-NewProc 'excel' 'EXCEL' $before
        try { $global:Excel.Visible = $false } catch { }
        try { $global:Excel.DisplayAlerts = $false } catch { }
        try { $global:Excel.AskToUpdateLinks = $false } catch { }
        try { $global:Excel.EnableEvents = $false } catch { }
        try { $global:Excel.AutomationSecurity = 3 } catch { }
    }
    $wb = $null
    try {
        $m = [Type]::Missing
        try {
            $wb = $global:Excel.Workbooks.Open($path, 0, $true, $m, '', '', $true, $m, $m, $false, $false, $m, $false)
        } catch {
            if (Test-PasswordError $_) { return @{ ok = $false; protected = $true; error = 'защищён паролем' } }
            throw
        }
        $names = New-Object System.Collections.ArrayList
        foreach ($s in $wb.Sheets) { [void]$names.Add([string]$s.Name) }
        $sb = New-Object System.Text.StringBuilder
        [void]$sb.Append('Листы: ' + ($names -join ', ') + "`n")
        if ($wb.Worksheets.Count -ge 1) {
            $ws = $wb.Worksheets.Item(1)
            $used = $ws.UsedRange
            $lastRow = [Math]::Min($rows, [int]$used.Row + [int]$used.Rows.Count - 1)
            $lastCol = [Math]::Min(30, [int]$used.Column + [int]$used.Columns.Count - 1)
            if ($lastRow -ge 1 -and $lastCol -ge 1) {
                $vals = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($lastRow, $lastCol)).Value2
                if ($vals -is [Array]) {
                    $r0 = $vals.GetLowerBound(0); $r1 = $vals.GetUpperBound(0)
                    $c0 = $vals.GetLowerBound(1); $c1 = $vals.GetUpperBound(1)
                    for ($r = $r0; $r -le $r1 -and $sb.Length -lt $max; $r++) {
                        $cells = New-Object System.Collections.ArrayList
                        for ($c = $c0; $c -le $c1; $c++) {
                            $v = $vals.GetValue($r, $c)
                            if ($null -ne $v) { $t = ([string]$v -replace '\s+', ' ').Trim(); if ($t) { [void]$cells.Add($t) } }
                        }
                        if ($cells.Count -gt 0) { [void]$sb.Append(($cells -join ' | ') + "`n") }
                    }
                } elseif ($null -ne $vals) { [void]$sb.Append([string]$vals) }
            }
        }
        return @{ ok = $true; text = $sb.ToString() }
    } finally {
        if ($wb) {
            try { $wb.Close($false) } catch { }
            try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) } catch { }
        }
    }
}

function Read-PptFile([string]$path, [int]$max) {
    if (-not $global:PP) {
        $before = Get-ProcIds 'POWERPNT'
        # PowerPoint работает в одном экземпляре. Если он уже открыт у пользователя,
        # программа его не трогает, чтобы не закрыть чужие презентации.
        if ($before.Count -gt 0) { return @{ ok = $false; appError = $true; error = 'PowerPoint уже открыт у пользователя, файлы .ppt через него не читались' } }
        try { $global:PP = New-Object -ComObject PowerPoint.Application }
        catch { $global:PP = $null; return @{ ok = $false; appError = $true; error = ('не удалось запустить PowerPoint: ' + $_.Exception.Message) } }
        Register-NewProc 'ppt' 'POWERPNT' $before
    }
    $pres = $null
    try {
        $pres = $global:PP.Presentations.Open($path, -1, 0, 0)
        $sb = New-Object System.Text.StringBuilder
        $count = [int]$pres.Slides.Count
        [void]$sb.Append("Слайдов: $count`nПервый слайд:`n")
        if ($count -ge 1) {
            foreach ($sh in $pres.Slides.Item(1).Shapes) {
                try { if ($sh.HasTextFrame -and $sh.TextFrame.HasText) { [void]$sb.Append([string]$sh.TextFrame.TextRange.Text + "`n") } } catch { }
            }
        }
        $titles = New-Object System.Collections.ArrayList
        for ($i = 2; $i -le $count -and $i -le 6; $i++) {
            try {
                $sl = $pres.Slides.Item($i)
                if ($sl.Shapes.HasTitle) { $t = [string]$sl.Shapes.Title.TextFrame.TextRange.Text; if ($t) { [void]$titles.Add($t) } }
            } catch { }
        }
        if ($titles.Count -gt 0) { [void]$sb.Append("Заголовки следующих слайдов:`n" + ($titles -join "`n")) }
        return @{ ok = $true; text = (Clear-ComText $sb.ToString()) }
    } finally {
        if ($pres) {
            try { $pres.Close() } catch { }
            try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($pres) } catch { }
        }
    }
}

function Close-OfficeApps {
    if ($global:Word)  { try { $global:Word.Quit(0) } catch { }; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($global:Word) } catch { }; $global:Word = $null }
    if ($global:Excel) { try { $global:Excel.Quit() } catch { }; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($global:Excel) } catch { }; $global:Excel = $null }
    if ($global:PP)    { try { $global:PP.Quit() } catch { }; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($global:PP) } catch { }; $global:PP = $null }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    return @{ ok = $true }
}
'@

$script:OfficeRs = $null
$script:OfficeShared = $null
$script:OfficeOff = @{}       # какие программы Office отключены до конца запуска и почему
$script:OfficeTimeouts = @{}  # сколько раз программа Office не ответила
$script:TempDir = $null

function Get-TempDir {
    if (-not $script:TempDir) {
        $script:TempDir = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'DesktopSorter-' + $PID)
        [void][IO.Directory]::CreateDirectory($script:TempDir)
    }
    return $script:TempDir
}

function Remove-TempDir {
    # Удаляются только собственные временные копии программы
    if ($script:TempDir -and [IO.Directory]::Exists($script:TempDir)) {
        try { [IO.Directory]::Delete($script:TempDir, $true) } catch { Write-Log ('Не удалось убрать временную папку: ' + (Get-ErrText $_)) }
    }
    $script:TempDir = $null
}

function Start-OfficeWorker([string]$initScript) {
    $script:OfficeShared = [hashtable]::Synchronized(@{ Pids = [hashtable]::Synchronized(@{}) })
    $rs = [runspacefactory]::CreateRunspace()
    if ($script:IsWin) { try { $rs.ApartmentState = [Threading.ApartmentState]::STA } catch { } }
    $rs.ThreadOptions = [System.Management.Automation.Runspaces.PSThreadOptions]::ReuseThread
    $rs.Open()
    $rs.SessionStateProxy.SetVariable('Shared', $script:OfficeShared)
    $ps = [powershell]::Create()
    $ps.Runspace = $rs
    try {
        [void]$ps.AddScript($initScript)
        [void]$ps.Invoke()
    } finally { $ps.Dispose() }
    $script:OfficeRs = $rs
}

function Stop-OfficeProcesses {
    # Завершает только те процессы Office, которые запустила сама программа
    if (-not $script:OfficeShared) { return }
    foreach ($k in @($script:OfficeShared.Pids.Keys)) {
        $id = $script:OfficeShared.Pids[$k]
        try { Stop-Process -Id $id -Force -ErrorAction Stop; Write-Log "Завершён зависший процесс Office ($k, номер $id)" } catch { }
    }
    $script:OfficeShared.Pids.Clear()
}

function Invoke-OfficeJob([string]$func, [object[]]$jobArgs, [int]$timeoutSec) {
    # Возвращает хеш-таблицу: ok, text, error, protected, timeout
    if (-not $script:OfficeRs) { Start-OfficeWorker $script:OfficeInit }
    $ps = [powershell]::Create()
    $ps.Runspace = $script:OfficeRs
    [void]$ps.AddCommand($func)
    foreach ($a in $jobArgs) { [void]$ps.AddArgument($a) }
    $handle = $ps.BeginInvoke()
    if ($handle.AsyncWaitHandle.WaitOne($timeoutSec * 1000)) {
        try {
            $out = $ps.EndInvoke($handle)
            $res = $null
            foreach ($o in $out) { if ($o -is [hashtable]) { $res = $o } }
            if ($ps.HadErrors -and -not $res) {
                $msg = 'ошибка Office'
                if ($ps.Streams.Error.Count -gt 0) { $msg = Get-ErrText $ps.Streams.Error[0] }
                return @{ ok = $false; error = $msg }
            }
            if (-not $res) { return @{ ok = $false; error = 'Office не вернул текст' } }
            return $res
        } catch {
            return @{ ok = $false; error = (Get-ErrText $_) }
        } finally { try { $ps.Dispose() } catch { } }
    }
    # Тайм-аут: завершаем зависшую программу Office и заводим новый рабочий поток
    Stop-OfficeProcesses
    try { [void]$ps.BeginStop($null, $null) } catch { }
    $script:OfficeRs = $null
    return @{ ok = $false; timeout = $true; error = "Office не ответил за $timeoutSec с и был закрыт" }
}

function Stop-OfficeWorker {
    if ($script:OfficeRs) {
        try { [void](Invoke-OfficeJob 'Close-OfficeApps' @() 20) } catch { }
        if ($script:OfficeRs) { try { $script:OfficeRs.Close() } catch { }; try { $script:OfficeRs.Dispose() } catch { } }
        $script:OfficeRs = $null
    }
    # Если программа Office не закрылась сама, завершаем запущенные нами процессы
    if ($script:OfficeShared -and $script:OfficeShared.Pids.Count -gt 0) {
        Start-Sleep -Milliseconds 1500
        foreach ($k in @($script:OfficeShared.Pids.Keys)) {
            $id = $script:OfficeShared.Pids[$k]
            try { $p = Get-Process -Id $id -ErrorAction Stop; if ($p) { Stop-Process -Id $id -Force -ErrorAction Stop } } catch { }
        }
        $script:OfficeShared.Pids.Clear()
    }
}

function Test-OfficeApp([string]$progId) {
    # Проверяет по реестру (только чтение), установлена ли программа Office
    if (-not $script:IsWin) { return $false }
    try { return (Test-Path -LiteralPath ("Registry::HKEY_CLASSES_ROOT\$progId")) } catch { return $false }
}

function Read-LegacyOffice([string]$path, [string]$ext, [long]$size) {
    # Возвращает @{ State = ok|protected|corrupt|meta; Text; Note }
    $app = 'word'; $prog = 'Word.Application'; $func = 'Read-WordFile'
    if ($ext -eq '.xls') { $app = 'excel'; $prog = 'Excel.Application'; $func = 'Read-ExcelFile' }
    elseif ($ext -eq '.ppt' -or $ext -eq '.pps') { $app = 'ppt'; $prog = 'PowerPoint.Application'; $func = 'Read-PptFile' }

    if ($ext -eq '.doc' -and (Test-DocEncrypted $path)) { return @{ State = 'protected'; Text = ''; Note = 'защищён паролем' } }
    if ($script:OfficeOff.ContainsKey($app)) { return @{ State = 'meta'; Text = ''; Note = $script:OfficeOff[$app] } }
    if (-not (Test-OfficeApp $prog)) {
        $script:OfficeOff[$app] = 'программа Office для этого формата не установлена'
        return @{ State = 'meta'; Text = ''; Note = $script:OfficeOff[$app] }
    }
    if ($size -gt 104857600) { return @{ State = 'meta'; Text = ''; Note = 'файл больше 100 МБ, через Office не читался' } }

    $max = Get-OptInt 'ЗнаковТекста'
    $tmp = [IO.Path]::Combine((Get-TempDir), ([Guid]::NewGuid().ToString('N') + $ext))
    try {
        [IO.File]::Copy($path, $tmp, $true)
        try { [IO.File]::SetAttributes($tmp, [IO.FileAttributes]::Normal) } catch { }
        $jobArgs = @($tmp, $max)
        if ($app -eq 'excel') { $jobArgs = @($tmp, (Get-OptInt 'СтрокExcel'), $max) }
        $r = Invoke-OfficeJob $func $jobArgs (Get-OptInt 'ТаймаутOffice_сек')
        if ($r.ContainsKey('timeout') -and $r.timeout) {
            $n = 1
            if ($script:OfficeTimeouts.ContainsKey($app)) { $n = 1 + [int]$script:OfficeTimeouts[$app] }
            $script:OfficeTimeouts[$app] = $n
            if ($n -ge 3) { $script:OfficeOff[$app] = 'программа Office трижды не ответила, чтение этого формата отключено до конца запуска' }
            return @{ State = 'meta'; Text = ''; Note = $r.error }
        }
        if ($r.ContainsKey('appError') -and $r.appError) {
            $script:OfficeOff[$app] = [string]$r.error
            Write-Log ('Office: ' + [string]$r.error)
            return @{ State = 'meta'; Text = ''; Note = [string]$r.error }
        }
        if ($r.ContainsKey('protected') -and $r.protected) { return @{ State = 'protected'; Text = ''; Note = 'защищён паролем' } }
        if (-not $r.ok) { return @{ State = 'corrupt'; Text = ''; Note = ('не открылся в Office: ' + $r.error) } }
        return @{ State = 'ok'; Text = (Format-Extract ([string]$r.text) $max); Note = '' }
    } finally {
        try { if ([IO.File]::Exists($tmp)) { [IO.File]::Delete($tmp) } } catch { }
    }
}

# =====================================================================
#  Запуск
# =====================================================================
if ($env:DESKTOPSORTER_NO_MAIN -eq '1') { return }

