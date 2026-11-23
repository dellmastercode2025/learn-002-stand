# =====================================================================
#  Рабочая папка, база файлов, кэш ответов Claude и журнал операций
# =====================================================================

function Get-DesktopPath {
    # Путь к рабочему столу берётся системным вызовом: он может быть перенаправлен на сетевой диск
    $p = ''
    try { $p = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory) } catch { }
    if (-not $p) { throw 'Windows не сообщила путь к рабочему столу.' }
    return $p
}

function Get-ServicePath([string]$key) {
    return [IO.Path]::Combine($script:ServiceDir, $script:FileNames[$key])
}

function Initialize-Workspace([string]$rootOverride) {
    $test = ''
    if ($rootOverride) { $test = $rootOverride }
    elseif (Get-Opt 'ТестоваяПапка') { $test = Get-Opt 'ТестоваяПапка' }
    if ($test) {
        if (-not [IO.Directory]::Exists($test)) { throw "Тестовая папка не найдена: $test" }
        $script:Root = ([IO.DirectoryInfo]$test).FullName
        $script:IsTestRoot = $true
    } else {
        $script:Root = Get-DesktopPath
        $script:IsTestRoot = $false
    }
    $script:Root = $script:Root.TrimEnd('\', '/')
    if (-not [IO.Directory]::Exists($script:Root)) { throw "Папка не найдена: $($script:Root)" }
    if ($script:Root.Length -lt 4) { throw "Нельзя разбирать корень диска: $($script:Root)" }

    $script:ServiceDir = [IO.Path]::Combine($script:Root, $script:ServiceName)
    if (-not [IO.Directory]::Exists($script:ServiceDir)) { [void][IO.Directory]::CreateDirectory($script:ServiceDir) }
    $script:LogPath = Get-ServicePath 'Log'

    # Папка программы, если она лежит внутри разбираемой папки, не сканируется
    $script:ProgramRel = ''
    $pd = $script:ProgramDir.TrimEnd('\', '/')
    if ($pd.Length -gt $script:Root.Length -and $pd.StartsWith($script:Root + $script:DS, [StringComparison]::OrdinalIgnoreCase)) {
        $script:ProgramRel = Get-RelPath $pd $script:Root
    }
    $script:CatalogName = ConvertTo-SafeName (Get-Opt 'ИмяКаталога')
    if (-not $script:CatalogName) { $script:CatalogName = 'Каталог рабочего стола.html' }
}

# ---------------------------------------------------------------------
#  Защита от двух запусков одновременно
# ---------------------------------------------------------------------
$script:LockStream = $null
function Enter-RunLock {
    $p = Get-ServicePath 'Lock'
    try {
        $script:LockStream = New-Object IO.FileStream($p, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch {
        throw 'Программа уже запущена в другом окне. Закройте его и повторите.'
    }
}
function Exit-RunLock {
    if ($script:LockStream) { try { $script:LockStream.Dispose() } catch { }; $script:LockStream = $null }
}

# ---------------------------------------------------------------------
#  База файлов
# ---------------------------------------------------------------------
function New-FileId { return ('f' + [Guid]::NewGuid().ToString('N').Substring(0, 11)) }

function New-Record {
    return @{
        id = (New-FileId); rel = ''; name = ''; ext = ''; size = [long]0; mtime = ''; ctime = ''; hash = ''
        origName = ''; origRel = ''; firstSeen = (Get-NowText)
        status = 'new'      # new | placed | dsp | protected | corrupt | locked | unit | attached
        placed = $false; placedBy = ''; reason = ''
        nameBase = ''       # название без даты, которое присвоила программа
        home = ''           # папка, в которую файл был разложен
        unit = ''; unitMain = $false; attachedTo = ''
        dupOf = ''; missing = $false; changed = $false; hashError = ''
        an = $null          # результат анализа
        processedAt = ''
    }
}

function Read-Db {
    $script:Db = @{ Records = @{}; ByRel = (New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::OrdinalIgnoreCase)) }
    $p = Get-ServicePath 'Db'
    if (-not [IO.File]::Exists($p)) { return }
    $lineNo = 0
    foreach ($line in [IO.File]::ReadAllLines($p, [Text.Encoding]::UTF8)) {
        $lineNo++
        if (-not $line.Trim()) { continue }
        try {
            $h = ConvertFrom-JsonText $line
            $rec = New-Record
            foreach ($k in @($h.Keys)) { $rec[$k] = $h[$k] }
            $rec.size = [long]$rec.size
            $script:Db.Records[$rec.id] = $rec
        } catch { Write-Log "База: строка $lineNo не прочитана: $(Get-ErrText $_)" }
    }
    Update-DbIndex
}

function Update-DbIndex {
    $script:Db.ByRel.Clear()
    foreach ($rec in $script:Db.Records.Values) {
        if (-not $rec.missing -and $rec.rel) { $script:Db.ByRel[$rec.rel] = $rec.id }
    }
}

function Save-Db {
    $sb = New-Object System.Text.StringBuilder
    foreach ($id in @($script:Db.Records.Keys | Sort-Object)) {
        Add-JsonValue $sb $script:Db.Records[$id]
        [void]$sb.Append("`n")
    }
    Write-TextFile (Get-ServicePath 'Db') $sb.ToString() $script:Utf8NoBom
}

function Read-Meta {
    $script:Meta = @{ structureReady = $false; settingsFp = '' }
    $p = Get-ServicePath 'Meta'
    if ([IO.File]::Exists($p)) {
        try { $h = ConvertFrom-JsonText (Read-TextFile $p); foreach ($k in @($h.Keys)) { $script:Meta[$k] = $h[$k] } } catch { }
    }
}
function Save-Meta { Write-TextFile (Get-ServicePath 'Meta') (ConvertTo-JsonText $script:Meta) $script:Utf8NoBom }

# ---------------------------------------------------------------------
#  Кэш ответов Claude: один и тот же файл повторно не отправляется
# ---------------------------------------------------------------------
function Read-ApiCache {
    $script:ApiCache = @{}
    $p = Get-ServicePath 'Cache'
    if (-not [IO.File]::Exists($p)) { return }
    foreach ($line in [IO.File]::ReadAllLines($p, [Text.Encoding]::UTF8)) {
        if (-not $line.Trim()) { continue }
        try {
            $h = ConvertFrom-JsonText $line
            $script:ApiCache[($h.hash + '|' + $h.fp)] = $h.an
        } catch { }
    }
}
function Add-ApiCache([string]$hash, [string]$fp, $an) {
    $script:ApiCache[($hash + '|' + $fp)] = $an
    $line = (ConvertTo-JsonText ([ordered]@{ hash = $hash; fp = $fp; at = (Get-NowText); an = $an })) + "`n"
    [IO.File]::AppendAllText((Get-ServicePath 'Cache'), $line, $script:Utf8NoBom)
}
function Get-ApiCache([string]$hash, [string]$fp) {
    $k = $hash + '|' + $fp
    if ($script:ApiCache.ContainsKey($k)) { return $script:ApiCache[$k] }
    return $null
}

# ---------------------------------------------------------------------
#  Журнал операций: только дописывается, существующие строки не меняются
# ---------------------------------------------------------------------
$script:JournalHead = @('Запуск', 'Операция', 'Файл', 'Тип операции', 'Исходный путь', 'Новый путь', 'SHA-256', 'Статус', 'Время', 'Причина ошибки', 'Результат отката')
$script:OpSeq = 0

function New-OpId { $script:OpSeq++; return ($script:RunId + '-' + $script:OpSeq.ToString('00000', $script:Inv)) }

function Write-Journal([string]$opId, [string]$fileId, [string]$type, [string]$src, [string]$dst, [string]$hash, [string]$status, [string]$err, [string]$rollback, [string]$runId = '') {
    $p = Get-ServicePath 'Journal'
    if (-not $runId) { $runId = $script:RunId }
    $text = ''
    if (-not [IO.File]::Exists($p)) { $text = (Format-CsvLine $script:JournalHead) + "`r`n" }
    $text += (Format-CsvLine @($runId, $opId, $fileId, $type, $src, $dst, $hash, $status, (Get-NowText), $err, $rollback)) + "`r`n"
    [IO.File]::AppendAllText($p, $text, $script:Utf8Bom)
}

function Read-Journal {
    # Возвращает список строк журнала в виде хеш-таблиц
    $res = New-Object System.Collections.ArrayList
    $p = Get-ServicePath 'Journal'
    if (-not [IO.File]::Exists($p)) { return ,@() }
    $first = $true
    foreach ($line in [IO.File]::ReadAllLines($p, [Text.Encoding]::UTF8)) {
        if ($first) { $first = $false; continue }
        if (-not $line.Trim()) { continue }
        $f = Split-CsvLine $line
        if ($f.Count -lt 9) { continue }
        $rb = ''; if ($f.Count -gt 10) { $rb = $f[10] }
        $er = ''; if ($f.Count -gt 9) { $er = $f[9] }
        [void]$res.Add(@{ Run = $f[0]; Op = $f[1]; File = $f[2]; Type = $f[3]; Src = $f[4]; Dst = $f[5]; Hash = $f[6]; Status = $f[7]; Time = $f[8]; Error = $er; Rollback = $rb })
    }
    return ,($res.ToArray())
}
