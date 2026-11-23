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
function Test-AutomationProc([int]$id) {
    # Office, запущенный программой, имеет в командной строке слово Embedding или Automation.
    # Так он отличается от Word или Excel, которые в ту же секунду мог открыть сам пользователь.
    # Возвращает $true, $false или $null, если командную строку прочитать не удалось.
    try {
        $p = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId=' + $id) -ErrorAction Stop
        if ($p -and $p.CommandLine) { return ([string]$p.CommandLine -match '(?i)embedding|automation') }
    } catch { }
    return $null
}
function Register-NewProc([string]$key, [string]$name, $before) {
    # Запоминает процесс Office, который запустила программа: только его можно завершить при зависании
    $new = @(Get-ProcIds $name | Where-Object { $before -notcontains $_ })
    if ($new.Count -eq 0) { return }
    $unknown = 0
    foreach ($id in $new) {
        $a = Test-AutomationProc $id
        if ($a -eq $true) { $Shared.Pids[$key] = $id; return }
        if ($null -eq $a) { $unknown++ }
    }
    # Командная строка недоступна: процесс запоминается, только если новый процесс ровно один
    if ($new.Count -eq 1 -and $unknown -eq 1) { $Shared.Pids[$key] = $new[0] }
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
        # Колонтитулы первого раздела и надписи в них: там часто стоит пометка «Для служебного пользования»
        $extra = ''
        try {
            $sec = $doc.Sections.Item(1)
            foreach ($i in 1, 2, 3) {
                try { $extra += [string]$sec.Headers.Item($i).Range.Text + "`n" } catch { }
                try { $extra += [string]$sec.Footers.Item($i).Range.Text + "`n" } catch { }
            }
            try { foreach ($sh in $sec.Headers.Item(1).Shapes) { try { if ($sh.TextFrame.HasText) { $extra += [string]$sh.TextFrame.TextRange.Text + "`n" } } catch { } } } catch { }
        } catch { }
        if ($extra.Length -gt 6000) { $extra = $extra.Substring(0, 6000) }
        return @{ ok = $true; text = (Clear-ComText $text); extra = (Clear-ComText $extra) }
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
        # Колонтитулы первого листа (если принтер недоступен, Excel может их не отдать: тогда пропускаются)
        $extra = ''
        try {
            if ($wb.Worksheets.Count -ge 1) {
                $ps = $wb.Worksheets.Item(1).PageSetup
                foreach ($pn in 'LeftHeader', 'CenterHeader', 'RightHeader', 'LeftFooter', 'CenterFooter', 'RightFooter') {
                    try { $v = [string]$ps.$pn; if ($v) { $extra += $v + "`n" } } catch { }
                }
            }
        } catch { }
        return @{ ok = $true; text = $sb.ToString(); extra = (Clear-ComText $extra) }
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
        $extra = ''
        if ($r.ContainsKey('extra')) { $extra = [string]$r.extra }
        return @{ State = 'ok'; Text = (Format-Extract ([string]$r.text) $max); Note = ''; Extra = $extra }
    } finally {
        try { if ([IO.File]::Exists($tmp)) { [IO.File]::Delete($tmp) } } catch { }
    }
}
