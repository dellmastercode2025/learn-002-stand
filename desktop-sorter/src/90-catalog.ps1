# =====================================================================
#  Каталог: данные по всем файлам, HTML-страница и описание инструментов
# =====================================================================

function Format-TicksLocal([string]$ticks) {
    $d = ConvertFrom-TicksText $ticks
    if ($d -eq [datetime]::MinValue) { return '' }
    return $d.ToLocalTime().ToString('yyyy-MM-dd HH:mm', $script:Inv)
}

function Get-CatalogData {
    # Сведения по каждому файлу (раздел 9 ТЗ). Ключи короткие, чтобы файл каталога был меньше.
    $files = New-Object System.Collections.ArrayList
    $epoch = New-Object datetime(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
    foreach ($id in @($script:Db.Records.Keys | Sort-Object { $script:Db.Records[$_].rel })) {
        $rec = $script:Db.Records[$id]
        if ($rec.missing) { continue }
        $an = $rec.an
        $dir = Get-RelParent $rec.rel
        $how = Get-Str $an 'method'
        if ($rec.placedBy -eq 'пользователь' -and $how) { $how += ', папка выбрана вручную' }
        elseif ($rec.placedBy -eq 'пользователь') { $how = 'папка выбрана вручную' }
        $state = ''
        $note = Get-Str $an 'note'
        if ($rec.status -eq 'dsp') { $state = 'dsp'; $how = 'не анализировался' }
        elseif ($rec.status -eq 'protected') { $state = 'protected' }
        elseif ($rec.status -eq 'locked') { $state = 'locked'; $note = $rec.reason }
        elseif ($rec.status -eq 'unit') { $state = 'unit'; $note = 'файл из папки, которая хранится целиком'; $how = 'не анализировался' }
        elseif ($rec.status -eq 'attached') { $state = 'unit'; $note = 'файл запуска инструмента'; $how = 'не анализировался' }
        if (Test-RelUnder $dir $script:Cfg.ReviewFolder) { $state = 'review' }
        $conf = $null
        if ($an -and (Get-Str $an 'method') -ne 'не анализировался') { $conf = [Math]::Round([double](Get-Val $an 'confidence' 0), 2) }
        $mt = ConvertFrom-TicksText $rec.mtime
        $ms = [long]0
        if ($mt -ne [datetime]::MinValue) { $ms = [long](($mt - $epoch).TotalMilliseconds) }
        $ext = $rec.ext.TrimStart('.')
        [void]$files.Add([ordered]@{
            id = $rec.id
            n  = $rec.name
            o  = $rec.origName
            d  = $dir
            p  = (Join-Rel $script:Root $rec.rel)
            t  = (Get-Str $an 'doc_type')
            s  = (Get-Str $an 'description')
            k  = @(Get-Val $an 'keywords' @())
            c  = (Get-Str $an 'counterparty')
            v  = (Get-Str $an 'vessel')
            dd = (Get-Str $an 'doc_date')
            dn = (Get-Str $an 'doc_number')
            e  = $ext
            z  = $rec.size
            cr = (Format-TicksLocal $rec.ctime)
            m  = (Format-TicksLocal $rec.mtime)
            mt = $ms
            pr = $rec.processedAt
            w  = $how
            u  = $conf
            du = $rec.dupOf
            st = $state
            nt = $note
        })
    }
    return ,($files.ToArray())
}

function Read-LabelsJson {
    # Метки пользователя хранятся в _Каталог\labels.json и встраиваются в каталог при каждой пересборке
    $p = Get-ServicePath 'Labels'
    if (-not [IO.File]::Exists($p)) { return 'null' }
    try {
        $text = (Read-TextFile $p).Trim()
        $h = ConvertFrom-JsonText $text
        if (-not ($h -is [System.Collections.IDictionary])) { throw 'неверный формат' }
        return (ConvertTo-JsonText $h)
    } catch {
        Warn ('Файл меток labels.json не прочитан и в каталог не попал: ' + (Get-ErrText $_))
        return 'null'
    }
}

function Save-ToolsDoc {
    # В папках инструментов ведётся файл «Описание инструментов»: название, назначение, версия
    foreach ($tp in $script:ToolFolders) {
        $dir = Join-Rel $script:Root $tp
        if (-not [IO.Directory]::Exists($dir)) { continue }
        $items = New-Object System.Collections.ArrayList
        foreach ($rec in $script:Db.Records.Values) {
            if ($rec.missing) { continue }
            $parent = Get-RelParent $rec.rel
            $isTool = $false; $title = $rec.name
            if ([string]::Equals($parent, $tp, [StringComparison]::OrdinalIgnoreCase) -and ($script:ExtHtml -contains $rec.ext)) { $isTool = $true }
            elseif ($rec.unitMain -and $rec.unit -and [string]::Equals((Get-RelParent $rec.unit), $tp, [StringComparison]::OrdinalIgnoreCase) -and ($script:ExtHtml -contains $rec.ext)) {
                $isTool = $true; $title = (Get-RelName $rec.unit) + '\' + $rec.name
            }
            if (-not $isTool) { continue }
            $an = $rec.an
            $purpose = Get-Str $an 'tool_purpose'
            if (-not $purpose) { $purpose = Get-Str $an 'description' }
            $ver = Get-Str $an 'tool_version'
            if (-not $ver) { $ver = 'изменён ' + (ConvertFrom-TicksText $rec.mtime).ToLocalTime().ToString('dd.MM.yyyy', $script:Inv) }
            [void]$items.Add(@{ Title = $title; Purpose = $purpose; Version = $ver })
        }
        $sb = New-Object System.Text.StringBuilder
        [void]$sb.Append('<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Описание инструментов</title><style>body{font:15px/1.5 "Segoe UI",Arial,sans-serif;margin:24px;color:#1b1f24}h1{font-size:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d9dee5;padding:8px 10px;text-align:left;vertical-align:top}th{background:#eef2f7}p{color:#5b6470}</style></head><body>')
        [void]$sb.Append("<h1>Описание инструментов</h1><p>Папка «$(ConvertTo-HtmlText $tp)». Файл составляет программа разбора, он обновляется при каждом запуске. Обновлён $(Get-NowText).</p>")
        [void]$sb.Append('<table><thead><tr><th>Название</th><th>Назначение</th><th>Версия</th></tr></thead><tbody>')
        foreach ($it in @($items | Sort-Object { $_.Title })) {
            [void]$sb.Append("<tr><td>$(ConvertTo-HtmlText $it.Title)</td><td>$(ConvertTo-HtmlText $it.Purpose)</td><td>$(ConvertTo-HtmlText $it.Version)</td></tr>")
        }
        if ($items.Count -eq 0) { [void]$sb.Append('<tr><td colspan="3">Инструментов пока нет.</td></tr>') }
        [void]$sb.Append('</tbody></table></body></html>')
        try { Write-TextFile ([IO.Path]::Combine($dir, $script:FileNames.ToolsDoc)) $sb.ToString() $script:Utf8Bom }
        catch { Write-Log ('Описание инструментов не записано: ' + (Get-ErrText $_)) }
    }
}

function Build-Catalog {
    Say 'Сборка каталога…'
    $files = Get-CatalogData
    $built = Get-NowText
    $data = [ordered]@{ built = $built; root = $script:Root; review = $script:Cfg.ReviewFolder; files = $files }
    $json = ConvertTo-JsonText $data
    Write-TextFile (Get-ServicePath 'Catalog') $json $script:Utf8NoBom

    $tpl = [IO.Path]::Combine($script:ProgramDir, $script:FileNames.Template)
    if (-not [IO.File]::Exists($tpl)) {
        Fail "Не найден файл шаблона каталога «$($script:FileNames.Template)» рядом с программой. Каталог не собран."
        return
    }
    $html = Read-TextFile $tpl
    $labels = Read-LabelsJson
    foreach ($mark in @('/*__CATALOG_DATA__*/', '/*__CATALOG_LABELS__*/')) {
        if ($html.IndexOf($mark, [StringComparison]::Ordinal) -lt 0) { Fail 'Шаблон каталога повреждён: в нём нет места для данных.'; return }
    }
    $html = $html.Replace('/*__CATALOG_DATA__*/null', $json).Replace('/*__CATALOG_LABELS__*/null', $labels)
    $out = [IO.Path]::Combine($script:Root, $script:CatalogName)
    Write-TextFile $out $html $script:Utf8Bom
    Save-ToolsDoc
    Say ("  В каталоге файлов: {0}. Файл: {1}" -f $files.Count, $out)
}
