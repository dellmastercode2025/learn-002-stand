# =====================================================================
#  Выполнение плана, журнал операций и откат (раздел 10 ТЗ).
#  Программа не удаляет и не перезаписывает файлы пользователя.
# =====================================================================

$script:OpMoveFile   = 'Перемещение файла'
$script:OpRenameFile = 'Переименование файла'
$script:OpMoveDir    = 'Перемещение папки'
$script:OpMakeDir    = 'Создание папки'
$script:OpDropDir    = 'Удаление папки'

function Get-FreeTarget([string]$dstFull) {
    # Если файл с таким именем уже есть, добавляет номер в скобках. Существующие файлы не перезаписываются.
    if (-not [IO.File]::Exists($dstFull) -and -not [IO.Directory]::Exists($dstFull)) { return $dstFull }
    $dir = [IO.Path]::GetDirectoryName($dstFull)
    $name = [IO.Path]::GetFileName($dstFull)
    $ext = Get-ExtRaw $name
    $stem = $name.Substring(0, $name.Length - $ext.Length)
    $date = ''
    $m = [regex]::Match($stem, '^(.*\S)(\s+\d{2}-\d{2}-\d{4})$')
    if ($m.Success) { $stem = $m.Groups[1].Value; $date = $m.Groups[2].Value }
    for ($n = 2; $n -lt 1000; $n++) {
        $p = [IO.Path]::Combine($dir, ("$stem ($n)$date$ext"))
        if (-not [IO.File]::Exists($p) -and -not [IO.Directory]::Exists($p)) { return $p }
    }
    throw 'не удалось подобрать свободное имя'
}

function Test-MovedFile([string]$path, [long]$size, [string]$mtime, [string]$hash) {
    # Сверка после перемещения: размер, дата изменения и контрольная сумма. Возвращает '' или причину.
    $fi = New-Object IO.FileInfo($path)
    if (-not $fi.Exists) { return 'файл не найден на новом месте' }
    if ($fi.Length -ne $size) { return 'размер файла изменился' }
    if ($mtime -and (ConvertTo-TicksText $fi.LastWriteTimeUtc) -ne $mtime) {
        try { [IO.File]::SetLastWriteTimeUtc($path, (ConvertFrom-TicksText $mtime)) } catch { }
        $fi.Refresh()
        if ((ConvertTo-TicksText $fi.LastWriteTimeUtc) -ne $mtime) { return 'дата изменения файла не сохранилась' }
    }
    if ($hash) {
        $h = Get-FileSha256 $path
        if ($h -ne $hash) { return 'контрольная сумма файла изменилась' }
    }
    return ''
}

function New-Dirs([string[]]$relDirs) {
    # Создаёт недостающие папки, каждую записывает в журнал
    $set = New-Object 'System.Collections.Generic.SortedSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($d in $relDirs) { $p = $d; while ($p) { [void]$set.Add($p); $p = Get-RelParent $p } }
    $made = 0
    foreach ($rel in @($set | Sort-Object { ($_ -split '\\').Count }, { $_ })) {
        $full = Join-Rel $script:Root $rel
        if ([IO.Directory]::Exists($full)) { continue }
        $op = New-OpId
        Write-Journal $op '' $script:OpMakeDir '' $full '' 'Начато' '' ''
        try {
            [void][IO.Directory]::CreateDirectory($full)
            Write-Journal $op '' $script:OpMakeDir '' $full '' 'Выполнено' '' ''
            $made++
        } catch {
            Write-Journal $op '' $script:OpMakeDir '' $full '' 'Ошибка' (Get-ErrText $_) ''
            Fail "Не удалось создать папку «$rel»: $(Get-ErrText $_)"
        }
    }
    return $made
}

