# =====================================================================
#  Сканирование: перечень файлов, контрольные суммы, сопоставление с базой
# =====================================================================

$script:DocLikeExt  = @('.docx', '.doc', '.xlsx', '.xls', '.pdf', '.msg', '.pptx', '.ppt', '.rtf')
$script:LauncherExt = @('.bat', '.cmd', '.ps1')
$script:AttrDir      = [IO.FileAttributes]::Directory
$script:AttrHidSys   = ([IO.FileAttributes]::Hidden -bor [IO.FileAttributes]::System)
$script:AttrReparse  = [IO.FileAttributes]::ReparsePoint

function Test-ProgramDir([IO.DirectoryInfo]$di, [int]$depth) {
    # Папка с программой: в ней есть .dll, либо есть .exe и вложенная папка с .dll
    try {
        $hasExe = $false
        foreach ($f in $di.GetFiles()) {
            $e = $f.Extension.ToLowerInvariant()
            if ($e -eq '.dll') { return $true }
            if ($e -eq '.exe') { $hasExe = $true }
        }
        if ($hasExe -and $depth -lt 3) {
            foreach ($sub in $di.GetDirectories()) { if (Test-ProgramDir $sub ($depth + 1)) { return $true } }
        }
    } catch { }
    return $false
}

function Test-ToolCandidate([string]$full) {
    # HTML-инструмент: есть встроенные скрипты и это не сохранённая веб-страница.
    # Возвращает сведения о файле или $null.
    try {
        $info = Get-HtmlInfo $full
        if (-not $info.Saved -and $info.InlineScript -ge 300) { return $info }
    } catch { }
    return $null
}

