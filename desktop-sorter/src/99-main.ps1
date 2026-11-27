# =====================================================================
#  Режимы работы и запуск
# =====================================================================

function Initialize-All {
    $settings = [IO.Path]::Combine($script:ProgramDir, $script:FileNames.Settings)
    if ($script:SettingsOverride) { $settings = $script:SettingsOverride }
    Initialize-Config $settings
    Initialize-Workspace $script:RootOverride
    Enter-RunLock
    Write-Log ('=== Запуск ' + $script:RunId + ', версия ' + $script:Version + ', PowerShell ' + [string]$PSVersionTable.PSVersion + ' ===')
    Initialize-Readers
    Initialize-WinRT
    Initialize-Prompt
    Initialize-Api
    Read-Db
    Read-Meta
    Read-ApiCache
    $script:ToolFolders = @($script:Cfg.Folders | Where-Object { $_.Path -match '(?i)инструмент' -and $_.Path -notmatch '\{' } | ForEach-Object { $_.Path })
}

function Show-Banner {
    Say ''
    Say '=============================================================' 'Cyan'
    Say ('  РАЗБОР РАБОЧЕГО СТОЛА   версия ' + $script:Version) 'Cyan'
    Say '=============================================================' 'Cyan'
    if ($script:IsTestRoot) {
        Say ('  ТЕСТОВАЯ ПАПКА: ' + $script:Root) 'Yellow'
        Say '  Настоящий рабочий стол сейчас не затрагивается.' 'Yellow'
    } else { Say ('  Папка: ' + $script:Root) }
    $w = $script:WinRT
    $office = @()
    foreach ($p in @(@('Word', 'Word.Application'), @('Excel', 'Excel.Application'), @('PowerPoint', 'PowerPoint.Application'))) {
        $yes = 'нет'; if (Test-OfficeApp $p[1]) { $yes = 'есть' }
        $office += ($p[0] + ' ' + $yes)
    }
    Say ('  Office для старых форматов: ' + ($office -join ', '))
    $pdf = 'нет'; if ($w.Pdf) { $pdf = 'есть' }
    $ocr = 'нет'; if ($w.Ocr) { $ocr = 'есть (' + $w.OcrLang + ')' }
    Say ("  Снимок первой страницы PDF: $pdf. Распознавание текста для поиска пометки ДСП: $ocr.")
    foreach ($n in $w.Notes) { Write-Log ('  ' + $n) }
    if (Test-BackupEnabled) {
        $bk = Read-BackupKey
        $bt = 'ключ ещё не спрашивался'
        if ($bk.Key) { $bt = 'ключ сохранён' } elseif ($bk.Asked) { $bt = 'ключа нет' }
        Say ("  Запасной сервис на случай, если Claude перестанет отвечать: Google Gemini ($bt).")
    }
    Say ("  Судов в перечне КМТФ: $($script:Cfg.Fleet.Count). Файлов в базе: $(@($script:Db.Records.Values | Where-Object { -not $_.missing }).Count).")
    Say ''
}

function Open-ForUser([string]$path) {
    if (-not $script:IsWin -or $script:AutoYes) { return }
    try { Start-Process -FilePath $path } catch { Write-Log ('Не удалось открыть файл: ' + (Get-ErrText $_)) }
}

function Invoke-PlanStage {
    # Шаги 1-3 раздела 8: сканирование, анализ, план. Файлы не изменяются.
    if ($script:Cfg.Fleet.Count -eq 0) {
        Fail 'В файле настроек не заполнен перечень судов КМТФ (раздел [Суда КМТФ]).'
        Say 'Без него программа не отличит суда КМТФ от сторонних. Откройте файл «Настройки.txt», впишите суда и запустите программу снова.'
        return $false
    }
    Invoke-Scan
    Sync-Scan
    Save-Db
    $ok = Invoke-Analysis
    Save-Db
    if (-not $ok) { return $false }
    Say 'Шаг 4. Составление плана…'
    $rows = Build-Plan
    Save-Plan $rows
    Save-Db
    $st = Get-PlanStats $rows
    Say ''
    Say 'ПЛАН ГОТОВ' 'Green'
    Say ("  Всего файлов: {0}. Будет перемещено: {1}, только переименовано: {2}, останутся на месте: {3}." -f $st.Total, $st.Move, $st.Rename, $st.None)
    Say ("  В папку «{0}»: {1}. Документы ДСП (не трогаются): {2}. С паролем: {3}. Заняты другой программой: {4}." -f $script:Cfg.ReviewFolder, $st.Review, $st.Dsp, $st.Protected, $st.Locked)
    Say ('  Посмотреть план:  ' + (Get-ServicePath 'PlanHtml'))
    Say ('  Исправить план в Excel:  ' + (Get-ServicePath 'PlanXlsx'))
    Say '  Пока план не применён, ни один файл не изменён.'
    return $true
}