function Remove-EmptyDirs {
    # Папки вне целевой структуры, оставшиеся полностью пустыми, удаляются с записью в журнал
    $removed = 0
    $stack = New-Object System.Collections.Stack
    $all = New-Object System.Collections.ArrayList
    $stack.Push('')
    while ($stack.Count -gt 0) {
        $rel = [string]$stack.Pop()
        $full = Join-Rel $script:Root $rel
        $subs = @()
        try { $subs = @((New-Object IO.DirectoryInfo($full)).GetDirectories()) } catch { continue }
        foreach ($d in $subs) {
            $drel = Join-RelParts $rel $d.Name
            if (-not $rel -and [string]::Equals($d.Name, $script:ServiceName, [StringComparison]::OrdinalIgnoreCase)) { continue }
            if ($script:ProgramRel -and [string]::Equals($drel, $script:ProgramRel, [StringComparison]::OrdinalIgnoreCase)) { continue }
            if (($d.Attributes -band $script:AttrReparse) -ne 0) { continue }
            if (($d.Attributes -band $script:AttrHidSys) -ne 0) { continue }
            if (Test-Excluded $drel $true) { continue }
            [void]$all.Add($drel)
            $stack.Push($drel)
        }
    }
    foreach ($rel in @($all | Sort-Object { ($_ -split '\\').Count } -Descending)) {
        if (Test-InStructure $rel) { continue }
        $full = Join-Rel $script:Root $rel
        try {
            if (-not [IO.Directory]::Exists($full)) { continue }
            if (@([IO.Directory]::GetFileSystemEntries($full)).Count -gt 0) { continue }
        } catch { continue }
        $op = New-OpId
        Write-Journal $op '' $script:OpDropDir $full '' '' 'Начато' '' ''
        try {
            [IO.Directory]::Delete($full, $false)
            Write-Journal $op '' $script:OpDropDir $full '' '' 'Выполнено' '' ''
            $removed++
        } catch { Write-Journal $op '' $script:OpDropDir $full '' '' 'Ошибка' (Get-ErrText $_) '' }
    }
    return $removed
}

