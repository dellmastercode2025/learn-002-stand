# =====================================================================
#  Анализ: чтение содержимого, проверка пометки ДСП и запросы к Claude
# =====================================================================

function Get-VndTemplatePrefix {
    foreach ($t in $script:Cfg.Folders) {
        if ($t.Path -like '*{наименование ВНД}*') { return (Get-StaticPrefix $t) }
    }
    return ''
}
function Get-InsTemplatePrefix {
    foreach ($t in $script:Cfg.Folders) {
        if ($t.Path -like '*{вид страхования}*') { return (Get-StaticPrefix $t) }
    }
    return ''
}

function Initialize-DynamicLists {
    # Перечни папок, которые передаются модели при каждом запросе,
    # чтобы один документ не получил несколько папок
    $script:VndNames = New-Object System.Collections.ArrayList
    $script:VndKeys = @{}
    $script:InsNames = New-Object System.Collections.ArrayList
    $script:InsKeys = @{}
    foreach ($k in $script:Cfg.InsKinds) { $script:InsKeys[(Get-NormKey $k.Name)] = $k.Name }
    $vp = Get-VndTemplatePrefix
    if ($vp) {
        $dir = Join-Rel $script:Root $vp
        if ([IO.Directory]::Exists($dir)) {
            foreach ($d in [IO.Directory]::GetDirectories($dir)) { Add-VndName ([IO.Path]::GetFileName($d)) }
        }
    }
    foreach ($rec in $script:Db.Records.Values) {
        if ($rec.missing -or -not $rec.an) { continue }
        $f = [string](Get-Val $rec.an 'folder' '')
        if ($f -like '*{наименование ВНД}*') { Add-VndName (Get-Str $rec.an 'vnd_name') }
        if ($f -like '*{вид страхования}*') { [void](Resolve-InsKind (Get-Str $rec.an 'insurance_kind')) }
    }
}

function Add-VndName([string]$name) {
    $n = Limit-Text (ConvertTo-SafeName $name) (Get-OptInt 'МаксДлинаПапкиВНД')
    if (-not $n) { return '' }
    $k = Get-NormKey $n
    if ($script:VndKeys.ContainsKey($k)) { return $script:VndKeys[$k] }
    $script:VndKeys[$k] = $n
    [void]$script:VndNames.Add($n)
    return $n
}

function Resolve-InsKind([string]$name) {
    # Возвращает название папки вида страхования: из настроек, уже созданную или новую
    $n = Limit-Text (ConvertTo-SafeName $name) 60
    if (-not $n) { return '' }
    $k = Get-NormKey $n
    if ($script:InsKeys.ContainsKey($k)) { return $script:InsKeys[$k] }
    foreach ($kind in $script:Cfg.InsKinds) {
        # Модель могла вернуть синоним из описания («каско», «H&M»)
        foreach ($syn in ($kind.Desc -split ',')) {
            if ((Get-NormKey $syn) -eq $k) { $script:InsKeys[$k] = $kind.Name; return $kind.Name }
        }
    }
    $script:InsKeys[$k] = $n
    [void]$script:InsNames.Add($n)
    return $n
}

function Get-AnalysisQueue {
    # Файлы, которым нужен анализ. Уже разобранные файлы повторно не обрабатываются.
    $fp = $script:Api.Fingerprint
    $queue = New-Object System.Collections.ArrayList
    $recheck = New-Object System.Collections.ArrayList
    # Порядок по пути: файлы обрабатываются в одном и том же порядке при каждом запуске
    foreach ($id in @($script:Db.Records.Keys | Sort-Object { $script:Db.Records[$_].rel })) {
        $rec = $script:Db.Records[$id]
        if ($rec.missing) { continue }
        if ($rec.unit -and -not $rec.unitMain) { $rec.status = 'unit'; continue }
        if ($rec.attachedTo) { $rec.status = 'attached'; continue }
        if ($rec.hashError) { $rec.status = 'locked'; $rec.reason = $rec.hashError; continue }
        if ($rec.status -eq 'locked') { $rec.status = 'new'; $rec.reason = '' }
        $an = $rec.an
        if ($an) {
            $inReview = Test-RelUnder (Get-RelParent $rec.rel) $script:Cfg.ReviewFolder
            if ($rec.changed) {
                # Изменённый файл в Claude повторно не уходит, но пометку ДСП проверяем заново на месте
                [void]$recheck.Add($rec)
                continue
            }
            if ((Get-Str $an 'fp') -eq $fp) { continue }
            if ($rec.placed -and -not $inReview) { continue }
        }
        [void]$queue.Add($rec)
    }
    return @{ Queue = $queue; Recheck = $recheck }
}