function Find-ToolFolderMain([IO.DirectoryInfo]$di) {
    # Отдельная папка HTML-инструмента: инструмент вместе с файлом запуска
    # или с соседними файлами, на которые он ссылается. Возвращает имя главного файла или ''.
    try {
        $files = $di.GetFiles()
        $htmls = @($files | Where-Object { $script:ExtHtml -contains $_.Extension.ToLowerInvariant() })
        if ($htmls.Count -eq 0) { return '' }
        $docs = @($files | Where-Object { $script:DocLikeExt -contains $_.Extension.ToLowerInvariant() })
        if ($docs.Count -gt 5) { return '' }
        $launchers = @($files | Where-Object { $script:LauncherExt -contains $_.Extension.ToLowerInvariant() })
        foreach ($h in ($htmls | Sort-Object Length -Descending)) {
            $info = Test-ToolCandidate $h.FullName
            if (-not $info) { continue }
            foreach ($l in $launchers) {
                try {
                    $t = Read-TextHead $l.FullName 20000
                    if ($t.IndexOf($h.Name, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $h.Name }
                } catch { }
            }
            foreach ($ref in $info.Refs) {
                $r = $ref.Replace('/', [string]$script:DS).TrimStart('.', [char]$script:DS)
                if (-not $r -or $r.Contains('..')) { continue }
                $p = [IO.Path]::Combine($di.FullName, $r)
                try { if ([IO.File]::Exists($p) -or [IO.Directory]::Exists($p)) { return $h.Name } } catch { }
            }
        }
    } catch { }
    return ''
}

function Add-ScanFile($fi, [string]$rel, [string]$unit, [bool]$unitMain) {
    [void]$script:Scan.Files.Add(@{
        Rel = $rel; Full = $fi.FullName; Name = $fi.Name; Ext = $fi.Extension.ToLowerInvariant()
        Size = [long]$fi.Length
        MTime = (ConvertTo-TicksText $fi.LastWriteTimeUtc); CTime = (ConvertTo-TicksText $fi.CreationTimeUtc)
        Unit = $unit; UnitMain = $unitMain; AttachedTo = ''
        Hash = ''; RecId = ''; NeedHash = $false; HashError = ''
    })
    $n = $script:Scan.Files.Count
    if ($n % 250 -eq 0) { Show-Status "Сканирование: найдено файлов $n" }
}

function Scan-Dir([string]$full, [string]$rel, [string]$unit) {
    $infos = $null
    try { $infos = (New-Object IO.DirectoryInfo($full)).GetFileSystemInfos() }
    catch {
        [void]$script:Scan.Skipped.Add(@{ Rel = $rel; Reason = ('папка недоступна: ' + (Get-ErrText $_)) })
        return
    }
    if ($rel) { [void]$script:Scan.Dirs.Add($rel) }
    $files = New-Object System.Collections.ArrayList
    $dirs = New-Object System.Collections.ArrayList
    foreach ($i in $infos) {
        if (($i.Attributes -band $script:AttrDir) -ne 0) { [void]$dirs.Add($i) } else { [void]$files.Add($i) }
    }
    $inTools = $false
    if (-not $unit -and $rel) {
        foreach ($tp in $script:ToolFolders) { if ([string]::Equals($rel, $tp, [StringComparison]::OrdinalIgnoreCase)) { $inTools = $true } }
    }

    # Имена HTML-файлов в этой папке (для поиска сохранённых страниц с папкой «…_files»)
    $htmlNames = @{}
    foreach ($f in $files) {
        if ($script:ExtHtml -contains $f.Extension.ToLowerInvariant()) { $htmlNames[(Get-NameNoExt $f.Name).ToLowerInvariant()] = $f.Name }
    }
    $pageDirs = @{}   # имя папки-спутника -> имя HTML-файла
    foreach ($d in $dirs) {
        $dn = $d.Name
        foreach ($suffix in @('_files', '.files', '_файлы')) {
            if ($dn.EndsWith($suffix, [StringComparison]::OrdinalIgnoreCase)) {
                $base = $dn.Substring(0, $dn.Length - $suffix.Length).ToLowerInvariant()
                if ($htmlNames.ContainsKey($base)) { $pageDirs[$dn] = $htmlNames[$base] }
            }
        }
    }
    $pageHtml = @{}
    foreach ($k in @($pageDirs.Keys)) { $pageHtml[$pageDirs[$k]] = $k }

    # --- Файлы
    $launchers = New-Object System.Collections.ArrayList
    $toolHtml = New-Object System.Collections.ArrayList
    foreach ($f in $files) {
        $name = $f.Name
        $frel = Join-RelParts $rel $name
        if (($f.Attributes -band $script:AttrHidSys) -ne 0) { continue }
        if ($unit) { Add-ScanFile $f $frel $unit $false; continue }
        $ext = $f.Extension.ToLowerInvariant()
        if ($ext -eq '.lnk' -or $ext -eq '.url') { continue }
        if ($name.StartsWith('~$')) { continue }
        if (-not $rel -and [string]::Equals($name, $script:CatalogName, [StringComparison]::OrdinalIgnoreCase)) { continue }
        if ($inTools -and [string]::Equals($name, $script:FileNames.ToolsDoc, [StringComparison]::OrdinalIgnoreCase)) { continue }
        if (Test-Excluded $frel $false) { $script:Scan.ExcludedFiles++; continue }
        Add-ScanFile $f $frel '' $false
        $entry = $script:Scan.Files[$script:Scan.Files.Count - 1]
        if ($pageHtml.ContainsKey($name)) {
            # Сохранённая веб-страница со своей папкой: переносится вместе с ней и не переименовывается
            $entry.Unit = $frel; $entry.UnitMain = $true
            [void]$script:Scan.Units.Add(@{ Kind = 'page'; Rel = $frel; Main = $frel; Folder = (Join-RelParts $rel $pageHtml[$name]) })
        }
        elseif ($script:LauncherExt -contains $ext) { [void]$launchers.Add($entry) }
        elseif ($script:ExtHtml -contains $ext) { [void]$toolHtml.Add($entry) }
    }
    # Файлы запуска, которые ссылаются на HTML-инструмент в той же папке, переносятся вместе с ним
    if ($launchers.Count -gt 0 -and $toolHtml.Count -gt 0) {
        $cands = @($toolHtml | Where-Object { $inTools -or (Test-ToolCandidate $_.Full) })
        foreach ($l in $launchers) {
            $text = ''
            try { $text = Read-TextHead $l.Full 20000 } catch { }
            foreach ($h in $cands) {
                if ($text -and $text.IndexOf($h.Name, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $l.AttachedTo = $h.Rel; break }
            }
        }
    }

    # --- Папки
    foreach ($d in $dirs) {
        $dn = $d.Name
        $drel = Join-RelParts $rel $dn
        if ($unit) { Scan-Dir $d.FullName $drel $unit; continue }
        if (-not $rel -and [string]::Equals($dn, $script:ServiceName, [StringComparison]::OrdinalIgnoreCase)) { continue }
        if ($script:ProgramRel -and [string]::Equals($drel, $script:ProgramRel, [StringComparison]::OrdinalIgnoreCase)) { continue }
        if (($d.Attributes -band $script:AttrHidSys) -ne 0) { continue }
        if (Test-Excluded $drel $true) { [void]$script:Scan.Excluded.Add($drel); continue }
        if (($d.Attributes -band $script:AttrReparse) -ne 0) {
            [void]$script:Scan.Skipped.Add(@{ Rel = $drel; Reason = 'ссылка на другую папку, не разбирается' }); continue
        }
        if ($pageDirs.ContainsKey($dn)) {
            # Папка-спутник сохранённой страницы
            Scan-Dir $d.FullName $drel (Join-RelParts $rel $pageDirs[$dn])
            continue
        }
        if ($inTools) {
            # Папка инструмента, уже лежащая в папке инструментов
            [void]$script:Scan.Units.Add(@{ Kind = 'tool'; Rel = $drel; Main = ''; Folder = $drel; Placed = $true })
            Scan-Dir $d.FullName $drel $drel
            continue
        }
        if ([IO.Directory]::Exists([IO.Path]::Combine($d.FullName, '.git'))) {
            [void]$script:Scan.Skipped.Add(@{ Rel = $drel; Reason = 'папка с репозиторием (.git), не разбирается' }); continue
        }
        if (Test-ProgramDir $d 0) {
            [void]$script:Scan.Skipped.Add(@{ Rel = $drel; Reason = 'папка с программой (внутри есть .dll), не разбирается' }); continue
        }
        if (-not (Test-InStructure $drel)) {
            $main = Find-ToolFolderMain $d
            if ($main) {
                $mainRel = Join-RelParts $drel $main
                [void]$script:Scan.Units.Add(@{ Kind = 'tool'; Rel = $drel; Main = $mainRel; Folder = $drel; Placed = $false })
                $before = $script:Scan.Files.Count
                Scan-Dir $d.FullName $drel $drel
                for ($k = $before; $k -lt $script:Scan.Files.Count; $k++) {
                    if ([string]::Equals($script:Scan.Files[$k].Rel, $mainRel, [StringComparison]::OrdinalIgnoreCase)) { $script:Scan.Files[$k].UnitMain = $true }
                }
                continue
            }
        }
        Scan-Dir $d.FullName $drel ''
    }
}

function Invoke-Scan {
    Say 'Шаг 1. Сканирование папок…'
    $script:Scan = @{
        Files = (New-Object System.Collections.ArrayList); Units = (New-Object System.Collections.ArrayList)
        Skipped = (New-Object System.Collections.ArrayList); Excluded = (New-Object System.Collections.ArrayList)
        Dirs = (New-Object System.Collections.ArrayList); ExcludedFiles = 0
    }
    # Папки инструментов из структуры: их вложенные папки переносятся и хранятся целиком
    $script:ToolFolders = @($script:Cfg.Folders | Where-Object { $_.Path -match '(?i)инструмент' -and $_.Path -notmatch '\{' } | ForEach-Object { $_.Path })
    Scan-Dir $script:Root '' ''
    Clear-Status
    $total = [long]0
    foreach ($f in $script:Scan.Files) { $total += $f.Size }
    Say ("  Найдено файлов: {0}, общий объём {1}." -f $script:Scan.Files.Count, (Format-Size $total))
    if ($script:Scan.Skipped.Count -gt 0) { Say ("  Папок, которые не разбираются: {0} (список будет в плане)." -f $script:Scan.Skipped.Count) }
    if ($script:Scan.Excluded.Count -gt 0 -or $script:Scan.ExcludedFiles -gt 0) { Say ("  По списку исключений пропущено папок: {0}, файлов: {1}." -f $script:Scan.Excluded.Count, $script:Scan.ExcludedFiles) }
}

function Sync-Scan {
    # Сопоставляет найденные файлы с базой: сначала по пути, затем по контрольной сумме
    $always = Get-OptBool 'ПересчитыватьХешВсегда'
    $newInside = Get-OptBool 'РазбиратьНовыеФайлыВнутриСтруктуры'
    $seen = @{}
    $toHash = New-Object System.Collections.ArrayList
    foreach ($f in $script:Scan.Files) {
        $rec = $null
        if ($script:Db.ByRel.ContainsKey($f.Rel)) { $rec = $script:Db.Records[$script:Db.ByRel[$f.Rel]] }
        if ($rec -and -not $seen.ContainsKey($rec.id)) {
            $seen[$rec.id] = $true
            $f.RecId = $rec.id
            if (-not $always -and $rec.hash -and $rec.size -eq $f.Size -and $rec.mtime -eq $f.MTime) { $f.Hash = $rec.hash }
            else { $f.NeedHash = $true; [void]$toHash.Add($f) }
        } else { $f.NeedHash = $true; [void]$toHash.Add($f) }
    }

    if ($toHash.Count -gt 0) {
        $bytes = [long]0
        foreach ($f in $toHash) { $bytes += $f.Size }
        Say ("Шаг 2. Контрольные суммы: {0} файлов, {1}…" -f $toHash.Count, (Format-Size $bytes))
        $done = [long]0; $n = 0
        $sw = [Diagnostics.Stopwatch]::StartNew()
        foreach ($f in $toHash) {
            $n++
            try { $f.Hash = Get-FileSha256 $f.Full }
            catch {
                $f.Hash = ''
                if (Test-FileBusy $_) { $f.HashError = 'файл занят другой программой' } else { $f.HashError = 'файл не читается: ' + (Get-ErrText $_) }
            }
            $done += $f.Size
            if ($sw.ElapsedMilliseconds -gt 700) {
                $pct = 100; if ($bytes -gt 0) { $pct = [int](100 * $done / $bytes) }
                Show-Status ("  {0} из {1} файлов, {2}%" -f $n, $toHash.Count, $pct)
                $sw.Restart()
            }
        }
        Clear-Status
    } else { Say 'Шаг 2. Контрольные суммы: изменений нет, пересчёт не нужен.' }

    # Записи базы, чьих файлов на прежнем месте нет: кандидаты на «переехал»
    $orphans = @{}
    foreach ($rec in $script:Db.Records.Values) {
        if ($seen.ContainsKey($rec.id) -or -not $rec.hash) { continue }
        if (-not $orphans.ContainsKey($rec.hash)) { $orphans[$rec.hash] = New-Object System.Collections.Queue }
        $orphans[$rec.hash].Enqueue($rec.id)
    }

    $stats = @{ New = 0; Moved = 0; Changed = 0; Same = 0 }
    foreach ($f in $script:Scan.Files) {
        $rec = $null
        $moved = $false
        if ($f.RecId) { $rec = $script:Db.Records[$f.RecId] }
        elseif ($f.Hash -and $orphans.ContainsKey($f.Hash) -and $orphans[$f.Hash].Count -gt 0) {
            $rec = $script:Db.Records[$orphans[$f.Hash].Dequeue()]
            $seen[$rec.id] = $true
            $moved = $true
        }
        $isNew = $false
        if (-not $rec) {
            $rec = New-Record
            $rec.origName = $f.Name; $rec.origRel = $f.Rel
            $script:Db.Records[$rec.id] = $rec
            $seen[$rec.id] = $true
            $isNew = $true
            $stats.New++
        }
        $dir = Get-RelParent $f.Rel
        $inStruct = Test-InStructure $dir
        $inReview = Test-RelUnder $dir $script:Cfg.ReviewFolder
        if ($isNew) {
            if ($script:Meta.structureReady -and $inStruct -and -not $inReview -and -not $newInside -and -not $f.Unit) {
                # Новый файл, который пользователь сам положил в папку структуры
                $rec.placed = $true; $rec.placedBy = 'пользователь'; $rec.status = 'placed'; $rec.home = $dir
            }
        } elseif ($moved) {
            $stats.Moved++
            if ($inStruct -and -not $inReview) { $rec.placed = $true; $rec.placedBy = 'пользователь'; $rec.status = 'placed'; $rec.home = $dir }
            else { $rec.placed = $false }
        } else {
            if ($f.Hash -and $rec.hash -and $f.Hash -ne $rec.hash) { $rec.changed = $true; $stats.Changed++ } else { $stats.Same++ }
        }
        $rec.rel = $f.Rel; $rec.name = $f.Name; $rec.ext = $f.Ext; $rec.size = $f.Size
        $rec.mtime = $f.MTime; $rec.ctime = $f.CTime
        if ($f.Hash) { $rec.hash = $f.Hash }
        $rec.missing = $false
        $rec.unit = $f.Unit; $rec.unitMain = [bool]$f.UnitMain; $rec.attachedTo = $f.AttachedTo
        $rec.hashError = $f.HashError
        $f.RecId = $rec.id
    }
    foreach ($rec in $script:Db.Records.Values) { if (-not $seen.ContainsKey($rec.id)) { $rec.missing = $true } }

    # Дубликаты по контрольной сумме
    $groups = @{}
    foreach ($rec in $script:Db.Records.Values) {
        $rec.dupOf = ''
        if ($rec.missing -or -not $rec.hash -or ($rec.unit -and -not $rec.unitMain)) { continue }
        if (-not $groups.ContainsKey($rec.hash)) { $groups[$rec.hash] = New-Object System.Collections.ArrayList }
        [void]$groups[$rec.hash].Add($rec)
    }
    $dups = 0
    foreach ($g in $groups.Values) {
        if ($g.Count -lt 2) { continue }
        $sorted = @($g | Sort-Object { $_.rel })
        for ($i = 1; $i -lt $sorted.Count; $i++) { $sorted[$i].dupOf = $sorted[0].id; $dups++ }
    }
    Update-DbIndex
    Say ("  Новых файлов: {0}, перемещённых вручную: {1}, изменённых: {2}, без изменений: {3}, дубликатов: {4}." -f $stats.New, $stats.Moved, $stats.Changed, $stats.Same, $dups)
}
