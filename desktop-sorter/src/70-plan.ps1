# =====================================================================
#  План разбора: папка назначения и новое имя для каждого файла
# =====================================================================

function Get-YearFromText([string]$s) {
    # Год из даты вида 12.03.2025 или 2025-03-12; 0, если года нет
    if (-not $s) { return 0 }
    $max = (Get-Date).Year + 3
    foreach ($m in [regex]::Matches($s, '(?<!\d)(19[89]\d|20\d\d)(?!\d)')) {
        $y = [int]$m.Value
        if ($y -ge 1980 -and $y -le $max) { return $y }
    }
    return 0
}

function Get-MtimeYear($rec) { return (ConvertFrom-TicksText $rec.mtime).ToLocalTime().Year }

function Get-DefaultCertKind {
    foreach ($k in $script:Cfg.CertKinds) { if ($k.Name -eq 'Прочие') { return $k.Name } }
    return $script:Cfg.CertKinds[$script:Cfg.CertKinds.Count - 1].Name
}

function Expand-FolderTemplate($template, $rec, $an) {
    # Заполняет подстановки в пути папки. Возвращает '' если нужных сведений нет.
    $parts = New-Object System.Collections.ArrayList
    foreach ($s in $template.Segs) {
        $v = $s
        if ($s -eq '{год договора}') {
            $y = Get-YearFromText (Get-Str $an 'doc_date')
            if ($y -eq 0) { $y = Get-MtimeYear $rec }
            $v = [string]$y
        } elseif ($s -eq '{год страхования}') {
            $y = Get-YearFromText (Get-Str $an 'insurance_start')
            if ($y -eq 0) { $y = Get-MtimeYear $rec }
            $v = [string]$y
        } elseif ($s -eq '{год изменения}') { $v = [string](Get-MtimeYear $rec) }
        elseif ($s -eq '{вид сертификата}') {
            $v = Get-Str $an 'cert_kind'
            if (-not $v) { $v = Get-DefaultCertKind }
        } elseif ($s -eq '{вид страхования}') {
            $v = Resolve-InsKind (Get-Str $an 'insurance_kind')
            if (-not $v) { $v = 'Другие виды страхования' }
        } elseif ($s -eq '{наименование ВНД}') {
            $v = Add-VndName (Get-Str $an 'vnd_name')
            if (-not $v) { return '' }
        } elseif ($s.StartsWith('{')) { return '' }
        [void]$parts.Add($v)
    }
    return ($parts -join '\')
}

function Test-NoRenameDir([string]$dir) {
    foreach ($p in $script:Cfg.NoRename) { if (Test-RelUnder $dir $p) { return $true } }
    return $false
}

function Get-CounterpartyKey([string]$s) {
    # Название контрагента без организационно-правовой формы, для сравнения
    $k = ' ' + (Get-NormKey $s) + ' '
    foreach ($w in @('тоо', 'ао', 'ооо', 'зао', 'пао', 'оао', 'ип', 'жшс', 'ақ', 'нао', 'гкп', 'ргп', 'llp', 'llc', 'ltd', 'limited', 'inc', 'co', 'company', 'corp', 'gmbh', 'plc', 'sa', 'bv', 'pte')) {
        $k = $k.Replace(" $w ", ' ')
    }
    return ($k -replace '\s+', ' ').Trim()
}

function Get-WordSet([string]$s) {
    $set = @{}
    foreach ($w in ((Get-NormKey $s) -split ' ')) { if ($w.Length -ge 4) { $set[$w] = $true } }
    return $set
}

function Find-ConclusionGroups($rows) {
    # Заключение по рискам и договор, которые лежат в одной папке и относятся к одной теме
    # (тот же контрагент или тот же номер документа), кладутся в отдельную общую папку.
    $concFolder = Get-StaticPrefix $script:Cfg.GroupTemplate
    $byDir = @{}
    foreach ($row in $rows) {
        if ($row.Kind -ne 'file' -or -not $row.Movable -or -not $row.An) { continue }
        $d = (Get-RelParent $row.Rec.rel).ToLowerInvariant()
        if (-not $byDir.ContainsKey($d)) { $byDir[$d] = New-Object System.Collections.ArrayList }
        [void]$byDir[$d].Add($row)
    }
    $used = @{}
    foreach ($d in @($byDir.Keys)) {
        $list = $byDir[$d]
        $concs = @($list | Where-Object { [string]::Equals($_.Template, $concFolder, [StringComparison]::OrdinalIgnoreCase) -and -not (Get-Val $_.An 'is_conclusion_attachment' $false) })
        if ($concs.Count -eq 0) { continue }
        $assign = @{}
        foreach ($row in $list) {
            if ($concs -contains $row) { continue }
            $isAttach = [bool](Get-Val $row.An 'is_conclusion_attachment' $false)
            $isContract = ($row.Template -like '*{год договора}*')
            if (-not $isAttach -and -not $isContract) { continue }
            $ck = Get-CounterpartyKey (Get-Str $row.An 'counterparty')
            $num = Get-NormKey (Get-Str $row.An 'doc_number')
            $matches2 = New-Object System.Collections.ArrayList
            foreach ($c in $concs) {
                $cck = Get-CounterpartyKey (Get-Str $c.An 'counterparty')
                $cnum = Get-NormKey (Get-Str $c.An 'doc_number')
                $same = $false
                if ($ck -and $cck -and ($ck -eq $cck -or ($ck.Length -ge 4 -and $cck.Contains($ck)) -or ($cck.Length -ge 4 -and $ck.Contains($cck)))) { $same = $true }
                if ($num -and $cnum -and $num -eq $cnum) { $same = $true }
                if ($isAttach -and $concs.Count -eq 1) { $same = $true }
                if ($same) { [void]$matches2.Add($c) }
            }
            if ($matches2.Count -eq 1) { $assign[$row.Rec.id] = $matches2[0] }
            elseif ($matches2.Count -gt 1) {
                # Несколько подходящих заключений: выбираем по совпадению слов в предмете, иначе не объединяем
                $mine = Get-WordSet ((Get-Str $row.An 'subject') + ' ' + (Get-Str $row.An 'title'))
                $best = $null; $bestN = 0; $tie = $false
                foreach ($c in $matches2) {
                    $theirs = Get-WordSet ((Get-Str $c.An 'subject') + ' ' + (Get-Str $c.An 'title'))
                    $n = 0
                    foreach ($w in $mine.Keys) { if ($theirs.ContainsKey($w)) { $n++ } }
                    if ($n -gt $bestN) { $bestN = $n; $best = $c; $tie = $false } elseif ($n -eq $bestN) { $tie = $true }
                }
                if ($best -and $bestN -gt 0 -and -not $tie) { $assign[$row.Rec.id] = $best }
            }
        }
        foreach ($c in $concs) {
            $members = @($list | Where-Object { $assign.ContainsKey($_.Rec.id) -and $assign[$_.Rec.id] -eq $c })
            if ($members.Count -eq 0) { continue }
            $title = Get-Str $c.An 'title'
            if (-not $title) { $title = Get-NameNoExt $c.Rec.name }
            $name = Limit-Text (ConvertTo-SafeName $title) (Get-OptInt 'МаксДлинаПапкиВНД')
            if (-not $name) { continue }
            $base = $name; $n = 2
            while ($used.ContainsKey($name.ToLowerInvariant()) -or [IO.Directory]::Exists((Join-Rel $script:Root (Join-RelParts $concFolder $name)))) {
                $name = "$base ($n)"; $n++
            }
            $used[$name.ToLowerInvariant()] = $true
            $dir = Join-RelParts $concFolder $name
            $c.DstDir = $dir; $c.Group = $name
            foreach ($m in $members) { $m.DstDir = $dir; $m.Group = $name; $m.Note = (($m.Note + ' идёт вместе с заключением').Trim()) }
        }
    }
}

function Get-PlannedName($rec, $an, [bool]$noRename) {
    # Имя по шаблону «Название ДД-ММ-ГГГГ.расширение». Возвращает @{ Name; Base }
    $name = $rec.name
    if ($noRename) { return @{ Name = $name; Base = '' } }
    $ext = ''
    $i = $name.LastIndexOf('.')
    $stem = $name
    if ($i -gt 0) { $ext = $name.Substring($i); $stem = $name.Substring(0, $i) }
    $stamp = Get-DateStamp $rec.mtime
    $core = $stem
    $m = [regex]::Match($stem, '^(.*\S)\s+(\d{2}-\d{2}-\d{4})$')
    if ($m.Success) {
        if ($m.Groups[2].Value -eq $stamp) {
            # Файл уже назван по шаблону, повторно не переименовывается
            return @{ Name = $name; Base = $m.Groups[1].Value }
        }
        if ($rec.nameBase -and [string]::Equals($m.Groups[1].Value, $rec.nameBase, [StringComparison]::OrdinalIgnoreCase)) {
            # Название присвоила программа, а файл с тех пор изменился: обновляется только дата
            $core = $m.Groups[1].Value
        }
        # иначе дата в имени - это дата самого документа, она сохраняется
    }
    $informative = -not (Test-BadName $core)
    if ($an -and $informative -and (Get-Str $an 'method') -eq 'Claude' -and -not [bool](Get-Val $an 'name_informative' $true) -and -not $rec.nameBase) { $informative = $false }
    if (-not $informative -and $an) {
        $t = ConvertTo-SafeName (Get-Str $an 'title')
        if ($t) { $core = $t }
    }
    $core = ConvertTo-SafeName $core
    if (-not $core) { $core = 'Файл' }
    return @{ Name = ($core + ' ' + $stamp + $ext); Base = $core; Stamp = $stamp; Ext = $ext }
}

function Resolve-TargetName([string]$dstDir, [string]$base, [string]$stamp, [string]$ext, [string]$selfRel, $taken) {
    # Подбирает имя без совпадений и в пределах допустимой длины пути.
    # Возвращает @{ Name; Base } или @{ Error }.
    $maxPath = Get-OptInt 'МаксДлинаПути'
    $tail = ''
    if ($stamp) { $tail = ' ' + $stamp }
    # Для одинаковых названий запоминается последний выданный номер, чтобы не перебирать их заново
    $seqKey = ($dstDir + '|' + $base + '|' + $tail + '|' + $ext).ToLowerInvariant()
    $n = 1
    if ($script:NameSeq.ContainsKey($seqKey)) { $n = [int]$script:NameSeq[$seqKey] + 1 }
    $limit = $n + 5000
    while ($n -lt $limit) {
        $b = $base
        $suffix = ''
        if ($n -gt 1) { $suffix = " ($n)" }
        $room = $maxPath - ($script:Root.Length + 1 + $dstDir.Length + 1 + $suffix.Length + $tail.Length + $ext.Length)
        if ($room -lt 8) { return @{ Error = 'путь к файлу получается длиннее допустимого' } }
        if ($b.Length -gt $room) { $b = (Limit-Text $b $room) }
        $name = $b + $suffix + $tail + $ext
        $rel = Join-RelParts $dstDir $name
        $key = $rel.ToLowerInvariant()
        $free = $true
        if ($taken.ContainsKey($key)) { $free = $false }
        elseif (-not [string]::Equals($rel, $selfRel, [StringComparison]::OrdinalIgnoreCase) -and [IO.File]::Exists((Join-Rel $script:Root $rel))) { $free = $false }
        if ($free) { $taken[$key] = $true; $script:NameSeq[$seqKey] = $n; return @{ Name = $name; Base = ($b + $suffix) } }
        $n++
    }
    return @{ Error = 'не удалось подобрать свободное имя' }
}

function New-PlanRow($rec, [string]$kind) {
    return @{
        Rec = $rec; Kind = $kind; An = $rec.an; Movable = $false; Template = ''
        DstDir = (Get-RelParent $rec.rel); DstName = $rec.name; Base = ''
        Action = 'нет'; Note = ''; Group = ''; Unit = $null
    }
}

$script:NameSeq = @{}

function Build-Plan {
    # Возвращает список строк плана
    $script:NameSeq = @{}
    $thr = Get-OptNum 'ПорогУверенности'
    $rows = New-Object System.Collections.ArrayList
    $byRel = @{}
    # Папки инструментов, которые уже лежат в папках инструментов: их файлы не перемещаются
    $placedUnits = @{}
    foreach ($u in $script:Scan.Units) { if ($u.Kind -eq 'tool' -and $u.ContainsKey('Placed') -and $u.Placed) { $placedUnits[$u.Folder.ToLowerInvariant()] = $true } }
    foreach ($id in @($script:Db.Records.Keys | Sort-Object { $script:Db.Records[$_].rel })) {
        $rec = $script:Db.Records[$id]
        if ($rec.missing) { continue }
        if ($rec.unit -and -not $rec.unitMain) { continue }
        $row = New-PlanRow $rec 'file'
        $byRel[$rec.rel.ToLowerInvariant()] = $row
        [void]$rows.Add($row)
        if ($rec.attachedTo) { $row.Kind = 'attached'; continue }
        if ($rec.status -eq 'dsp') { $row.Note = 'документ ДСП: не отправлялся, не перемещается и не переименовывается'; continue }
        if ($rec.status -eq 'locked') { $row.Note = $rec.reason; continue }
        $an = $rec.an
        if (-not $an) { $row.Note = 'файл не проанализирован'; continue }
        $note = Get-Str $an 'note'
        if ($note) { $row.Note = $note }
        if ($rec.unit -and $placedUnits.ContainsKey($rec.unit.ToLowerInvariant())) { $row.KeepDir = $true; continue }
        if ($rec.placed) {
            # Файл уже лежит на своём месте (разложен раньше или положен вами): папка не меняется
            $row.Template = ''
            $row.Movable = $false
            $row.KeepDir = $true
            continue
        }
        $row.Movable = $true
        $folder = Get-Str $an 'folder'
        $conf = [double](Get-Val $an 'confidence' 0)
        if ($rec.status -eq 'protected') { $row.Template = $script:Cfg.ProtectedFolder; $row.DstDir = $script:Cfg.ProtectedFolder; continue }
        if (-not $folder -or $folder -eq $script:Cfg.ReviewFolder) { $row.Template = $script:Cfg.ReviewFolder; $row.DstDir = $script:Cfg.ReviewFolder; continue }
        if ($conf -lt $thr) {
            $row.Template = $script:Cfg.ReviewFolder; $row.DstDir = $script:Cfg.ReviewFolder
            $row.Note = (("уверенность {0:N2} ниже порога, предлагалась папка «{1}». " -f $conf, $folder) + $row.Note).Trim()
            continue
        }
        $t = Get-FolderTemplate $folder
        if (-not $t) { $row.Template = $script:Cfg.ReviewFolder; $row.DstDir = $script:Cfg.ReviewFolder; $row.Note = "папки «$folder» больше нет в настройках"; continue }
        $dir = Expand-FolderTemplate $t $rec $an
        if (-not $dir) {
            $row.Template = $script:Cfg.ReviewFolder; $row.DstDir = $script:Cfg.ReviewFolder
            $row.Note = (("не удалось определить документ, к которому относится файл (папка «{0}»). " -f $folder) + $row.Note).Trim()
            continue
        }
        $row.Template = $t.Path
        $row.DstDir = $dir
        # Проверка по перечню судов
        $vessel = Get-Str $an 'vessel'
        if ($vessel -and $script:Cfg.Fleet.Count -gt 0) {
            $own = Find-FleetVessel $vessel (Get-Str $an 'vessel_imo')
            $third = ($t.Path -like 'Сторонние проекты*')
            if ($third -and $own) {
                $row.Template = $script:Cfg.ReviewFolder; $row.DstDir = $script:Cfg.ReviewFolder
                $row.Note = ("судно «$vessel» есть в перечне судов КМТФ, а документ отнесён к сторонним проектам. " + $row.Note).Trim()
            } elseif (-not $third -and -not $own) {
                $row.Note = ("судна «$vessel» нет в перечне судов КМТФ, проверьте папку. " + $row.Note).Trim()
            }
        }
    }

    Find-ConclusionGroups $rows

    # --- Папки, которые переносятся целиком
    foreach ($u in $script:Scan.Units) {
        if ($u.Kind -eq 'tool') {
            if ($u.ContainsKey('Placed') -and $u.Placed) { continue }
            $key = $u.Main.ToLowerInvariant()
            if (-not $byRel.ContainsKey($key)) { continue }
            $row = $byRel[$key]
            $row.Kind = 'unit'; $row.Unit = $u
        } elseif ($u.Kind -eq 'page') {
            $key = $u.Main.ToLowerInvariant()
            if ($byRel.ContainsKey($key)) { $byRel[$key].Unit = $u; $byRel[$key].Kind = 'page' }
        }
    }

    # --- Имена и действия
    $taken = @{}
    foreach ($row in $rows) {
        $rec = $row.Rec
        if ($row.Kind -eq 'attached') { continue }
        if (-not $row.Movable -and -not ($row.ContainsKey('KeepDir') -and $row.KeepDir)) { continue }
        $srcDir = Get-RelParent $rec.rel
        if ($row.Kind -eq 'unit') {
            # Папка инструмента переносится целиком и не переименовывается
            $folderName = Get-RelName $row.Unit.Folder
            $dst = Join-RelParts $row.DstDir $folderName
            if ([string]::Equals($dst, $row.Unit.Folder, [StringComparison]::OrdinalIgnoreCase)) { $row.Action = 'нет'; continue }
            if ($taken.ContainsKey($dst.ToLowerInvariant()) -or [IO.Directory]::Exists((Join-Rel $script:Root $dst))) {
                $row.Action = 'нет'; $row.Movable = $false
                $row.Note = ("в папке «$($row.DstDir)» уже есть папка «$folderName», инструмент оставлен на месте. " + $row.Note).Trim()
                continue
            }
            $taken[$dst.ToLowerInvariant()] = $true
            $row.UnitDst = $dst
            $row.DstName = $rec.name
            $row.Action = 'перенос папки целиком'
            continue
        }
        $noRename = ($row.Kind -eq 'page') -or (Test-NoRenameDir $row.DstDir) -or ($rec.status -eq 'unit')
        $pn = Get-PlannedName $rec $row.An $noRename
        if ($noRename) {
            $res = Resolve-TargetName $row.DstDir (Get-NameNoExt $rec.name) '' (Get-ExtRaw $rec.name) $rec.rel $taken
        } elseif ($pn.ContainsKey('Stamp')) {
            $res = Resolve-TargetName $row.DstDir $pn.Base $pn.Stamp $pn.Ext $rec.rel $taken
        } else {
            # Имя уже по шаблону: оставляем как есть, проверяя только совпадения в новой папке
            $ext = Get-ExtRaw $rec.name
            $stem = $rec.name.Substring(0, $rec.name.Length - $ext.Length)
            $res = Resolve-TargetName $row.DstDir $stem '' $ext $rec.rel $taken
            if (-not $res.ContainsKey('Error')) { $res.Base = $pn.Base }
        }
        if ($res.ContainsKey('Error')) { $row.Action = 'нет'; $row.Movable = $false; $row.Note = ($res.Error + '. ' + $row.Note).Trim(); $row.DstDir = $srcDir; continue }
        $row.DstName = $res.Name
        $row.Base = $res.Base
        if ($row.Kind -eq 'page' -and $row.DstName -ne $rec.name) {
            # Сохранённую страницу переименовывать нельзя: перестанут работать ссылки на её папку
            $row.Action = 'нет'; $row.Movable = $false; $row.DstDir = $srcDir; $row.DstName = $rec.name
            $row.Note = ('в папке назначения уже есть страница с таким именем, оставлена на месте. ' + $row.Note).Trim()
            continue
        }
        $sameDir = [string]::Equals($row.DstDir, $srcDir, [StringComparison]::OrdinalIgnoreCase)
        $sameName = ($row.DstName -ceq $rec.name)
        if ($sameDir -and $sameName) { $row.Action = 'нет' }
        elseif ($sameDir) { $row.Action = 'переименование' }
        elseif ($sameName) { $row.Action = 'перемещение' }
        else { $row.Action = 'перемещение и переименование' }
        if ($row.Kind -eq 'page' -and $row.Action -ne 'нет') { $row.Action = 'перенос страницы с её папкой' }
    }

    # --- Файлы запуска идут за своим инструментом
    foreach ($row in $rows) {
        if ($row.Kind -ne 'attached') { continue }
        $key = $row.Rec.attachedTo.ToLowerInvariant()
        if (-not $byRel.ContainsKey($key)) { continue }
        $main = $byRel[$key]
        $row.DstDir = $main.DstDir
        $row.Note = "файл запуска инструмента «$($main.Rec.name)», переносится вместе с ним"
        $srcDir = Get-RelParent $row.Rec.rel
        if ($main.Action -eq 'нет' -or [string]::Equals($row.DstDir, $srcDir, [StringComparison]::OrdinalIgnoreCase)) { $row.DstDir = $srcDir; continue }
        $ext = Get-ExtRaw $row.Rec.name
        $stem = $row.Rec.name.Substring(0, $row.Rec.name.Length - $ext.Length)
        $res = Resolve-TargetName $row.DstDir $stem '' $ext $row.Rec.rel $taken
        if ($res.ContainsKey('Error') -or $res.Name -ne $row.Rec.name) { $row.DstDir = $srcDir; $row.Note += '; в папке назначения есть файл с таким именем, оставлен на месте'; continue }
        $row.Movable = $true
        $row.Action = 'перемещение'
    }
    return ,($rows.ToArray())
}

function Get-ExtRaw([string]$name) {
    $i = $name.LastIndexOf('.')
    if ($i -le 0) { return '' }
    return $name.Substring($i)
}
