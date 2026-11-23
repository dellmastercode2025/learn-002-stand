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