function Set-RecordResult($rec, $an, [string]$status, [string]$reason) {
    $rec.an = $an
    $rec.status = $status
    $rec.reason = $reason
    $rec.processedAt = Get-NowText
    $rec.changed = $false
    $f = ''
    if ($an) { $f = [string](Get-Val $an 'folder' '') }
    if ($f -like '*{наименование ВНД}*') { $an.vnd_name = Add-VndName (Get-Str $an 'vnd_name') }
    if ($f -like '*{вид страхования}*') { $an.insurance_kind = Resolve-InsKind (Get-Str $an 'insurance_kind') }
    Write-Log ("  {0} -> {1} [{2}; {3}] {4}" -f $rec.rel, $f, (Get-Str $an 'method'), $status, $reason)
}

function Get-LocalDecision($rec, [bool]$useApi) {
    # Читает файл на этом компьютере и решает, нужно ли обращаться к Claude.
    # Возвращает @{ Send = $true; Content } либо @{ Send = $false } (результат уже записан).
    $mark = Find-DspMark $rec.name
    if ($mark) {
        Set-RecordResult $rec (New-LocalAnalysis 'не анализировался' '' 0 "пометка ДСП в имени файла («$mark»)") 'dsp' 'документ ДСП, программа его не трогает'
        return @{ Send = $false }
    }
    $full = Join-Rel $script:Root $rec.rel
    $c = Get-FileContent $full $rec.name $rec.ext $rec.size
    if ($c.State -eq 'dsp') {
        Set-RecordResult $rec (New-LocalAnalysis 'не анализировался' '' 0 "пометка ДСП в тексте («$($c.Dsp)»)") 'dsp' 'документ ДСП, программа его не трогает'
        return @{ Send = $false }
    }
    if ($c.State -eq 'protected') {
        Set-RecordResult $rec (New-LocalAnalysis 'не анализировался' $script:Cfg.ProtectedFolder 1 'файл защищён паролем') 'protected' 'защищён паролем'
        return @{ Send = $false }
    }
    if ($c.State -eq 'locked') {
        $rec.status = 'locked'; $rec.reason = $c.Note
        Write-Log "  $($rec.rel): $($c.Note)"
        return @{ Send = $false }
    }
    if ($c.State -eq 'corrupt') {
        $an = New-LocalAnalysis 'не анализировался' $script:Cfg.ReviewFolder 0 $c.Note
        $an.name_informative = (-not (Test-BadName (Get-NameNoExt $rec.name)))
        Set-RecordResult $rec $an 'new' $c.Note
        return @{ Send = $false }
    }
    if ($c.State -eq 'unverified' -and (Get-Opt 'ЕслиСканНеПроверен').ToLowerInvariant() -eq 'не отправлять') {
        $note = 'скан не проверен на пометку ДСП и в Claude не отправлялся'
        if ($c.Note) { $note += ' (' + $c.Note + ')' }
        $an = Get-KeywordAnalysis $rec.name $rec.ext '' $note $null
        $an.fp = $script:Api.Fingerprint
        Set-RecordResult $rec $an 'new' $note
        return @{ Send = $false }
    }
    if (-not $useApi) {
        $an = Get-KeywordAnalysis $rec.name $rec.ext $c.Text 'Claude не использовался' $c.Html
        $an.fp = 'без-claude'
        Set-RecordResult $rec $an 'new' ''
        return @{ Send = $false }
    }
    return @{ Send = $true; Content = $c }
}

function Show-AnalysisStatus([int]$done, [int]$total, [int]$inflight, $started) {
    $el = ((Get-Date) - $started).TotalSeconds
    $eta = ''
    if ($done -ge 5 -and $el -gt 3) {
        $left = [int]($el / $done * ($total - $done))
        if ($left -ge 3600) { $eta = (', осталось примерно {0} ч {1} мин' -f [int][Math]::Floor($left / 3600), [int](($left % 3600) / 60)) }
        elseif ($left -ge 60) { $eta = (', осталось примерно {0} мин' -f [int]($left / 60)) }
        else { $eta = ', осталось меньше минуты' }
    }
    Show-Status ("  Обработано {0} из {1}, запросов в работе: {2}{3}" -f $done, $total, $inflight, $eta)
}