function Invoke-ApplyStage {
    # Шаги 4-5: подтверждение и выполнение
    $plan = Read-Plan
    $todo = @($plan.Rows | Where-Object { $_.action -ne 'нет' })
    Say ''
    Say ("План от {0}: операций {1}." -f $plan.Created, $todo.Count)
    if ($plan.Edited -gt 0) { Say ("  Учтено ваших правок из файла «{0}»: {1}." -f $plan.Source, $plan.Edited) }
    foreach ($r in $plan.Rejected) { Warn $r }
    if ($todo.Count -eq 0) { Say 'В плане нет операций, применять нечего.'; return $false }
    if (-not (Ask-YesNo ("Применить план: переместить и переименовать файлов - {0}?" -f $todo.Count) $true)) {
        Say 'План не применён. Ни один файл не изменён.'
        return $false
    }
    Say 'Шаг 5. Выполнение плана…'
    $res = Invoke-Apply $plan.Rows
    try { [IO.File]::Move((Get-ServicePath 'PlanJson'), ([IO.Path]::Combine($script:ServiceDir, ('plan-' + $script:RunId + '-выполнен.jsonl')))) } catch { }
    $script:LastApply = $res
    $review = @($plan.Rows | Where-Object { $_.action -ne 'нет' -and (Test-RelUnder ([string]$_.dstDir) $script:Cfg.ReviewFolder) }).Count
    Say ''
    Say 'ОТЧЁТ' 'Green'
    Say ("  Перемещено: {0}. Только переименовано: {1}. Создано папок: {2}. Удалено пустых папок: {3}." -f $res.Moved, $res.Renamed, $res.Dirs, $res.Removed)
    Say ("  В папке «{0}»: {1}. Не выполнено операций: {2}." -f $script:Cfg.ReviewFolder, $review, $res.Errors.Count)
    # Пропущенные файлы: всё, что по плану осталось на месте
    $skip = @{ All = 0; Placed = 0; Dsp = 0; Locked = 0; Other = 0 }
    foreach ($r in $plan.Rows) {
        if ($r.action -ne 'нет') { continue }
        $skip.All++
        $rec = $null
        if ($script:Db.Records.ContainsKey([string]$r.id)) { $rec = $script:Db.Records[[string]$r.id] }
        if (-not $rec) { $skip.Other++ }
        elseif ($rec.status -eq 'dsp') { $skip.Dsp++ }
        elseif ($rec.status -eq 'locked') { $skip.Locked++ }
        elseif ($rec.placed) { $skip.Placed++ }
        else { $skip.Other++ }
    }
    Say ("  Пропущено (остались на месте): {0}. Из них уже лежат в своих папках: {1}, документы ДСП: {2}, заняты другой программой: {3}, прочие: {4}." -f $skip.All, $skip.Placed, $skip.Dsp, $skip.Locked, $skip.Other)
    if ($res.Errors.Count -gt 0) {
        Say '  Файлы, которые остались на месте, и причины:'
        $shown = 0
        foreach ($e in $res.Errors) { if ($shown -lt 15) { Say ('    ' + $e) }; $shown++ }
        if ($res.Errors.Count -gt 15) { Say ("    … и ещё {0}. Полный список - в файле «{1}»." -f ($res.Errors.Count - 15), $script:FileNames.Journal) }
    }
    return $true
}

function Invoke-CatalogStage {
    Invoke-Scan
    Sync-Scan
    Save-Db
    Build-Catalog
}

function Test-OneProvider([string]$provider) {
    # Один настоящий запрос в том же виде, что и при разборе, но про выдуманный файл без содержимого
    $script:Api.Provider = $provider
    $rec = @{ rel = 'Проверка ключа.txt'; name = 'Проверка ключа.txt'; ext = '.txt'; size = [long]100; mtime = (ConvertTo-TicksText ([datetime]::UtcNow)) }
    $content = @{ Kind = 'meta'; Pages = 0; Note = 'проверочный запрос, файла нет'; Text = '' }
    for ($try = 1; $try -le 2; $try++) {
        $net = Start-ApiRequest (Build-RequestBody $rec $content $false @() @())
        # Ошибка запроса здесь не выбрасывается: её разбирает Complete-ApiRequest
        try { [void]$net.Task.Wait(1000 * (Get-OptInt 'ТаймаутЗапроса_сек')) } catch { }
        $r = Complete-ApiRequest $net
        if ($r.Status -eq 200) {
            $parsed = ConvertFrom-ApiResponse $r.Body
            if ($parsed.Ok -or $parsed.ContainsKey('Refusal')) { return 'работает' }
            return ('связь есть, но ответ не принят: ' + $parsed.Error)
        }
        if ($provider -eq 'gemini' -and $r.Status -eq 400 -and -not $script:Api.BackupNoSchema -and $r.Body -match '(?i)schema') { $script:Api.BackupNoSchema = $true; continue }
        if ($r.Network) { return ('нет связи: ' + $r.Message) }
        return (Get-ApiErrorText $r.Status $r.Body)
    }
    return 'не удалось проверить'
}