function Invoke-Apply($rows) {
    # Выполняет план. Возвращает @{ Moved; Renamed; Errors (список строк); Dirs; Removed }
    $res = @{ Moved = 0; Renamed = 0; Skipped = 0; Errors = (New-Object System.Collections.ArrayList); Dirs = 0; Removed = 0 }
    $todo = @($rows | Where-Object { $_.action -ne 'нет' })

    # --- Папки
    $dirs = New-Object System.Collections.ArrayList
    if (Get-OptBool 'СоздаватьВсюСтруктуру') { foreach ($d in (Get-StructureDirs)) { [void]$dirs.Add($d) } }
    foreach ($r in $todo) { if ($r.dstDir) { [void]$dirs.Add([string]$r.dstDir) } }
    $res.Dirs = New-Dirs ([string[]]$dirs.ToArray())

    # --- Все операции сначала записываются как запланированные
    $ops = New-Object System.Collections.ArrayList
    foreach ($r in $todo) {
        $type = $script:OpMoveFile
        if ($r.action -eq 'переименование') { $type = $script:OpRenameFile }
        $src = Join-Rel $script:Root ([string]$r.src)
        $dst = Join-Rel $script:Root (Join-RelParts ([string]$r.dstDir) ([string]$r.dstName))
        if ($r.kind -eq 'unit') {
            $type = $script:OpMoveDir
            $src = Join-Rel $script:Root ([string]$r.unitSrc)
            $dst = Join-Rel $script:Root ([string]$r.unitDst)
        }
        $op = @{ Id = (New-OpId); Type = $type; Src = $src; Dst = $dst; Row = $r }
        [void]$ops.Add($op)
        Write-Journal $op.Id ([string]$r.id) $type $src $dst ([string]$r.hash) 'Запланировано' '' ''
    }

    $n = 0
    $lastSave = Get-Date
    try {
    foreach ($op in $ops) {
        $n++
        if ($n % 20 -eq 0) { Show-Status ("  Выполнено операций: {0} из {1}" -f $n, $ops.Count) }
        $r = $op.Row
        $id = [string]$r.id
        $rec = $null
        if ($script:Db.Records.ContainsKey($id)) { $rec = $script:Db.Records[$id] }
        $err = ''
        $started = $false
        try {
            if (-not $rec -or $rec.missing) { throw 'файла нет в базе, составьте план заново' }
            if (-not [string]::Equals($rec.rel, [string]$r.src, [StringComparison]::OrdinalIgnoreCase)) { throw 'файл перемещён после составления плана, составьте план заново' }
            if ($rec.status -eq 'dsp') { throw 'документ ДСП не перемещается' }

            if ($op.Type -eq $script:OpMoveDir) {
                if (-not [IO.Directory]::Exists($op.Src)) { throw 'папка не найдена' }
                if ([IO.Directory]::Exists($op.Dst) -or [IO.File]::Exists($op.Dst)) { throw 'в папке назначения уже есть папка с таким именем' }
                Write-Journal $op.Id $id $op.Type $op.Src $op.Dst '' 'Начато' '' ''
                $started = $true
                [IO.Directory]::Move($op.Src, $op.Dst)
                # Сверка всех файлов папки
                $unitSrc = [string]$r.unitSrc; $unitDst = [string]$r.unitDst
                $bad = ''
                $members = @($script:Db.Records.Values | Where-Object { -not $_.missing -and (Test-RelUnder $_.rel $unitSrc) })
                foreach ($m in $members) {
                    $newRel = Join-RelParts $unitDst $m.rel.Substring($unitSrc.Length).TrimStart('\')
                    $why = Test-MovedFile (Join-Rel $script:Root $newRel) $m.size $m.mtime $m.hash
                    if ($why) { $bad = "$($m.name): $why"; break }
                }
                if ($bad) {
                    try { [IO.Directory]::Move($op.Dst, $op.Src) } catch { }
                    throw "после переноса папки не сошлась проверка ($bad), папка возвращена на место"
                }
                foreach ($m in $members) {
                    $m.rel = Join-RelParts $unitDst $m.rel.Substring($unitSrc.Length).TrimStart('\')
                    $m.unit = $unitDst; $m.placed = $true; $m.placedBy = 'программа'; $m.home = (Get-RelParent $m.rel)
                    if ($m.status -ne 'unit') { $m.status = 'placed' }
                }
                Write-Journal $op.Id $id $op.Type $op.Src $op.Dst '' 'Выполнено' '' ''
                $res.Moved++
                continue
            }

            $fi = New-Object IO.FileInfo($op.Src)
            if (-not $fi.Exists) { throw 'файл не найден' }
            if ($fi.Length -ne [long]$r.size -or (ConvertTo-TicksText $fi.LastWriteTimeUtc) -ne [string]$r.mtime) { throw 'файл изменён после составления плана, составьте план заново' }
            $dst = $op.Dst
            $sameFile = [string]::Equals($op.Src, $dst, [StringComparison]::OrdinalIgnoreCase)
            if (-not $sameFile) { $dst = Get-FreeTarget $dst }
            if ($r.kind -eq 'page' -and $dst -ne $op.Dst) { throw 'в папке назначения уже есть страница с таким именем' }
            Write-Journal $op.Id $id $op.Type $op.Src $dst ([string]$r.hash) 'Начато' '' ''
            $started = $true
            [IO.File]::Move($op.Src, $dst)
            $why = Test-MovedFile $dst ([long]$r.size) ([string]$r.mtime) ([string]$r.hash)
            if ($why) {
                try { [IO.File]::Move($dst, $op.Src) } catch { }
                throw "$why, файл возвращён на место"
            }
            $op.Dst = $dst

            # Папка-спутник сохранённой веб-страницы едет следом
            if ($r.kind -eq 'page' -and $r.unitSrc) {
                $fSrc = Join-Rel $script:Root ([string]$r.unitSrc)
                $fDstRel = Join-RelParts ([string]$r.dstDir) (Get-RelName ([string]$r.unitSrc))
                $fDst = Join-Rel $script:Root $fDstRel
                if ([IO.Directory]::Exists($fSrc)) {
                    $op2 = New-OpId
                    Write-Journal $op2 $id $script:OpMoveDir $fSrc $fDst '' 'Начато' '' ''
                    try {
                        if ([IO.Directory]::Exists($fDst)) { throw 'в папке назначения уже есть такая папка' }
                        [IO.Directory]::Move($fSrc, $fDst)
                        Write-Journal $op2 $id $script:OpMoveDir $fSrc $fDst '' 'Выполнено' '' ''
                        foreach ($m in @($script:Db.Records.Values | Where-Object { -not $_.missing -and (Test-RelUnder $_.rel ([string]$r.unitSrc)) })) {
                            $m.rel = Join-RelParts $fDstRel $m.rel.Substring(([string]$r.unitSrc).Length).TrimStart('\')
                            $m.unit = (Get-RelPath $dst $script:Root); $m.placed = $true; $m.placedBy = 'программа'
                        }
                    } catch {
                        Write-Journal $op2 $id $script:OpMoveDir $fSrc $fDst '' 'Ошибка' (Get-ErrText $_) ''
                        try { [IO.File]::Move($dst, $op.Src) } catch { }
                        throw ('папку страницы перенести не удалось (' + (Get-ErrText $_) + '), страница возвращена на место')
                    }
                }
            }

            $newRel = Get-RelPath $dst $script:Root
            $rec.rel = $newRel; $rec.name = Get-RelName $newRel
            $rec.placed = $true; $rec.home = Get-RelParent $newRel
            # При переименовании на месте сохраняется отметка о том, кто выбрал папку
            if ($op.Type -ne $script:OpRenameFile -or -not $rec.placedBy) { $rec.placedBy = 'программа' }
            if ($r.ContainsKey('userEdit') -and $r.userEdit) { $rec.placedBy = 'пользователь' }
            if ($rec.status -ne 'protected') { $rec.status = 'placed' }
            if ($r.base) { $rec.nameBase = [string]$r.base }
            if ($rec.unitMain -and $r.kind -eq 'page') { $rec.unit = $newRel }
            $rec.changed = $false
            Write-Journal $op.Id $id $op.Type $op.Src $dst ([string]$r.hash) 'Выполнено' '' ''
            if ($op.Type -eq $script:OpRenameFile) { $res.Renamed++ } else { $res.Moved++ }
        } catch {
            $err = Get-ErrText $_
            if (Test-FileBusy $_) { $err = 'файл занят другой программой' }
            if (-not $started) { Write-Journal $op.Id $id $op.Type $op.Src $op.Dst ([string]$r.hash) 'Начато' '' '' }
            Write-Journal $op.Id $id $op.Type $op.Src $op.Dst ([string]$r.hash) 'Ошибка' $err ''
            [void]$res.Errors.Add("$([string]$r.src): $err")
            Write-Log "  ошибка: $([string]$r.src): $err"
        }
        if (((Get-Date) - $lastSave).TotalSeconds -gt 30) { Update-DbIndex; Save-Db; $lastSave = Get-Date }
    }
    } finally {
        # Если работу прервали, уже выполненные перемещения всё равно попадают в базу
        try { Update-DbIndex; Save-Db } catch { }
    }
    Clear-Status

    # Файлы, которые уже лежат на своих местах, считаются разложенными
    foreach ($r in $rows) {
        if ($r.action -ne 'нет') { continue }
        $id = [string]$r.id
        if (-not $script:Db.Records.ContainsKey($id)) { continue }
        $rec = $script:Db.Records[$id]
        if ($rec.missing -or $rec.status -eq 'dsp' -or $rec.status -eq 'locked' -or -not $rec.an) { continue }
        $dir = Get-RelParent $rec.rel
        if ((Test-InStructure $dir) -and [string]::Equals($dir, [string]$r.dstDir, [StringComparison]::OrdinalIgnoreCase)) {
            if (-not $rec.placed) { $rec.placed = $true; $rec.placedBy = 'программа'; $rec.home = $dir }
            if ($rec.status -eq 'new') { $rec.status = 'placed' }
            if ($r.base -and -not $rec.nameBase) { $rec.nameBase = [string]$r.base }
        }
    }

    $res.Removed = Remove-EmptyDirs
    $script:Meta.structureReady = $true
    Save-Meta
    Update-DbIndex
    Save-Db
    return $res
}

# ---------------------------------------------------------------------
#  Откат
# ---------------------------------------------------------------------
function Get-JournalRuns {
    # Возвращает запуски по порядку: @{ Run; Time; Ops (выполненные и ещё не отменённые, по порядку выполнения) }
    $runs = New-Object System.Collections.ArrayList
    $byRun = @{}
    $undone = @{}
    $lines = Read-Journal
    # Отменённой считается операция с записью об откате, кроме случая «можно повторить» (файл был занят)
    foreach ($l in $lines) { if ($l.Status -eq 'Откат' -and $l.Rollback -notlike '*можно повторить*') { $undone[$l.Op] = $true } }
    foreach ($l in $lines) {
        if ($l.Status -ne 'Выполнено') { continue }
        if (-not $byRun.ContainsKey($l.Run)) {
            $byRun[$l.Run] = @{ Run = $l.Run; Time = $l.Time; Ops = (New-Object System.Collections.ArrayList) }
            [void]$runs.Add($byRun[$l.Run])
        }
        if (-not $undone.ContainsKey($l.Op)) { [void]$byRun[$l.Run].Ops.Add($l) }
    }
    return ,@($runs | Where-Object { $_.Ops.Count -gt 0 })
}

function Invoke-Rollback {
    # Отменяет самый поздний ещё не отменённый запуск. Возвращает $true, если что-то отменено.
    $runs = Get-JournalRuns
    if ($runs.Count -eq 0) { Say 'В журнале нет выполненных операций, отменять нечего.'; return $false }
    $run = $runs[$runs.Count - 1]
    $files = @($run.Ops | Where-Object { $_.Type -eq $script:OpMoveFile -or $_.Type -eq $script:OpRenameFile }).Count
    $dirs = @($run.Ops | Where-Object { $_.Type -ne $script:OpMoveFile -and $_.Type -ne $script:OpRenameFile }).Count
    Say ''
    Say "Будет отменён запуск от $($run.Time): операций с файлами $files, с папками $dirs."
    if ($runs.Count -gt 1) { Say "После этого можно будет отменить и более ранние запуски (их ещё $($runs.Count - 1))." }
    if (-not (Ask-YesNo 'Вернуть файлы на прежние места?')) { return $false }

    $ok = 0; $bad = 0
    $ops = @($run.Ops)
    [Array]::Reverse($ops)
    $n = 0
    foreach ($l in $ops) {
        $n++
        if ($n % 20 -eq 0) { Show-Status ("  Отменено операций: {0} из {1}" -f $n, $ops.Count) }
        $result = ''
        try {
            if ($l.Type -eq $script:OpDropDir) {
                [void][IO.Directory]::CreateDirectory($l.Src)
                $result = 'папка восстановлена'
            } elseif ($l.Type -eq $script:OpMakeDir) {
                if ([IO.Directory]::Exists($l.Dst)) {
                    # Собственный файл программы с описанием инструментов не удаляется, а переносится в служебную папку
                    $own = [IO.Path]::Combine($l.Dst, $script:FileNames.ToolsDoc)
                    $entries = @([IO.Directory]::GetFileSystemEntries($l.Dst))
                    if ($entries.Count -eq 1 -and [string]::Equals($entries[0], $own, [StringComparison]::OrdinalIgnoreCase)) {
                        $keepName = (Get-NameNoExt $script:FileNames.ToolsDoc) + ' (' + [IO.Path]::GetFileName($l.Dst) + ')' + (Get-ExtRaw $script:FileNames.ToolsDoc)
                        [IO.File]::Move($own, (Get-FreeTarget ([IO.Path]::Combine($script:ServiceDir, $keepName))))
                        $entries = @()
                    }
                    if ($entries.Count -eq 0) { [IO.Directory]::Delete($l.Dst, $false); $result = 'созданная папка удалена' }
                    else { $result = 'не удалена: в папке есть файлы' }
                } else { $result = 'папки уже нет' }
            } elseif ($l.Type -eq $script:OpMoveDir) {
                if (-not [IO.Directory]::Exists($l.Dst)) { throw 'папка не найдена на новом месте' }
                if ([IO.Directory]::Exists($l.Src)) { throw 'на прежнем месте уже есть папка с таким именем' }
                $parent = [IO.Path]::GetDirectoryName($l.Src)
                if (-not [IO.Directory]::Exists($parent)) { [void][IO.Directory]::CreateDirectory($parent) }
                [IO.Directory]::Move($l.Dst, $l.Src)
                $srcRel = Get-RelPath $l.Src $script:Root; $dstRel = Get-RelPath $l.Dst $script:Root
                foreach ($m in @($script:Db.Records.Values | Where-Object { -not $_.missing -and (Test-RelUnder $_.rel $dstRel) })) {
                    $m.rel = Join-RelParts $srcRel $m.rel.Substring($dstRel.Length).TrimStart('\')
                    $m.placed = $false; $m.home = ''
                    if ($m.unit -and (Test-RelUnder $m.unit $dstRel)) { $m.unit = Join-RelParts $srcRel $m.unit.Substring($dstRel.Length).TrimStart('\') }
                }
                $result = 'папка возвращена'
            } else {
                $cur = $l.Dst
                $rec = $null
                if ($l.File -and $script:Db.Records.ContainsKey($l.File)) { $rec = $script:Db.Records[$l.File] }
                if (-not [IO.File]::Exists($cur) -and $rec -and -not $rec.missing) {
                    # Файл после разбора переносили вручную: ищем его по базе
                    $alt = Join-Rel $script:Root $rec.rel
                    if ([IO.File]::Exists($alt)) { $cur = $alt }
                }
                if (-not [IO.File]::Exists($cur)) { throw 'файл не найден' }
                $target = $l.Src
                $parent = [IO.Path]::GetDirectoryName($target)
                if (-not [IO.Directory]::Exists($parent)) { [void][IO.Directory]::CreateDirectory($parent) }
                $note = ''
                if (-not [string]::Equals($cur, $target, [StringComparison]::OrdinalIgnoreCase) -and ([IO.File]::Exists($target) -or [IO.Directory]::Exists($target))) {
                    $target = Get-FreeTarget $target
                    $note = ' (прежнее имя занято, добавлен номер)'
                }
                $before = (New-Object IO.FileInfo($cur)).LastWriteTimeUtc
                [IO.File]::Move($cur, $target)
                if ((New-Object IO.FileInfo($target)).LastWriteTimeUtc -ne $before) { try { [IO.File]::SetLastWriteTimeUtc($target, $before) } catch { } }
                if ($rec) {
                    $rec.rel = Get-RelPath $target $script:Root; $rec.name = Get-RelName $rec.rel
                    $rec.placed = $false; $rec.placedBy = ''; $rec.home = ''; $rec.nameBase = ''
                    if ($rec.status -eq 'placed') { $rec.status = 'new' }
                    if ($rec.unitMain -and $rec.unit -and -not (Test-RelUnder $rec.rel $rec.unit)) { $rec.unit = $rec.rel }
                }
                $result = 'файл возвращён' + $note
            }
            $ok++
        } catch {
            if (Test-FileBusy $_) { $result = 'не отменено, можно повторить: файл занят другой программой' }
            else { $result = 'не отменено: ' + (Get-ErrText $_) }
            $bad++
        }
        Write-Journal $l.Op $l.File $l.Type $l.Src $l.Dst $l.Hash 'Откат' '' $result $l.Run
    }
    Clear-Status
    $left = Get-JournalRuns
    $script:Meta.structureReady = ($left.Count -gt 0)
    Save-Meta
    Update-DbIndex
    Save-Db
    Say "Отменено операций: $ok. Не удалось отменить: $bad."
    if ($bad -gt 0) { Say 'Причины записаны в «Журнал операций.csv», столбец «Результат отката».' }
    return $true
}
