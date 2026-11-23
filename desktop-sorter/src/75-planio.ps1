# =====================================================================
#  Сохранение плана (HTML, XLSX, CSV) и чтение исправленного плана
# =====================================================================

function ConvertTo-XmlText([string]$s) {
    if (-not $s) { return '' }
    $t = $s -replace '[\x00-\x08\x0b\x0c\x0e-\x1f]', ' '
    return $t.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
}
function ConvertTo-HtmlText([string]$s) {
    if (-not $s) { return '' }
    return $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
}
function Get-ColName([int]$index) {
    # 0 -> A, 25 -> Z, 26 -> AA
    $n = $index + 1
    $s = ''
    while ($n -gt 0) {
        $r = ($n - 1) % 26
        $s = [string][char](65 + $r) + $s
        $n = [int][Math]::Floor(($n - 1) / 26)
    }
    return $s
}

function Add-ZipText($zip, [string]$name, [string]$text) {
    $e = $zip.CreateEntry($name)
    $st = $e.Open()
    try { $b = $script:Utf8NoBom.GetBytes($text); $st.Write($b, 0, $b.Length) } finally { $st.Dispose() }
}

function Write-Xlsx([string]$path, $sheets) {
    # Записывает книгу Excel напрямую (ZIP + XML), без запуска Excel.
    # $sheets: список @{ Name; Rows (массив массивов); Widths; Wrap (номера столбцов с переносом текста) }
    $tmp = $path + '.tmp'
    $fs = New-Object IO.FileStream($tmp, [IO.FileMode]::Create, [IO.FileAccess]::ReadWrite)
    $zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $ct = New-Object System.Text.StringBuilder
        [void]$ct.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>')
        $wb = New-Object System.Text.StringBuilder
        [void]$wb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>')
        $rels = New-Object System.Text.StringBuilder
        [void]$rels.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">')
        $n = 0
        foreach ($sh in $sheets) {
            $n++
            [void]$ct.Append("<Override PartName=`"/xl/worksheets/sheet$n.xml`" ContentType=`"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml`"/>")
            [void]$wb.Append("<sheet name=`"$(ConvertTo-HtmlText $sh.Name)`" sheetId=`"$n`" r:id=`"rId$n`"/>")
            [void]$rels.Append("<Relationship Id=`"rId$n`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet`" Target=`"worksheets/sheet$n.xml`"/>")

            $sb = New-Object System.Text.StringBuilder
            [void]$sb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>')
            $ci = 0
            foreach ($w in $sh.Widths) { $ci++; [void]$sb.Append("<col min=`"$ci`" max=`"$ci`" width=`"$w`" customWidth=`"1`"/>") }
            [void]$sb.Append('</cols><sheetData>')
            $ri = 0
            $cols = 0
            foreach ($row in $sh.Rows) {
                $ri++
                [void]$sb.Append("<row r=`"$ri`">")
                $c = 0
                foreach ($v in $row) {
                    $ref = (Get-ColName $c) + $ri
                    $style = 0
                    if ($ri -eq 1) { $style = 1 } elseif ($sh.Wrap -contains $c) { $style = 2 }
                    if ($null -ne $v -and ($v -is [double] -or $v -is [int] -or $v -is [long])) {
                        [void]$sb.Append("<c r=`"$ref`" s=`"$style`"><v>$(([double]$v).ToString('R', $script:Inv))</v></c>")
                    } else {
                        $t = ConvertTo-XmlText ([string]$v)
                        [void]$sb.Append("<c r=`"$ref`" t=`"inlineStr`" s=`"$style`"><is><t xml:space=`"preserve`">$t</t></is></c>")
                    }
                    $c++
                }
                if ($c -gt $cols) { $cols = $c }
                [void]$sb.Append('</row>')
            }
            [void]$sb.Append('</sheetData>')
            if ($ri -gt 1 -and $cols -gt 0) { [void]$sb.Append("<autoFilter ref=`"A1:$(Get-ColName ($cols - 1))$ri`"/>") }
            [void]$sb.Append('</worksheet>')
            Add-ZipText $zip "xl/worksheets/sheet$n.xml" $sb.ToString()
        }
        $styleId = $n + 1
        [void]$rels.Append("<Relationship Id=`"rId$styleId`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles`" Target=`"styles.xml`"/></Relationships>")
        [void]$wb.Append('</sheets></workbook>')
        [void]$ct.Append('</Types>')
        Add-ZipText $zip '[Content_Types].xml' $ct.ToString()
        Add-ZipText $zip '_rels/.rels' '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
        Add-ZipText $zip 'xl/workbook.xml' $wb.ToString()
        Add-ZipText $zip 'xl/_rels/workbook.xml.rels' $rels.ToString()
        Add-ZipText $zip 'xl/styles.xml' '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDE6F0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>'
    } finally {
        $zip.Dispose()
        $fs.Dispose()
    }
    if ([IO.File]::Exists($path)) { [IO.File]::Delete($path) }
    [IO.File]::Move($tmp, $path)
}

function Read-XlsxRows([string]$path) {
    # Читает первый лист книги целиком. Возвращает список строк: таблица «буква столбца -> текст».
    $zip = Open-ZipRead $path
    try {
        $wbPart = Get-MainPart $zip 'xl/workbook.xml'
        $i = $wbPart.LastIndexOf('/')
        $wbDir = ''; if ($i -ge 0) { $wbDir = $wbPart.Substring(0, $i) }
        $rels = Read-Rels $zip ($wbDir + '/_rels/' + $wbPart.Substring($i + 1) + '.rels')
        $rid = ''
        $e = Get-ZipEntry $zip $wbPart
        if (-not $e) { throw 'в файле нет книги Excel' }
        $st = $e.Open()
        try {
            $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
            while ($r.Read()) { if ($r.NodeType -eq $script:NtElement -and $r.LocalName -eq 'sheet') { $rid = Get-RelAttr $r; break } }
            $r.Dispose()
        } finally { $st.Dispose() }
        $sheetPart = ''; $sstPart = ''
        foreach ($rel in $rels) {
            if ($rid -and $rel.Id -eq $rid) { $sheetPart = Resolve-PartPath $wbDir $rel.Target }
            if ($rel.Type -like '*/sharedStrings') { $sstPart = Resolve-PartPath $wbDir $rel.Target }
        }
        if (-not $sheetPart) { $sheetPart = Resolve-PartPath $wbDir 'worksheets/sheet1.xml' }

        # Общие строки
        $sst = New-Object System.Collections.ArrayList
        if ($sstPart) {
            $e = Get-ZipEntry $zip $sstPart
            if ($e) {
                $st = $e.Open()
                try {
                    $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
                    $inT = $false; $skip = 0; $sb = $null
                    while ($r.Read()) {
                        $nt = $r.NodeType
                        if ($nt -eq $script:NtElement) {
                            $ln = $r.LocalName
                            if ($ln -eq 'si') { $sb = New-Object System.Text.StringBuilder; if ($r.IsEmptyElement) { [void]$sst.Add('') ; $sb = $null } }
                            elseif ($ln -eq 'rPh') { if (-not $r.IsEmptyElement) { $skip++ } }
                            elseif ($ln -eq 't' -and $skip -eq 0) { if (-not $r.IsEmptyElement) { $inT = $true } }
                        } elseif ($nt -eq $script:NtEnd) {
                            $ln = $r.LocalName
                            if ($ln -eq 't') { $inT = $false }
                            elseif ($ln -eq 'rPh') { if ($skip -gt 0) { $skip-- } }
                            elseif ($ln -eq 'si') { if ($sb) { [void]$sst.Add($sb.ToString()) }; $sb = $null }
                        } elseif ($inT -and $sb -and ($nt -eq $script:NtText -or $nt -eq $script:NtSws -or $nt -eq $script:NtWs -or $nt -eq $script:NtCData)) {
                            [void]$sb.Append($r.Value)
                        }
                    }
                    $r.Dispose()
                } finally { $st.Dispose() }
            }
        }

        $rows = New-Object System.Collections.ArrayList
        $e = Get-ZipEntry $zip $sheetPart
        if (-not $e) { throw 'в книге нет листа' }
        $st = $e.Open()
        try {
            $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
            $cur = $null; $cellType = ''; $col = ''; $inV = $false; $inIs = $false; $val = $null
            while ($r.Read()) {
                $nt = $r.NodeType
                if ($nt -eq $script:NtElement) {
                    $ln = $r.LocalName
                    if ($ln -eq 'row') { $cur = @{}; [void]$rows.Add($cur) }
                    elseif ($ln -eq 'c') {
                        $cellType = [string]$r.GetAttribute('t')
                        $col = ([string]$r.GetAttribute('r')) -replace '\d', ''
                        $val = New-Object System.Text.StringBuilder
                    }
                    elseif ($ln -eq 'v') { if (-not $r.IsEmptyElement) { $inV = $true } }
                    elseif ($ln -eq 'is') { $inIs = $true }
                    elseif ($ln -eq 't' -and $inIs) { if (-not $r.IsEmptyElement) { $inV = $true } }
                } elseif ($nt -eq $script:NtEnd) {
                    $ln = $r.LocalName
                    if ($ln -eq 'v' -or $ln -eq 't') { $inV = $false }
                    elseif ($ln -eq 'is') { $inIs = $false }
                    elseif ($ln -eq 'c') {
                        if ($null -ne $cur -and $null -ne $val -and $col) {
                            $v = $val.ToString()
                            if ($cellType -eq 's') { $k = 0; if ([int]::TryParse($v, [ref]$k) -and $k -ge 0 -and $k -lt $sst.Count) { $v = [string]$sst[$k] } else { $v = '' } }
                            $cur[$col] = $v
                        }
                        $val = $null
                    }
                } elseif ($inV -and $null -ne $val -and ($nt -eq $script:NtText -or $nt -eq $script:NtSws -or $nt -eq $script:NtWs -or $nt -eq $script:NtCData)) {
                    [void]$val.Append($r.Value)
                }
            }
            $r.Dispose()
        } finally { $st.Dispose() }
        return ,($rows.ToArray())
    } finally { $zip.Dispose() }
}

# ---------------------------------------------------------------------
#  Сохранение плана
# ---------------------------------------------------------------------
$script:PlanHead = @('№', 'Код', 'Исходная папка', 'Исходное имя', 'Папка назначения', 'Новое имя', 'Действие', 'Вид документа', 'Описание', 'Уверенность', 'Способ', 'Примечание')

function Get-PlanStats($rows) {
    $s = @{ Total = 0; Move = 0; Rename = 0; None = 0; Review = 0; Dsp = 0; Protected = 0; Locked = 0 }
    foreach ($row in $rows) {
        $s.Total++
        if ($row.Action -eq 'нет') { $s.None++ } elseif ($row.Action -eq 'переименование') { $s.Rename++ } else { $s.Move++ }
        if ($row.Action -ne 'нет' -and [string]::Equals($row.DstDir, $script:Cfg.ReviewFolder, [StringComparison]::OrdinalIgnoreCase)) { $s.Review++ }
        if ($row.Rec.status -eq 'dsp') { $s.Dsp++ }
        if ($row.Rec.status -eq 'protected') { $s.Protected++ }
        if ($row.Rec.status -eq 'locked') { $s.Locked++ }
    }
    return $s
}

function Save-Plan($rows) {
    $created = Get-NowText
    # --- plan.json: по нему выполняется план
    $list = New-Object System.Collections.ArrayList
    foreach ($row in $rows) {
        $rec = $row.Rec
        $o = [ordered]@{
            id = $rec.id; src = $rec.rel; kind = $row.Kind; dstDir = $row.DstDir; dstName = $row.DstName; base = $row.Base
            action = $row.Action; note = $row.Note; group = $row.Group
            size = $rec.size; mtime = $rec.mtime; hash = $rec.hash; unitSrc = ''; unitDst = ''
        }
        if ($row.Unit) { $o.unitSrc = $row.Unit.Folder }
        if ($row.ContainsKey('UnitDst')) { $o.unitDst = $row.UnitDst }
        [void]$list.Add($o)
    }
    $skipped = @($script:Scan.Skipped | ForEach-Object { [ordered]@{ rel = $_.Rel; reason = $_.Reason } })
    $plan = [ordered]@{ run = $script:RunId; created = $created; root = $script:Root; rows = $list.ToArray(); skipped = $skipped }
    Write-TextFile (Get-ServicePath 'PlanJson') (ConvertTo-JsonText $plan) $script:Utf8NoBom

    # --- Таблица для Excel
    $table = New-Object System.Collections.ArrayList
    [void]$table.Add($script:PlanHead)
    $n = 0
    foreach ($row in $rows) {
        $n++
        $rec = $row.Rec; $an = $row.An
        $conf = ''
        if ($an -and (Get-Str $an 'method') -ne 'не анализировался') { $conf = [double](Get-Val $an 'confidence' 0) }
        $dstDir = $row.DstDir; $dstName = $row.DstName
        if ($row.Action -eq 'нет') { $dstDir = ''; $dstName = '' }
        [void]$table.Add(@($n, $rec.id, (Get-RelParent $rec.rel), $rec.name, $dstDir, $dstName, $row.Action, (Get-Str $an 'doc_type'), (Get-Str $an 'description'), $conf, (Get-Str $an 'method'), $row.Note))
    }
    $folders = New-Object System.Collections.ArrayList
    [void]$folders.Add(@('Папки структуры (в столбце «Папка назначения» можно указывать только их)', 'Что попадает'))
    foreach ($t in $script:Cfg.Folders) { [void]$folders.Add(@($t.Path, $t.Desc)) }
    [void]$folders.Add(@($script:Cfg.ReviewFolder, 'Файлы, которые не удалось уверенно отнести ни к одной папке'))
    [void]$folders.Add(@($script:Cfg.ProtectedFolder, 'Файлы, защищённые паролем'))
    $skip = New-Object System.Collections.ArrayList
    [void]$skip.Add(@('Папка', 'Почему не разбирается'))
    foreach ($s in $script:Scan.Skipped) { [void]$skip.Add(@($s.Rel, $s.Reason)) }
    $sheets = @(
        @{ Name = 'План'; Rows = $table.ToArray(); Widths = @(6, 14, 34, 44, 44, 50, 26, 20, 60, 12, 16, 50); Wrap = @(8, 11) },
        @{ Name = 'Папки'; Rows = $folders.ToArray(); Widths = @(80, 110); Wrap = @(1) },
        @{ Name = 'Пропущено'; Rows = $skip.ToArray(); Widths = @(70, 70); Wrap = @() }
    )
    $xlsx = Get-ServicePath 'PlanXlsx'
    try { Write-Xlsx $xlsx $sheets }
    catch { Warn ('Файл плана для Excel не записан (возможно, он открыт в Excel): ' + (Get-ErrText $_)) }

    # CSV нужен только там, где нет Excel
    if (-not (Test-OfficeApp 'Excel.Application')) {
        $sb = New-Object System.Text.StringBuilder
        foreach ($r in $table) { [void]$sb.Append((Format-CsvLine $r) + "`r`n") }
        try { Write-TextFile (Get-ServicePath 'PlanCsv') $sb.ToString() $script:Utf8Bom } catch { }
    }

    Save-PlanHtml $rows $created
}

function Save-PlanHtml($rows, [string]$created) {
    $st = Get-PlanStats $rows
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append(@'
<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>План разбора</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#1b1f24;--mut:#5b6470;--line:#d9dee5;--acc:#1f5fa8;--warn:#fff4d6;--none:#eef0f3;--dsp:#e6eefb;--err:#fde4e1}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 "Segoe UI",Arial,sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--card);border-bottom:1px solid var(--line);padding:16px 20px;position:sticky;top:0;z-index:2}
h1{font-size:20px;margin:0 0 6px}.sub{color:var(--mut);margin:0 0 10px}
.stats span{display:inline-block;margin:0 14px 4px 0}.stats b{font-size:16px}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.bar input{flex:1;min-width:220px;padding:7px 10px;border:1px solid var(--line);border-radius:6px;font:inherit}
.bar button{padding:7px 12px;border:1px solid var(--line);background:var(--card);border-radius:6px;font:inherit;cursor:pointer}
.bar button.on{background:var(--acc);border-color:var(--acc);color:#fff}
main{padding:14px 20px 40px}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line)}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left;word-break:break-word}
th{background:#eef2f7;position:sticky;top:0;font-weight:600}
td.n{color:var(--mut);white-space:nowrap}td.arrow{color:var(--mut)}
tr.none td{background:var(--none);color:#444}tr.review td{background:var(--warn)}tr.dsp td{background:var(--dsp)}tr.err td{background:var(--err)}
.note{color:var(--mut);font-size:13px}.how{color:var(--mut);font-size:12px}
h2{font-size:16px;margin:26px 0 8px}
</style></head><body>
'@)
    [void]$sb.Append("<header><h1>План разбора</h1><p class=`"sub`">Составлен $(ConvertTo-HtmlText $created). Папка: $(ConvertTo-HtmlText $script:Root). Пока план не применён, ни один файл не изменён.</p>")
    [void]$sb.Append("<div class=`"stats`"><span>Всего файлов: <b>$($st.Total)</b></span><span>Будет перемещено: <b>$($st.Move)</b></span><span>Только переименовано: <b>$($st.Rename)</b></span><span>В «$(ConvertTo-HtmlText $script:Cfg.ReviewFolder)»: <b>$($st.Review)</b></span><span>Остаются на месте: <b>$($st.None)</b></span><span>Документы ДСП: <b>$($st.Dsp)</b></span><span>С паролем: <b>$($st.Protected)</b></span></div>")
    [void]$sb.Append('<div class="bar"><input id="q" type="search" placeholder="Поиск по плану: имя, папка, описание"><button data-f="all" class="on">Все</button><button data-f="move">Перемещаются</button><button data-f="review">На разбор</button><button data-f="none">Остаются</button><button data-f="dsp">ДСП</button></div></header><main>')
    [void]$sb.Append('<table id="t"><thead><tr><th>№</th><th>Где лежит</th><th>Имя сейчас</th><th></th><th>Папка назначения</th><th>Новое имя</th><th>Описание</th><th>Уверенность</th><th>Примечание</th></tr></thead><tbody>')
    $n = 0
    foreach ($row in $rows) {
        $n++
        $rec = $row.Rec; $an = $row.An
        $cls = 'move'
        if ($rec.status -eq 'dsp') { $cls = 'dsp' }
        elseif ($row.Action -eq 'нет') { $cls = 'none' }
        elseif ([string]::Equals($row.DstDir, $script:Cfg.ReviewFolder, [StringComparison]::OrdinalIgnoreCase)) { $cls = 'review' }
        $conf = ''
        if ($an -and (Get-Str $an 'method') -ne 'не анализировался') { $conf = ('{0:N2}' -f [double](Get-Val $an 'confidence' 0)) }
        $src = Get-RelParent $rec.rel
        if (-not $src) { $src = '(корень)' }
        $dstDir = ConvertTo-HtmlText $row.DstDir; $dstName = ConvertTo-HtmlText $row.DstName; $arrow = '&rarr;'
        if ($row.Action -eq 'нет') { $dstDir = '<span class="note">остаётся на месте</span>'; $dstName = ''; $arrow = '' }
        $desc = ConvertTo-HtmlText (Get-Str $an 'description')
        $dt = Get-Str $an 'doc_type'
        if ($dt) { $desc = '<b>' + (ConvertTo-HtmlText $dt) + '.</b> ' + $desc }
        $how = Get-Str $an 'method'
        $note = ConvertTo-HtmlText $row.Note
        if ($how -and $how -ne 'Claude') { $note = ($note + ' <span class="how">[' + (ConvertTo-HtmlText $how) + ']</span>').Trim() }
        [void]$sb.Append("<tr class=`"$cls`"><td class=`"n`">$n</td><td>$(ConvertTo-HtmlText $src)</td><td>$(ConvertTo-HtmlText $rec.name)</td><td class=`"arrow`">$arrow</td><td>$dstDir</td><td>$dstName</td><td>$desc</td><td>$conf</td><td class=`"note`">$note</td></tr>`n")
    }
    [void]$sb.Append('</tbody></table>')
    if ($script:Scan.Skipped.Count -gt 0) {
        [void]$sb.Append('<h2>Папки, которые программа не разбирает</h2><p class="sub">Решите сами: перенести их вручную или добавить в список исключений в файле настроек.</p><table><thead><tr><th>Папка</th><th>Причина</th></tr></thead><tbody>')
        foreach ($s in $script:Scan.Skipped) { [void]$sb.Append("<tr><td>$(ConvertTo-HtmlText $s.Rel)</td><td>$(ConvertTo-HtmlText $s.Reason)</td></tr>") }
        [void]$sb.Append('</tbody></table>')
    }
    [void]$sb.Append(@'
</main><script>
(function(){var q=document.getElementById('q'),rows=[].slice.call(document.querySelectorAll('#t tbody tr')),f='all';
function run(){var s=q.value.trim().toLowerCase();rows.forEach(function(r){var ok=(f==='all'||r.className===f)&&(!s||r.textContent.toLowerCase().indexOf(s)>=0);r.style.display=ok?'':'none';});}
q.addEventListener('input',run);
[].slice.call(document.querySelectorAll('.bar button')).forEach(function(b){b.addEventListener('click',function(){f=b.getAttribute('data-f');[].slice.call(document.querySelectorAll('.bar button')).forEach(function(x){x.className=x===b?'on':'';});run();});});})();
</script></body></html>
'@)
    Write-TextFile (Get-ServicePath 'PlanHtml') $sb.ToString() $script:Utf8Bom
}

# ---------------------------------------------------------------------
#  Чтение сохранённого плана вместе с правками пользователя
# ---------------------------------------------------------------------
function ConvertTo-StructureDir([string]$value) {
    # Проверяет папку, которую пользователь вписал в план. Возвращает путь или '' если она вне структуры.
    $v = $value.Trim().Replace('/', '\').Trim('\')
    if (-not $v) { return '' }
    $parts = New-Object System.Collections.ArrayList
    foreach ($s in ($v -split '\\')) {
        $t = ConvertTo-SafeName $s
        if (-not $t -or $t -eq '..' -or $t -eq '.' -or $t.StartsWith('{')) { return '' }
        [void]$parts.Add($t)
    }
    $dir = $parts -join '\'
    if (-not (Test-InStructure $dir)) { return '' }
    return $dir
}

function Read-Plan {
    # Возвращает @{ Rows (список хеш-таблиц из plan.json с учётом правок); Edited; Rejected; Source }
    $pj = Get-ServicePath 'PlanJson'
    if (-not [IO.File]::Exists($pj)) { throw 'Сохранённого плана нет. Сначала выполните режим «Только план».' }
    $plan = ConvertFrom-JsonText (Read-TextFile $pj)
    if (-not [string]::Equals([string]$plan.root, $script:Root, [StringComparison]::OrdinalIgnoreCase)) {
        throw "План составлен для другой папки: $($plan.root)"
    }
    $rows = @($plan.rows)
    $byId = @{}
    foreach ($r in $rows) { $byId[[string]$r.id] = $r }

    # Таблица с правками: Excel, а если его нет - CSV
    $table = $null; $source = ''
    $xlsx = Get-ServicePath 'PlanXlsx'; $csv = Get-ServicePath 'PlanCsv'
    $useCsv = ([IO.File]::Exists($csv) -and (-not [IO.File]::Exists($xlsx) -or [IO.File]::GetLastWriteTimeUtc($csv) -gt [IO.File]::GetLastWriteTimeUtc($xlsx).AddSeconds(5)))
    if ($useCsv) {
        $source = $script:FileNames.PlanCsv
        $table = New-Object System.Collections.ArrayList
        $bytes = [IO.File]::ReadAllBytes($csv)
        $text = ConvertFrom-TextBytes $bytes
        if ($text.IndexOf([char]0xFFFD) -ge 0) { throw 'Файл плана CSV сохранён в неподходящей кодировке, русские буквы повреждены. Сохраните его как «CSV UTF-8».' }
        foreach ($line in ($text -split "`r?`n")) {
            if (-not $line.Trim()) { continue }
            $f = Split-CsvLine $line
            $h = @{}
            for ($i = 0; $i -lt $f.Count; $i++) { $h[(Get-ColName $i)] = $f[$i] }
            [void]$table.Add($h)
        }
    } elseif ([IO.File]::Exists($xlsx)) {
        $source = $script:FileNames.PlanXlsx
        try { $table = Read-XlsxRows $xlsx }
        catch { throw ('Файл плана «' + $script:FileNames.PlanXlsx + '» не читается: ' + (Get-ErrText $_) + '. Закройте его в Excel и повторите.') }
    }

    $edited = 0
    $rejected = New-Object System.Collections.ArrayList
    if ($table -and $table.Count -gt 1) {
        # Столбцы ищутся по заголовкам, поэтому их можно переставлять
        $colId = ''; $colDir = ''; $colName = ''; $colSrc = ''
        $head = $table[0]
        foreach ($k in @($head.Keys)) {
            $t = ([string]$head[$k]).Trim()
            if ($t -eq 'Код') { $colId = $k } elseif ($t -eq 'Папка назначения') { $colDir = $k } elseif ($t -eq 'Новое имя') { $colName = $k } elseif ($t -eq 'Исходное имя') { $colSrc = $k }
        }
        if (-not $colId -or -not $colDir -or -not $colName) { throw "В файле плана «$source» не найдены столбцы «Код», «Папка назначения» и «Новое имя»." }
        for ($i = 1; $i -lt $table.Count; $i++) {
            $t = $table[$i]
            $id = ''; if ($t.ContainsKey($colId)) { $id = ([string]$t[$colId]).Trim() }
            if (-not $id -or -not $byId.ContainsKey($id)) { continue }
            $r = $byId[$id]
            # Проверка, что кириллица и казахские буквы в файле не повреждены
            if ($colSrc -and $t.ContainsKey($colSrc)) {
                $srcName = Get-RelName ([string]$r.src)
                if (([string]$t[$colSrc]).Trim() -ne $srcName.Trim()) {
                    throw "В файле плана «$source» повреждены буквы в именах файлов (строка $($i + 1)). Сохраните файл в формате Excel или «CSV UTF-8» и повторите."
                }
            }
            $newDir = ''; if ($t.ContainsKey($colDir)) { $newDir = ([string]$t[$colDir]).Trim() }
            $newName = ''; if ($t.ContainsKey($colName)) { $newName = ([string]$t[$colName]).Trim() }
            $oldDir = [string]$r.dstDir; $oldName = [string]$r.dstName
            if ($r.action -eq 'нет') { $oldDir = ''; $oldName = '' }
            if ($newDir -eq $oldDir -and $newName -eq $oldName) { continue }
            if ($r.kind -eq 'unit' -or $r.kind -eq 'attached' -or $r.kind -eq 'page') {
                [void]$rejected.Add("строка $($i + 1): «$(Get-RelName ([string]$r.src))» переносится вместе с другими файлами, правка не применена")
                continue
            }
            if ($r.note -like 'документ ДСП*') {
                [void]$rejected.Add("строка $($i + 1): документ ДСП не перемещается, правка не применена")
                continue
            }
            if (-not $newDir) {
                # Пустая папка: файл остаётся на месте и не переименовывается
                $r.action = 'нет'; $r.dstDir = Get-RelParent ([string]$r.src); $r.dstName = Get-RelName ([string]$r.src); $r.userEdit = $true
                $edited++
                continue
            }
            $dir = ConvertTo-StructureDir $newDir
            if (-not $dir) {
                [void]$rejected.Add("строка $($i + 1): папки «$newDir» нет в структуре, файл «$(Get-RelName ([string]$r.src))» оставлен на месте")
                $r.action = 'нет'; $r.dstDir = Get-RelParent ([string]$r.src); $r.dstName = Get-RelName ([string]$r.src)
                continue
            }
            $srcName = Get-RelName ([string]$r.src)
            $ext = Get-ExtRaw $srcName
            $name = ConvertTo-SafeName $newName
            if (-not $name) { $name = $oldName; if (-not $name) { $name = $srcName } }
            # Расширение файла не меняется: если в новом имени его нет, оно дописывается,
            # а другое расширение (например .pdf у файла .docx) заменяется исходным
            if ($ext -and -not $name.EndsWith($ext, [StringComparison]::OrdinalIgnoreCase)) {
                $name = ($name -replace '\.[A-Za-z][A-Za-z0-9]{1,4}$', '').TrimEnd(' ', '.')
                if (-not $name) { $name = Get-NameNoExt $srcName }
                $name += $ext
            }
            $full = Join-Rel $script:Root (Join-RelParts $dir $name)
            if ($full.Length -gt (Get-OptInt 'МаксДлинаПути')) {
                [void]$rejected.Add("строка $($i + 1): путь к файлу «$name» получается длиннее $(Get-OptInt 'МаксДлинаПути') знаков, файл «$srcName» оставлен на месте. Сократите имя")
                $r.action = 'нет'; $r.dstDir = Get-RelParent ([string]$r.src); $r.dstName = $srcName
                continue
            }
            $r.dstDir = $dir; $r.dstName = $name; $r.userEdit = $true
            $m = [regex]::Match((Get-NameNoExt $name), '^(.*\S)\s+(\d{2}-\d{2}-\d{4})$')
            if ($m.Success) { $r.base = $m.Groups[1].Value } else { $r.base = '' }
            $srcDir = Get-RelParent ([string]$r.src)
            $sameDir = [string]::Equals($dir, $srcDir, [StringComparison]::OrdinalIgnoreCase)
            if ($sameDir -and $name -ceq $srcName) { $r.action = 'нет' }
            elseif ($sameDir) { $r.action = 'переименование' }
            elseif ($name -ceq $srcName) { $r.action = 'перемещение' }
            else { $r.action = 'перемещение и переименование' }
            $edited++
        }
    }
    return @{ Rows = $rows; Edited = $edited; Rejected = $rejected.ToArray(); Source = $source; Created = [string]$plan.created }
}