function Invoke-KeyCheck {
    # Проверка ключей: по одному запросу в Claude и в запасной сервис. Файлы не читаются и не отправляются.
    Say 'Отправляю по одному проверочному запросу. Ваши файлы при этом не читаются и никуда не уходят.'
    if (-not $script:Api.Key) { $script:Api.Key = Read-ApiKey }
    if (-not $script:Api.Key -and -not $script:AutoYes) { $script:Api.Key = Request-ApiKey }
    if ($script:Api.Key) { Say ('  Claude (' + (Get-Opt 'Модель') + '): ' + (Test-OneProvider 'claude')) }
    else { Say '  Claude: ключ не задан' }
    if (Test-BackupEnabled) {
        $bk = Read-BackupKey
        $script:Api.BackupKey = $bk.Key
        if (-not $bk.Key -and -not $script:AutoYes) { Remove-Item -LiteralPath (Get-BackupKeyPath) -ErrorAction SilentlyContinue; $script:Api.BackupKey = Request-BackupKey }
        if ($script:Api.BackupKey) { Say ('  Запасной Gemini (' + (Get-Opt 'ЗапаснаяМодель') + '): ' + (Test-OneProvider 'gemini')) }
        else { Say '  Запасной Gemini: ключа нет' }
    } else { Say '  Запасной сервис выключен в настройках.' }
    $script:Api.Provider = 'claude'
}

function Invoke-Mode([string]$mode) {
    switch ($mode) {
        '6' {
            Say 'РЕЖИМ 6. Проверка ключей' 'Cyan'
            Invoke-KeyCheck
        }
        '1' {
            Say 'РЕЖИМ 1. Только план' 'Cyan'
            if (Invoke-PlanStage) { if (Get-OptBool 'ОткрыватьПланПослеФормирования') { Open-ForUser (Get-ServicePath 'PlanHtml') } }
        }
        '2' {
            Say 'РЕЖИМ 2. Применение исправленного плана' 'Cyan'
            if (Invoke-ApplyStage) { Invoke-CatalogStage }
        }
        '3' {
            Say 'РЕЖИМ 3. Полный разбор' 'Cyan'
            if (Invoke-PlanStage) {
                if (Get-OptBool 'ОткрыватьПланПослеФормирования') { Open-ForUser (Get-ServicePath 'PlanHtml') }
                [void](Invoke-ApplyStage)
                # Каталог пересобирается полностью при каждом полном разборе, даже если перемещать было нечего
                Invoke-CatalogStage
            }
        }
        '4' {
            Say 'РЕЖИМ 4. Только обновление каталога' 'Cyan'
            Invoke-CatalogStage
        }
        '5' {
            Say 'РЕЖИМ 5. Откат' 'Cyan'
            if (Invoke-Rollback) { Invoke-CatalogStage }
        }
        default { Warn "Неизвестный режим: $mode" }
    }
}

function Start-Main {
    $code = 0
    try {
        Initialize-All
        Show-Banner
        if ($script:ModeOverride) { Invoke-Mode $script:ModeOverride }
        else {
            while ($true) {
                Say 'Что сделать?'
                Say '  1 - Только план (ничего не перемещается)'
                Say '  2 - Применить исправленный план'
                Say '  3 - Полный разбор (план, подтверждение, перемещение, каталог)'
                Say '  4 - Только обновить каталог'
                Say '  5 - Откат последнего разбора'
                Say '  6 - Проверить ключи Claude и Gemini (один короткий запрос в каждый)'
                Say '  0 - Выход'
                $c = Read-Host 'Введите номер и нажмите Enter'
                if ($null -eq $c) { break }
                $c = $c.Trim()
                if ($c -eq '0' -or $c -eq '') { break }
                if (@('1', '2', '3', '4', '5', '6') -notcontains $c) { Say 'Нужно ввести цифру от 0 до 6.'; continue }
                try { Invoke-Mode $c }
                catch {
                    Clear-Status
                    Fail (Get-ErrText $_)
                    Write-Log ('Подробности: ' + $_.ScriptStackTrace)
                }
                Say ''
            }
        }
    } catch {
        Clear-Status
        Fail (Get-ErrText $_)
        Write-Log ('Подробности: ' + $_.ScriptStackTrace)
        $code = 1
    } finally {
        try { Stop-OfficeWorker } catch { }
        Remove-TempDir
        Close-Journal
        Exit-RunLock
        Close-Log
    }
    return $code
}

if ($env:DESKTOPSORTER_NO_MAIN -eq '1') { return }
$exitCode = Start-Main
exit $exitCode