function Invoke-Analysis {
    # Возвращает $true, если анализ пройден до конца, $false - если остановлен
    Initialize-DynamicLists
    $plan = Get-AnalysisQueue
    $queue = $plan.Queue
    $fp = $script:Api.Fingerprint

    # Изменённые файлы: локальная перепроверка пометки ДСП, без запросов
    foreach ($rec in $plan.Recheck) {
        try {
            $mark = Find-DspMark $rec.name
            if (-not $mark) {
                $c = Get-FileContent (Join-Rel $script:Root $rec.rel) $rec.name $rec.ext $rec.size
                if ($c.State -eq 'dsp') { $mark = $c.Dsp }
            }
            if ($mark) { Set-RecordResult $rec (New-LocalAnalysis 'не анализировался' '' 0 "пометка ДСП («$mark»)") 'dsp' 'документ ДСП, программа его не трогает' }
            else { $rec.changed = $false; if ($rec.status -eq 'dsp') { $rec.status = 'new' } }
        } catch { Write-Log "  перепроверка $($rec.rel): $(Get-ErrText $_)" }
    }

    # Ответы, уже полученные для такого же содержимого, берутся из кэша
    $fromCache = 0
    $work = New-Object System.Collections.ArrayList
    foreach ($rec in $queue) {
        $hit = $null
        if ($rec.hash) { $hit = Get-ApiCache $rec.hash $fp }
        if ($hit -and -not (Find-DspMark $rec.name)) {
            $an = @{}
            foreach ($k in @($hit.Keys)) { $an[$k] = $hit[$k] }
            Set-RecordResult $rec $an 'new' ''
            $fromCache++
        } else { [void]$work.Add($rec) }
    }
    if ($fromCache -gt 0) { Say "  Для $fromCache файлов ответ Claude взят из сохранённых, повторно они не отправляются." }
    if ($work.Count -eq 0) { Say 'Шаг 3. Анализ: новых файлов для анализа нет.'; return $true }

    # --- Доступен ли Claude
    $useApi = $true
    if (-not $script:Api.Key) { $script:Api.Key = Read-ApiKey }
    if (-not $script:Api.Key -and -not $script:AutoYes) { $script:Api.Key = Request-ApiKey }
    if (-not $script:Api.Key) {
        Warn 'Ключ доступа к Claude не задан.'
        if (-not (Ask-YesNo 'Продолжить без Claude, раскладывая файлы только по ключевым словам?')) { return $false }
        $useApi = $false
    }

    $pdf = 0; $img = 0
    foreach ($rec in $work) { if ($rec.ext -eq '.pdf') { $pdf++ } elseif ($script:ExtImage -contains $rec.ext) { $img++ } }
    Say ''
    Say "Шаг 3. Анализ. Файлов к обработке: $($work.Count) (из них PDF: $pdf, изображений: $img)."
    if ($useApi) {
        Say "  В Claude будет отправлено не больше $($work.Count) запросов, по одному на файл."
        Say '  Документы с пометкой ДСП и файлы с паролем не отправляются.'
        if (-not $script:WinRT.Ocr -and ($pdf + $img) -gt 0 -and (Get-Opt 'ЕслиСканНеПроверен').ToLowerInvariant() -eq 'не отправлять' -and $env:DESKTOPSORTER_TEST_SCAN -ne '1') {
            Warn "Распознаватель русского текста недоступен, поэтому $($pdf + $img) PDF и изображений не будут отправлены в Claude и разложатся только по названию."
        }
        if (-not (Ask-YesNo 'Отправлять?')) { return $false }
    }

    $maxPar = [Math]::Min(8, [Math]::Max(1, (Get-OptInt 'ОдновременныхЗапросов')))
    $maxRetry = Get-OptInt 'ПовторовПриОшибке'
    $timeout = Get-OptInt 'ТаймаутЗапроса_сек'
    $inflight = New-Object System.Collections.ArrayList
    $retry = New-Object System.Collections.ArrayList
    $busyHash = @{}                                         # содержимое, которое сейчас анализируется
    $deferred = New-Object System.Collections.ArrayList     # копии таких файлов ждут ответа
    $idx = 0; $done = 0; $total = $work.Count
    $failStreak = 0; $fatal = ''; $fatalStatus = 0; $stopped = $false
    $netStreak = 0; $everOk = $false; $lastNetErr = ''      # попытки подряд без связи с сервисом
    $pauseUntil = Get-Date
    $started = Get-Date
    $lastSave = Get-Date
    $backoff = @(2, 6, 15, 30, 60)

    try {
        while ($true) {
            # --- 1. Готовые ответы
            $progress = $false
            for ($i = $inflight.Count - 1; $i -ge 0; $i--) {
                $p = $inflight[$i]
                if (-not $p.Net.Task.IsCompleted) {
                    if (((Get-Date) - $p.Net.Started).TotalSeconds -gt $timeout -and -not $p.Net.Aborted) {
                        $p.Net.Aborted = $true
                        try { $p.Net.Req.Abort() } catch { }
                    }
                    continue
                }
                $inflight.RemoveAt($i)
                $progress = $true
                $r = Complete-ApiRequest $p.Net
                $rec = $p.Rec
                $script:Usage.Requests++
                if ($r.Status -eq 200) {
                    $netStreak = 0; $everOk = $true
                    $parsed = ConvertFrom-ApiResponse $r.Body
                    if ($parsed.Ok) {
                        $failStreak = 0
                        if ($p.Drop) { $parsed.An.note = 'содержимое не удалось передать, папка определена по имени файла' }
                        if ($rec.hash -and -not $p.Drop) { Add-ApiCache $rec.hash $fp $parsed.An }
                        Set-RecordResult $rec $parsed.An 'new' ''
                        $done++
                    } elseif ($parsed.ContainsKey('Refusal')) {
                        $an = New-LocalAnalysis 'Claude' $script:Cfg.ReviewFolder 0 $parsed.Error
                        Set-RecordResult $rec $an 'new' $parsed.Error
                        $done++
                    } elseif (-not $p.Revalidate) {
                        # Некорректный JSON или папка не из списка: один повторный запрос
                        $p.Revalidate = $true
                        [void]$retry.Add(@{ Item = $p; NotBefore = (Get-Date) })
                    } else {
                        $an = New-LocalAnalysis 'Claude' $script:Cfg.ReviewFolder 0 ('ответ модели не принят: ' + $parsed.Error)
                        Set-RecordResult $rec $an 'new' $parsed.Error
                        $done++
                    }
                    continue
                }
                $errText = $r.Message
                if (-not $r.Network) { $errText = Get-ApiErrorText $r.Status $r.Body }
                if ($r.Status -eq 401 -or $r.Status -eq 402 -or $r.Status -eq 403 -or $r.Status -eq 404) {
                    $fatal = $errText; $fatalStatus = $r.Status
                    [void]$retry.Add(@{ Item = $p; NotBefore = (Get-Date) })
                    continue
                }
                if (($r.Status -eq 400 -or $r.Status -eq 413) -and -not $p.Drop -and $p.Content.Kind -ne 'meta') {
                    # Сервис не принял содержимое: повторяем запрос только с именем и свойствами файла
                    Write-Log "  $($rec.rel): $errText; повтор без содержимого"
                    $p.Drop = $true
                    [void]$retry.Add(@{ Item = $p; NotBefore = (Get-Date) })
                    continue
                }
                $retryable = ($r.Network -or $r.Status -eq 408 -or $r.Status -eq 409 -or $r.Status -eq 429 -or $r.Status -ge 500)
                if ($r.Network -or $r.Status -eq 408 -or ($r.Status -ge 500 -and $r.Status -ne 529)) { $netStreak++; $lastNetErr = $errText }
                if ($retryable -and $p.Attempt -lt $maxRetry) {
                    $wait = $backoff[[Math]::Min($p.Attempt, $backoff.Count - 1)]
                    if ($r.RetryAfter -gt 0) { $wait = [Math]::Min(300, $r.RetryAfter) }
                    $p.Attempt++
                    [void]$retry.Add(@{ Item = $p; NotBefore = (Get-Date).AddSeconds($wait) })
                    if ($r.Status -eq 429 -or $r.Status -eq 529) {
                        $until = (Get-Date).AddSeconds($wait)
                        if ($until -gt $pauseUntil) { $pauseUntil = $until }
                    }
                    Write-Log "  $($rec.rel): $errText; повтор через $wait с"
                    continue
                }
                # Попытки исчерпаны: папка по ключевым словам, файл помечается
                $script:Usage.Failed++
                $failStreak++
                $an = Get-KeywordAnalysis $rec.name $rec.ext $p.Content.Text ('Claude не ответил: ' + $errText) $p.Content.Html
                $an.fp = 'повтор'
                Set-RecordResult $rec $an 'new' ''
                $done++
            }
            # Файлы с содержимым, по которому ответ уже получен, возвращаются в очередь
            if ($deferred.Count -gt 0) {
                $busy = @{}
                foreach ($x in $inflight) { if ($x.Rec.hash) { $busy[$x.Rec.hash] = $true } }
                foreach ($x in $retry) { if ($x.Item.Rec.hash) { $busy[$x.Item.Rec.hash] = $true } }
                $busyHash = $busy
                for ($i = $deferred.Count - 1; $i -ge 0; $i--) {
                    if (-not $busyHash.ContainsKey($deferred[$i].hash)) { $work.Insert($idx, $deferred[$i]); $deferred.RemoveAt($i) }
                }
            }

            # --- 2. Claude недоступен: новые запросы не отправляются, после ответа на уже отправленные - вопрос
            # Нет связи: если ещё ни один ответ не получен, хватает двух кругов попыток, иначе четырёх
            $netLimit = [Math]::Max(8, 4 * $maxPar)
            if (-not $everOk) { $netLimit = [Math]::Max(4, 2 * $maxPar) }
            $hold = ($fatal -ne '' -or $failStreak -ge 5 -or $netStreak -ge $netLimit)
            if ($hold -and $inflight.Count -eq 0) {
                Clear-Status
                $why = $fatal
                if (-not $why -and $netStreak -ge $netLimit) { $why = "нет связи с сервисом, попыток подряд без ответа: $netStreak ($lastNetErr)" }
                if (-not $why) { $why = 'пять файлов подряд остались без ответа' }
                Warn "Claude недоступен: $why."
                # Ключ не принят: его можно сразу ввести заново, отложенные файлы уйдут с новым ключом
                $again = $false
                if ($fatalStatus -eq 401 -and -not $script:AutoYes) {
                    if ($env:ANTHROPIC_API_KEY) { Say 'Ключ взят из переменной среды ANTHROPIC_API_KEY. Исправьте её значение и запустите программу снова.' }
                    elseif (Ask-YesNo 'Ввести ключ заново?') {
                        $newKey = Request-ApiKey
                        if ($newKey) { $script:Api.Key = $newKey; $again = $true }
                    }
                }
                if ($again) { $fatal = ''; $fatalStatus = 0; $failStreak = 0; $netStreak = 0; $hold = $false }
                elseif (Ask-YesNo 'Продолжить без Claude, по ключевым словам? Ответ «нет» остановит работу, её можно будет продолжить позже.') {
                    $useApi = $false; $fatal = ''; $fatalStatus = 0; $failStreak = 0; $netStreak = 0; $hold = $false
                    foreach ($x in $retry) {
                        $rec = $x.Item.Rec
                        $an = Get-KeywordAnalysis $rec.name $rec.ext $x.Item.Content.Text 'Claude недоступен' $x.Item.Content.Html
                        $an.fp = 'повтор'
                        Set-RecordResult $rec $an 'new' ''
                        $done++
                    }
                    $retry.Clear()
                } else { $stopped = $true; break }
            }

            # --- 3. Новые запросы
            $local = 0
            while (-not $hold -and $inflight.Count -lt $maxPar -and (Get-Date) -ge $pauseUntil -and $local -lt 25) {
                $item = $null
                for ($i = 0; $i -lt $retry.Count; $i++) {
                    if ((Get-Date) -ge $retry[$i].NotBefore) { $item = $retry[$i].Item; $retry.RemoveAt($i); break }
                }
                if (-not $item) {
                    if ($idx -ge $work.Count) { break }
                    # Пока связь не восстановилась, новые файлы не отправляются: ждём повторов
                    if ($useApi -and $netStreak -ge $maxPar -and $retry.Count -gt 0) { break }
                    $rec = $work[$idx]; $idx++
                    if ($rec.hash -and -not (Find-DspMark $rec.name)) {
                        $hit = Get-ApiCache $rec.hash $fp
                        if ($hit) {
                            # Такой же файл уже разобран в этом запуске: второй раз в Claude не отправляется
                            $an = @{}
                            foreach ($k in @($hit.Keys)) { $an[$k] = $hit[$k] }
                            Set-RecordResult $rec $an 'new' ''
                            $done++; $local++; $progress = $true
                            continue
                        }
                        if ($busyHash.ContainsKey($rec.hash)) { [void]$deferred.Add($rec); $local++; continue }
                    }
                    $d = $null
                    try { $d = Get-LocalDecision $rec $useApi }
                    catch {
                        $msg = 'не удалось обработать файл: ' + (Get-ErrText $_)
                        Write-Log "  $($rec.rel): $msg"
                        Set-RecordResult $rec (New-LocalAnalysis 'не анализировался' $script:Cfg.ReviewFolder 0 $msg) 'new' $msg
                        $d = @{ Send = $false }
                    }
                    $progress = $true
                    if (-not $d.Send) { $done++; $local++; continue }
                    $item = @{ Rec = $rec; Content = $d.Content; Attempt = 0; Revalidate = $false; Drop = $false; Net = $null }
                }
                if (-not $useApi) {
                    $an = Get-KeywordAnalysis $item.Rec.name $item.Rec.ext $item.Content.Text 'Claude не использовался' $item.Content.Html
                    $an.fp = 'повтор'
                    Set-RecordResult $item.Rec $an 'new' ''
                    $done++; $local++
                    continue
                }
                try {
                    $json = Build-RequestBody $item.Rec $item.Content $item.Drop @($script:VndNames) @($script:InsNames)
                    $item.Net = Start-ApiRequest $json
                    [void]$inflight.Add($item)
                    if ($item.Rec.hash) { $busyHash[$item.Rec.hash] = $true }
                } catch {
                    # Соединение не установилось: считаем сетевой ошибкой и повторяем позже
                    $msg = Get-ErrText $_
                    $netStreak++; $lastNetErr = $msg
                    if ($item.Attempt -lt $maxRetry) {
                        $wait = $backoff[[Math]::Min($item.Attempt, $backoff.Count - 1)]
                        $item.Attempt++
                        [void]$retry.Add(@{ Item = $item; NotBefore = (Get-Date).AddSeconds($wait) })
                        Write-Log "  $($item.Rec.rel): нет соединения ($msg); повтор через $wait с"
                    } else {
                        $script:Usage.Failed++
                        $failStreak++
                        $an = Get-KeywordAnalysis $item.Rec.name $item.Rec.ext $item.Content.Text ('Claude недоступен: ' + $msg) $item.Content.Html
                        $an.fp = 'повтор'
                        Set-RecordResult $item.Rec $an 'new' ''
                        $done++
                    }
                    break
                }
            }

            # --- 4. Завершение и ожидание
            if ($inflight.Count -eq 0 -and $retry.Count -eq 0 -and $idx -ge $work.Count -and $deferred.Count -eq 0) { break }
            Show-AnalysisStatus $done $total $inflight.Count $started
            # Ответы Claude сразу пишутся в файл сохранённых ответов, поэтому база сохраняется нечасто
            if (((Get-Date) - $lastSave).TotalSeconds -gt 180) { Save-Db; $lastSave = Get-Date }
            if (-not $progress) {
                if ($inflight.Count -gt 0) {
                    $tasks = [Threading.Tasks.Task[]]@($inflight | ForEach-Object { $_.Net.Task })
                    [void][Threading.Tasks.Task]::WaitAny($tasks, 200)
                } else { Start-Sleep -Milliseconds 200 }
            }
        }
    } finally {
        Clear-Status
        foreach ($x in $inflight) { try { $x.Net.Req.Abort() } catch { } }
        Save-Db
    }

    $u = $script:Usage
    Say ("  Обработано файлов: {0} из {1}. Запросов к Claude: {2}, из них без ответа: {3}." -f $done, $total, $u.Requests, $u.Failed)
    if ($u.Requests -gt 0) {
        Say ("  Токены: входные {0}, из кэша {1}, записано в кэш {2}, выходные {3}." -f $u.Input, $u.CacheRead, $u.CacheWrite, $u.Output)
    }
    if ($stopped) { Warn 'Анализ остановлен. Уже обработанные файлы сохранены, при следующем запуске работа продолжится с этого места.'; return $false }
    return $true
}
