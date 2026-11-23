# =====================================================================
#  Общие вспомогательные функции
# =====================================================================

$script:LogWriter = $null
function Write-Log([string]$text) {
    # Файл «Ход работы.log» держится открытым: на сетевой папке это в разы быстрее,
    # чем открывать его заново на каждую строку. Каждая строка сразу сбрасывается в файл.
    if (-not $script:LogPath) { return }
    $line = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss', $script:Inv) + ' ' + $text
    try {
        if (-not $script:LogWriter) {
            $script:LogWriter = New-Object IO.StreamWriter($script:LogPath, $true, $script:Utf8Bom)
            $script:LogWriter.AutoFlush = $true
        }
        $script:LogWriter.WriteLine($line)
    } catch {
        $script:LogWriter = $null
        try { [IO.File]::AppendAllText($script:LogPath, $line + "`r`n", $script:Utf8Bom) } catch { }
    }
}
function Close-Log {
    if ($script:LogWriter) { try { $script:LogWriter.Dispose() } catch { }; $script:LogWriter = $null }
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

function Ask-YesNo([string]$question, [bool]$strict = $false) {
    # $strict: согласием считается только слово «да» целиком (перемещение файлов и откат),
    # любой другой ответ и пустая строка означают «нет».
    if ($script:AutoYes) { Say ($question + ' да (автоматически)'); return $true }
    while ($true) {
        $a = Read-Host ($question + ' Введите «да» или «нет»')
        if ($null -eq $a) { return $false }
        $a = $a.Trim().Trim('«', '»', '"', '.', '!').ToLowerInvariant()
        if ($a -eq 'да') { Write-Log ($question + ' -> да'); return $true }
        if ($strict) { Write-Log ($question + ' -> нет (ответ: ' + $a + ')'); return $false }
        if ($a -eq 'д' -or $a -eq 'yes' -or $a -eq 'y') { Write-Log ($question + ' -> да'); return $true }
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
# Строка, которую нельзя записать как есть (нужна замена знаков)
$script:JsonNeedRx = New-Object regex('["\\\x00-\x1f' + [char]0x2028 + [char]0x2029 + '<>&]')
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
        if (-not ($v -is [System.Collections.Specialized.OrderedDictionary])) {
            # Порядок ключей постоянный, чтобы файлы и запросы не менялись от запуска к запуску
            $keys = [string[]]$keys
            [Array]::Sort($keys, [StringComparer]::Ordinal)
        }
        $first = $true
        foreach ($k in $keys) {
            if ($first) { $first = $false } else { [void]$sb.Append(',') }
            $ks = [string]$k
            if ($script:JsonNeedRx.IsMatch($ks)) { Add-JsonString $sb $ks } else { [void]$sb.Append('"').Append($ks).Append('"') }
            [void]$sb.Append(':')
            # Простые значения пишутся сразу: на десятках тысяч записей это в разы быстрее вызова функции
            $x = $v[$k]
            if ($null -eq $x) { [void]$sb.Append('null') }
            elseif ($x -is [string]) {
                if ($script:JsonNeedRx.IsMatch($x)) { Add-JsonString $sb $x } else { [void]$sb.Append('"').Append($x).Append('"') }
            }
            elseif ($x -is [bool]) { if ($x) { [void]$sb.Append('true') } else { [void]$sb.Append('false') } }
            elseif ($x -is [int] -or $x -is [long]) { [void]$sb.Append($x.ToString($script:Inv)) }
            else { Add-JsonValue $sb $x }
        }
        [void]$sb.Append('}')
        return
    }
    if ($v -is [System.Collections.IEnumerable]) {
        [void]$sb.Append('[')
        $first = $true
        foreach ($x in $v) {
            if ($first) { $first = $false } else { [void]$sb.Append(',') }
            if ($x -is [string]) {
                if ($script:JsonNeedRx.IsMatch($x)) { Add-JsonString $sb $x } else { [void]$sb.Append('"').Append($x).Append('"') }
            }
            else { Add-JsonValue $sb $x }
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
    # Переводит разобранный JSON в хеш-таблицы и массивы.
    # Строки, числа и логические значения переносятся без вызова функции (так быстрее).
    if ($null -eq $o) { return $null }
    if ($o -is [string]) { return $o }
    if ($o -is [datetime]) { return $o.ToString('yyyy-MM-dd HH:mm:ss', $script:Inv) }
    if ($o -is [ValueType]) { return $o }
    if ($o -is [System.Collections.IDictionary]) {
        $h = @{}
        foreach ($k in @($o.Keys)) {
            $x = $o[$k]
            if ($null -eq $x -or $x -is [string] -or ($x -is [ValueType] -and -not ($x -is [datetime]))) { $h[[string]$k] = $x }
            else { $h[[string]$k] = ConvertTo-Hash $x }
        }
        return $h
    }
    if ($o -is [System.Collections.IEnumerable]) {
        $l = New-Object System.Collections.ArrayList
        foreach ($x in $o) {
            if ($null -eq $x -or $x -is [string] -or ($x -is [ValueType] -and -not ($x -is [datetime]))) { [void]$l.Add($x) }
            else { [void]$l.Add((ConvertTo-Hash $x)) }
        }
        return ,($l.ToArray())
    }
    if ($o -is [System.Management.Automation.PSCustomObject]) {
        $h = @{}
        foreach ($p in $o.PSObject.Properties) {
            $x = $p.Value
            if ($null -eq $x -or $x -is [string] -or ($x -is [ValueType] -and -not ($x -is [datetime]))) { $h[$p.Name] = $x }
            else { $h[$p.Name] = ConvertTo-Hash $x }
        }
        return $h
    }
    return $o
}

# Разбор JSON. В Windows PowerShell 5.1 используется встроенный в .NET разборщик без ограничения
# длины текста: команда ConvertFrom-Json там не читает JSON длиннее двух миллионов знаков и работает медленнее.
$script:JsonSer = $null
$script:JsonSerTried = $false
function Get-JsonSerializer {
    if (-not $script:JsonSerTried) {
        $script:JsonSerTried = $true
        if ($PSVersionTable.PSVersion.Major -le 5) {
            try {
                Add-Type -AssemblyName System.Web.Extensions
                $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
                $ser.MaxJsonLength = [int]::MaxValue
                $ser.RecursionLimit = 64
                [void]$ser.DeserializeObject('{"a":[1,"b"]}')
                $script:JsonSer = $ser
            } catch { $script:JsonSer = $null }
        }
    }
    return $script:JsonSer
}
function ConvertFrom-JsonText([string]$text) {
    if (-not $text) { return $null }
    $ser = Get-JsonSerializer
    if ($ser) { return (ConvertTo-Hash ($ser.DeserializeObject($text))) }
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
