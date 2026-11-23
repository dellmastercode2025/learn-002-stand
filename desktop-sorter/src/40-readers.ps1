# =====================================================================
#  Чтение содержимого файлов встроенными средствами .NET.
#  Файлы открываются только на чтение, содержимое и даты не меняются.
# =====================================================================

function Initialize-Readers {
    try { Add-Type -AssemblyName System.IO.Compression } catch { }
    try { Add-Type -AssemblyName System.IO.Compression.FileSystem } catch { }
    $script:Enc1251 = [Text.Encoding]::GetEncoding(1251)
    $script:Enc866  = [Text.Encoding]::GetEncoding(866)
    $script:Utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
    $x = New-Object System.Xml.XmlReaderSettings
    $x.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $x.XmlResolver = $null
    $x.IgnoreComments = $true
    $x.IgnoreProcessingInstructions = $true
    $script:XmlSettings = $x
    $script:NtElement = [System.Xml.XmlNodeType]::Element
    $script:NtEnd     = [System.Xml.XmlNodeType]::EndElement
    $script:NtText    = [System.Xml.XmlNodeType]::Text
    $script:NtWs      = [System.Xml.XmlNodeType]::Whitespace
    $script:NtSws     = [System.Xml.XmlNodeType]::SignificantWhitespace
    $script:NtCData   = [System.Xml.XmlNodeType]::CDATA
    $script:RelNs = @('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships')
}

function Open-ReadStream([string]$path) {
    return (New-Object IO.FileStream($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]'ReadWrite, Delete'), 65536))
}

function Test-FileBusy($err) {
    # Истина, если ошибка означает «файл занят другой программой»
    try {
        $ex = $err
        if ($err -is [System.Management.Automation.ErrorRecord]) { $ex = $err.Exception }
        while ($ex) {
            if ($ex -is [IO.IOException]) {
                $code = $ex.HResult -band 0xFFFF
                if ($code -eq 32 -or $code -eq 33) { return $true }
            }
            $ex = $ex.InnerException
        }
    } catch { }
    return $false
}

function Read-Head([string]$path, [int]$count) {
    # Первые байты файла
    $fs = Open-ReadStream $path
    try {
        $buf = New-Object byte[] $count
        $got = 0
        while ($got -lt $count) {
            $n = $fs.Read($buf, $got, $count - $got)
            if ($n -le 0) { break }
            $got += $n
        }
        if ($got -lt $count) { $res = New-Object byte[] $got; [Array]::Copy($buf, $res, $got); return ,$res }
        return ,$buf
    } finally { $fs.Dispose() }
}

function Format-Extract([string]$text, [int]$max) {
    # Приводит извлечённый текст в порядок и обрезает до $max знаков
    if (-not $text) { return '' }
    $t = $text.Replace("`r", '')
    $t = $t -replace "[ `t]+`n", "`n"
    $t = $t -replace "`n{3,}", "`n`n"
    $t = $t -replace "[ ]{2,}", ' '
    $t = $t.Trim()
    if ($t.Length -gt $max) { $t = $t.Substring(0, $max) }
    return $t
}

# ---------------------------------------------------------------------
#  Текстовые файлы с определением кодировки
# ---------------------------------------------------------------------
function ConvertFrom-TextBytes([byte[]]$b) {
    if ($null -eq $b -or $b.Length -eq 0) { return '' }
    if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { return $script:Utf8NoBom.GetString($b, 3, $b.Length - 3) }
    if ($b.Length -ge 2 -and $b[0] -eq 0xFF -and $b[1] -eq 0xFE) { return [Text.Encoding]::Unicode.GetString($b, 2, $b.Length - 2) }
    if ($b.Length -ge 2 -and $b[0] -eq 0xFE -and $b[1] -eq 0xFF) { return [Text.Encoding]::BigEndianUnicode.GetString($b, 2, $b.Length - 2) }
    # UTF-16 без метки: много нулевых байтов на чётных или нечётных местах
    $zOdd = 0; $zEven = 0
    $lim = [Math]::Min($b.Length, 2000)
    for ($i = 0; $i -lt $lim; $i++) { if ($b[$i] -eq 0) { if ($i % 2) { $zOdd++ } else { $zEven++ } } }
    if ($zOdd -gt $lim / 4 -and $zEven -lt $lim / 20) { return [Text.Encoding]::Unicode.GetString($b) }
    if ($zEven -gt $lim / 4 -and $zOdd -lt $lim / 20) { return [Text.Encoding]::BigEndianUnicode.GetString($b) }
    $s = $script:Utf8NoBom.GetString($b)
    # Знак замены в середине текста означает, что это не UTF-8
    $bad = 0
    $end = $s.Length - 3
    for ($i = 0; $i -lt $end; $i++) { if ($s[$i] -eq [char]0xFFFD) { $bad++; if ($bad -gt 0) { break } } }
    if ($bad -eq 0) { return $s }
    return $script:Enc1251.GetString($b)
}

function Read-TextHead([string]$path, [int]$max) {
    $bytes = Read-Head $path ([Math]::Max(8192, $max * 4))
    return (Format-Extract (ConvertFrom-TextBytes $bytes) $max)
}

# ---------------------------------------------------------------------
#  ZIP и XML
# ---------------------------------------------------------------------
function Open-ZipRead([string]$path) {
    $fs = Open-ReadStream $path
    try { return (New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Read, $false, $script:Enc866)) }
    catch { $fs.Dispose(); throw }
}

function Get-ZipEntry($zip, [string]$name) {
    $n = $name.TrimStart('/')
    $e = $zip.GetEntry($n)
    if ($e) { return $e }
    foreach ($x in $zip.Entries) { if ([string]::Equals($x.FullName, $n, [StringComparison]::OrdinalIgnoreCase)) { return $x } }
    return $null
}

function Read-Rels($zip, [string]$relsPath) {
    # Возвращает список @{Id; Type; Target} из файла связей
    $res = New-Object System.Collections.ArrayList
    $e = Get-ZipEntry $zip $relsPath
    if (-not $e) { return ,@() }
    $st = $e.Open()
    try {
        $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
        while ($r.Read()) {
            if ($r.NodeType -eq $script:NtElement -and $r.LocalName -eq 'Relationship') {
                [void]$res.Add(@{ Id = [string]$r.GetAttribute('Id'); Type = [string]$r.GetAttribute('Type'); Target = [string]$r.GetAttribute('Target') })
            }
        }
        $r.Dispose()
    } finally { $st.Dispose() }
    return ,($res.ToArray())
}

function Resolve-PartPath([string]$baseDir, [string]$target) {
    # Путь части внутри архива по ссылке из файла связей
    if ($target.StartsWith('/')) { return $target.TrimStart('/') }
    $parts = New-Object System.Collections.ArrayList
    foreach ($p in (($baseDir.Trim('/') + '/' + $target) -split '/')) {
        if ($p -eq '' -or $p -eq '.') { continue }
        if ($p -eq '..') { if ($parts.Count -gt 0) { $parts.RemoveAt($parts.Count - 1) }; continue }
        [void]$parts.Add($p)
    }
    return ($parts -join '/')
}

function Get-MainPart($zip, [string]$default) {
    foreach ($rel in (Read-Rels $zip '_rels/.rels')) {
        if ($rel.Type -like '*/officeDocument') { return (Resolve-PartPath '' $rel.Target) }
    }
    return $default
}

function Get-RelAttr($reader) {
    # Значение атрибута r:id у текущего элемента
    foreach ($ns in $script:RelNs) { $v = $reader.GetAttribute('id', $ns); if ($v) { return $v } }
    return ''
}

function ConvertFrom-XmlRaw([string]$xml) {
    # Быстрое извлечение текста из XML без полного разбора: границы абзацев становятся переводами строк
    if (-not $xml) { return '' }
    $t = [regex]::Replace($xml, '</w:p>|<w:br\b[^>]*>|<w:tab\b[^>]*>|</w:tc>|</a:p>', "`n")
    $t = [regex]::Replace($t, '<[^>]+>', '')
    return [Net.WebUtility]::HtmlDecode($t)
}

function Read-ZipEntryText($entry, [long]$maxBytes) {
    # Читает часть архива целиком как текст UTF-8. Слишком большие части не читаются.
    if ([long]$entry.Length -gt $maxBytes) { return '' }
    $st = $entry.Open()
    try {
        $ms = New-Object IO.MemoryStream
        $st.CopyTo($ms)
        $bytes = $ms.ToArray()
        $ms.Dispose()
        return [Text.Encoding]::UTF8.GetString($bytes)
    } finally { $st.Dispose() }
}

function Clear-SheetHeaderCodes([string]$t) {
    # В колонтитулах Excel текст перемежается служебными кодами: &R (справа), &"шрифт", &12 (размер)
    if (-not $t) { return '' }
    return [regex]::Replace($t, '&"[^"]*"|&\d+|&[A-Za-z]', ' ')
}

function Read-OoxmlMargins($zip, [string]$ext) {
    # Текст колонтитулов Word и Excel. Пометка «Для служебного пользования» часто стоит именно там,
    # поэтому колонтитулы читаются целиком, а не только начало документа.
    $sb = New-Object System.Text.StringBuilder
    try {
        if ($script:ExtWord -contains $ext) {
            foreach ($e in $zip.Entries) {
                if ($sb.Length -gt 6000) { break }
                if ($e.FullName -match '(?i)^word/(header|footer)\d*\.xml$') {
                    $t = (ConvertFrom-XmlRaw (Read-ZipEntryText $e 2097152)).Trim()
                    if ($t) { [void]$sb.Append($t).Append("`n") }
                }
            }
        } elseif ($script:ExtExcel -contains $ext) {
            $n = 0
            foreach ($e in $zip.Entries) {
                if ($e.FullName -notmatch '(?i)^xl/worksheets/sheet\d+\.xml$') { continue }
                $n++
                if ($n -gt 5 -or $sb.Length -gt 6000) { break }
                $xml = Read-ZipEntryText $e 16777216
                foreach ($m in [regex]::Matches($xml, '(?s)<headerFooter\b[^>]*>(.*?)</headerFooter>')) {
                    $t = (Clear-SheetHeaderCodes (ConvertFrom-XmlRaw $m.Groups[1].Value)).Trim()
                    if ($t) { [void]$sb.Append($t).Append("`n") }
                }
            }
        }
    } catch { }
    return $sb.ToString()
}

function Read-DocxText($zip, [int]$max) {
    $part = Get-MainPart $zip 'word/document.xml'
    $e = Get-ZipEntry $zip $part
    if (-not $e) { throw 'в файле нет текста документа' }
    $sb = New-Object System.Text.StringBuilder
    $st = $e.Open()
    try {
        $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
        $inT = $false
        $limit = $max + 200
        while ($sb.Length -lt $limit -and $r.Read()) {
            $nt = $r.NodeType
            if ($nt -eq $script:NtElement) {
                $ln = $r.LocalName
                if ($ln -eq 't') { if (-not $r.IsEmptyElement) { $inT = $true } }
                elseif ($ln -eq 'tab') { [void]$sb.Append("`t") }
                elseif ($ln -eq 'br' -or $ln -eq 'cr') { [void]$sb.Append("`n") }
                elseif ($ln -eq 'tc') { [void]$sb.Append(' ') }
            } elseif ($nt -eq $script:NtEnd) {
                $ln = $r.LocalName
                if ($ln -eq 't') { $inT = $false }
                elseif ($ln -eq 'p') { [void]$sb.Append("`n") }
            } elseif ($inT -and ($nt -eq $script:NtText -or $nt -eq $script:NtSws -or $nt -eq $script:NtWs -or $nt -eq $script:NtCData)) {
                [void]$sb.Append($r.Value)
            }
        }
        $r.Dispose()
    } finally { $st.Dispose() }
    return (Format-Extract $sb.ToString() $max)
}

function Read-XlsxText($zip, [int]$rows, [int]$max) {
    $wbPart = Get-MainPart $zip 'xl/workbook.xml'
    $wbDir = ''
    $i = $wbPart.LastIndexOf('/')
    if ($i -ge 0) { $wbDir = $wbPart.Substring(0, $i) }
    $wbName = $wbPart.Substring($i + 1)
    $rels = Read-Rels $zip ($wbDir + '/_rels/' + $wbName + '.rels')

    # Имена листов
    $sheets = New-Object System.Collections.ArrayList
    $e = Get-ZipEntry $zip $wbPart
    if (-not $e) { throw 'в файле нет книги Excel' }
    $st = $e.Open()
    try {
        $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
        while ($r.Read()) {
            if ($r.NodeType -eq $script:NtElement -and $r.LocalName -eq 'sheet') {
                [void]$sheets.Add(@{ Name = [string]$r.GetAttribute('name'); Rid = (Get-RelAttr $r) })
            }
        }
        $r.Dispose()
    } finally { $st.Dispose() }

    # Первый лист
    $sheetPart = ''
    if ($sheets.Count -gt 0) {
        foreach ($rel in $rels) { if ($rel.Id -eq $sheets[0].Rid) { $sheetPart = Resolve-PartPath $wbDir $rel.Target; break } }
    }
    if (-not $sheetPart) { $sheetPart = Resolve-PartPath $wbDir 'worksheets/sheet1.xml' }
    $sstPart = ''
    foreach ($rel in $rels) { if ($rel.Type -like '*/sharedStrings') { $sstPart = Resolve-PartPath $wbDir $rel.Target; break } }
    if (-not $sstPart) { $sstPart = Resolve-PartPath $wbDir 'sharedStrings.xml' }

    # Ячейки первых строк: список строк, в каждой список @{T; V}
    $rowList = New-Object System.Collections.ArrayList
    $need = @{}
    $maxIdx = -1
    $e = Get-ZipEntry $zip $sheetPart
    if ($e) {
        $st = $e.Open()
        try {
            $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
            $cur = $null; $cellType = ''; $inV = $false; $inIs = $false; $val = $null; $chars = 0
            while ($r.Read()) {
                $nt = $r.NodeType
                if ($nt -eq $script:NtElement) {
                    $ln = $r.LocalName
                    if ($ln -eq 'row') {
                        if ($rowList.Count -ge $rows) { break }
                        $cur = New-Object System.Collections.ArrayList
                        [void]$rowList.Add($cur)
                    } elseif ($ln -eq 'c') {
                        $cellType = [string]$r.GetAttribute('t')
                        $val = New-Object System.Text.StringBuilder
                    } elseif ($ln -eq 'v') { if (-not $r.IsEmptyElement) { $inV = $true } }
                    elseif ($ln -eq 'is') { $inIs = $true }
                    elseif ($ln -eq 't' -and $inIs) { if (-not $r.IsEmptyElement) { $inV = $true } }
                } elseif ($nt -eq $script:NtEnd) {
                    $ln = $r.LocalName
                    if ($ln -eq 'v' -or $ln -eq 't') { $inV = $false }
                    elseif ($ln -eq 'is') { $inIs = $false }
                    elseif ($ln -eq 'c') {
                        if ($null -ne $cur -and $null -ne $val -and $val.Length -gt 0) {
                            $v = $val.ToString()
                            if ($cellType -eq 's') {
                                $idx = 0
                                if ([int]::TryParse($v, [ref]$idx)) { $need[$idx] = $true; if ($idx -gt $maxIdx) { $maxIdx = $idx } }
                            }
                            [void]$cur.Add(@{ T = $cellType; V = $v })
                            $chars += $v.Length
                        }
                        $val = $null
                    } elseif ($ln -eq 'sheetData') { break }
                } elseif ($inV -and $null -ne $val -and ($nt -eq $script:NtText -or $nt -eq $script:NtSws -or $nt -eq $script:NtWs -or $nt -eq $script:NtCData)) {
                    [void]$val.Append($r.Value)
                }
                if ($chars -gt $max * 4) { break }
            }
            $r.Dispose()
        } finally { $st.Dispose() }
    }

    # Общие строки, только нужные номера
    $sst = @{}
    if ($maxIdx -ge 0) {
        $e = Get-ZipEntry $zip $sstPart
        if ($e) {
            $st = $e.Open()
            try {
                $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
                $idx = -1; $inT = $false; $skip = 0; $sbS = $null
                while ($r.Read()) {
                    $nt = $r.NodeType
                    if ($nt -eq $script:NtElement) {
                        $ln = $r.LocalName
                        if ($ln -eq 'si') { $idx++; if ($idx -gt $maxIdx) { break }; $sbS = New-Object System.Text.StringBuilder }
                        elseif ($ln -eq 'rPh') { if (-not $r.IsEmptyElement) { $skip++ } }
                        elseif ($ln -eq 't' -and $skip -eq 0) { if (-not $r.IsEmptyElement) { $inT = $true } }
                    } elseif ($nt -eq $script:NtEnd) {
                        $ln = $r.LocalName
                        if ($ln -eq 't') { $inT = $false }
                        elseif ($ln -eq 'rPh') { if ($skip -gt 0) { $skip-- } }
                        elseif ($ln -eq 'si') { if ($need.ContainsKey($idx)) { $sst[$idx] = $sbS.ToString() } }
                    } elseif ($inT -and ($nt -eq $script:NtText -or $nt -eq $script:NtSws -or $nt -eq $script:NtWs -or $nt -eq $script:NtCData)) {
                        if ($need.ContainsKey($idx)) { [void]$sbS.Append($r.Value) }
                    }
                }
                $r.Dispose()
            } finally { $st.Dispose() }
        }
    }

    $out = New-Object System.Text.StringBuilder
    $names = @($sheets | ForEach-Object { $_.Name })
    [void]$out.Append('Листы: ' + ($names -join ', ') + "`n")
    foreach ($row in $rowList) {
        $cells = New-Object System.Collections.ArrayList
        foreach ($c in $row) {
            $v = $c.V
            if ($c.T -eq 's') { $k = 0; if ([int]::TryParse($v, [ref]$k) -and $sst.ContainsKey($k)) { $v = $sst[$k] } else { $v = '' } }
            $v = ($v -replace '\s+', ' ').Trim()
            if ($v) { [void]$cells.Add($v) }
        }
        if ($cells.Count -gt 0) { [void]$out.Append(($cells -join ' | ') + "`n") }
        if ($out.Length -gt $max) { break }
    }
    return (Format-Extract $out.ToString() $max)
}

function Read-SlideText($zip, [string]$part, [bool]$titleOnly) {
    $e = Get-ZipEntry $zip $part
    if (-not $e) { return '' }
    $all = New-Object System.Text.StringBuilder
    $title = ''
    $st = $e.Open()
    try {
        $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
        $inT = $false; $inSp = $false; $isTitle = $false; $sp = $null
        while ($r.Read()) {
            $nt = $r.NodeType
            if ($nt -eq $script:NtElement) {
                $ln = $r.LocalName
                if ($ln -eq 'sp') { $inSp = $true; $isTitle = $false; $sp = New-Object System.Text.StringBuilder }
                elseif ($ln -eq 'ph') { $ty = [string]$r.GetAttribute('type'); if ($ty -eq 'title' -or $ty -eq 'ctrTitle') { $isTitle = $true } }
                elseif ($ln -eq 't') { if (-not $r.IsEmptyElement) { $inT = $true } }
                elseif ($ln -eq 'br') { [void]$all.Append("`n"); if ($sp) { [void]$sp.Append(' ') } }
            } elseif ($nt -eq $script:NtEnd) {
                $ln = $r.LocalName
                if ($ln -eq 't') { $inT = $false }
                elseif ($ln -eq 'p') { [void]$all.Append("`n"); if ($sp) { [void]$sp.Append(' ') } }
                elseif ($ln -eq 'sp') {
                    if ($isTitle -and -not $title -and $sp) { $title = ($sp.ToString() -replace '\s+', ' ').Trim() }
                    $inSp = $false; $sp = $null
                }
            } elseif ($inT -and ($nt -eq $script:NtText -or $nt -eq $script:NtSws -or $nt -eq $script:NtWs -or $nt -eq $script:NtCData)) {
                [void]$all.Append($r.Value)
                if ($sp) { [void]$sp.Append($r.Value) }
            }
            if ($titleOnly -and $title) { break }
        }
        $r.Dispose()
    } finally { $st.Dispose() }
    if ($titleOnly) {
        if ($title) { return $title }
        foreach ($line in ($all.ToString() -split "`n")) { $t = $line.Trim(); if ($t) { return $t } }
        return ''
    }
    return $all.ToString()
}

function Read-PptxText($zip, [int]$max) {
    $pPart = Get-MainPart $zip 'ppt/presentation.xml'
    $pDir = ''
    $i = $pPart.LastIndexOf('/')
    if ($i -ge 0) { $pDir = $pPart.Substring(0, $i) }
    $pName = $pPart.Substring($i + 1)
    $rels = Read-Rels $zip ($pDir + '/_rels/' + $pName + '.rels')
    $ids = New-Object System.Collections.ArrayList
    $e = Get-ZipEntry $zip $pPart
    if (-not $e) { throw 'в файле нет презентации' }
    $st = $e.Open()
    try {
        $r = [System.Xml.XmlReader]::Create($st, $script:XmlSettings)
        while ($r.Read()) {
            if ($r.NodeType -eq $script:NtElement -and $r.LocalName -eq 'sldId') { [void]$ids.Add((Get-RelAttr $r)) }
        }
        $r.Dispose()
    } finally { $st.Dispose() }
    $slides = New-Object System.Collections.ArrayList
    foreach ($id in $ids) {
        foreach ($rel in $rels) { if ($rel.Id -eq $id) { [void]$slides.Add((Resolve-PartPath $pDir $rel.Target)); break } }
    }
    if ($slides.Count -eq 0) { [void]$slides.Add((Resolve-PartPath $pDir 'slides/slide1.xml')) }
    $out = New-Object System.Text.StringBuilder
    [void]$out.Append("Слайдов: $($slides.Count)`nПервый слайд:`n")
    [void]$out.Append((Read-SlideText $zip $slides[0] $false))
    $titles = New-Object System.Collections.ArrayList
    for ($k = 1; $k -lt $slides.Count -and $k -le 5; $k++) {
        $t = Read-SlideText $zip $slides[$k] $true
        if ($t) { [void]$titles.Add($t) }
    }
    if ($titles.Count -gt 0) { [void]$out.Append("`nЗаголовки следующих слайдов:`n" + ($titles -join "`n")) }
    return (Format-Extract $out.ToString() $max)
}

function Get-ZipEntryName($entry) {
    # Имя файла внутри архива. Архив открыт в кодировке 866 (так пишут имена русские
    # архиваторы), но имя могло быть записано и в UTF-8: тогда его байты читаются как UTF-8.
    $name = $entry.FullName
    try {
        $bytes = $script:Enc866.GetBytes($name)
        $multi = $false
        foreach ($b in $bytes) { if ($b -ge 0x80) { $multi = $true; break } }
        if ($multi) { return $script:Utf8Strict.GetString($bytes) }
    } catch { }
    return $name
}

function Read-ZipListing($zip, [int]$max) {
    $names = New-Object System.Collections.ArrayList
    $n = 0
    foreach ($e in $zip.Entries) {
        $n++
        if ($names.Count -lt 60) { [void]$names.Add((Get-ZipEntryName $e)) }
    }
    $t = "Архив, файлов внутри: $n`n" + ($names -join "`n")
    return (Format-Extract $t $max)
}

# ---------------------------------------------------------------------
#  Составные файлы OLE (старые форматы Office, письма .msg, зашифрованные OOXML)
# ---------------------------------------------------------------------
function Test-CfbFile([string]$path) {
    $h = Read-Head $path 8
    if ($h.Length -lt 8) { return $false }
    $sig = @(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1)
    for ($i = 0; $i -lt 8; $i++) { if ($h[$i] -ne $sig[$i]) { return $false } }
    return $true
}

function Read-Exact($stream, [byte[]]$buf, [int]$count) {
    $got = 0
    while ($got -lt $count) {
        $n = $stream.Read($buf, $got, $count - $got)
        if ($n -le 0) { break }
        $got += $n
    }
    return $got
}

function Read-CfbChain($c, [int]$start, [long]$maxBytes) {
    # Читает цепочку секторов обычного размера
    $ms = New-Object IO.MemoryStream
    $buf = New-Object byte[] $c.SecSize
    $s = $start
    $guard = 0
    $fatLen = $c.Fat.Length
    while ($s -ge 0 -and $s -lt $fatLen -and $ms.Length -lt $maxBytes -and $guard -le $fatLen) {
        $c.Stream.Position = ([long]$s + 1) * $c.SecSize
        $got = Read-Exact $c.Stream $buf $c.SecSize
        if ($got -le 0) { break }
        $ms.Write($buf, 0, $got)
        $s = $c.Fat[$s]
        $guard++
    }
    $res = $ms.ToArray()
    $ms.Dispose()
    return ,$res
}

function Open-Cfb([string]$path) {
    $fs = Open-ReadStream $path
    try {
        $hdr = New-Object byte[] 512
        if ((Read-Exact $fs $hdr 512) -ne 512) { throw 'файл слишком короткий' }
        $sig = @(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1)
        for ($i = 0; $i -lt 8; $i++) { if ($hdr[$i] -ne $sig[$i]) { throw 'это не составной файл Office' } }
        $c = @{ Stream = $fs; MiniStream = $null }
        $c.SecSize  = 1 -shl [BitConverter]::ToUInt16($hdr, 0x1E)
        $c.MiniSize = 1 -shl [BitConverter]::ToUInt16($hdr, 0x20)
        if ($c.SecSize -lt 512 -or $c.SecSize -gt 65536 -or $c.MiniSize -lt 8 -or $c.MiniSize -gt 4096) { throw 'неверный заголовок файла' }
        $dirStart     = [BitConverter]::ToInt32($hdr, 0x30)
        $c.Cutoff     = [BitConverter]::ToInt32($hdr, 0x38)
        $miniFatStart = [BitConverter]::ToInt32($hdr, 0x3C)
        $difatStart   = [BitConverter]::ToInt32($hdr, 0x44)

        # Список секторов таблицы размещения
        $fatSecs = New-Object System.Collections.ArrayList
        for ($i = 0; $i -lt 109; $i++) {
            $v = [BitConverter]::ToInt32($hdr, 0x4C + 4 * $i)
            if ($v -ge 0) { [void]$fatSecs.Add($v) }
        }
        $buf = New-Object byte[] $c.SecSize
        $per = [int]($c.SecSize / 4)
        $s = $difatStart
        $guard = 0
        while ($s -ge 0 -and $guard -lt 10000) {
            $fs.Position = ([long]$s + 1) * $c.SecSize
            if ((Read-Exact $fs $buf $c.SecSize) -ne $c.SecSize) { break }
            for ($i = 0; $i -lt $per - 1; $i++) {
                $v = [BitConverter]::ToInt32($buf, 4 * $i)
                if ($v -ge 0) { [void]$fatSecs.Add($v) }
            }
            $s = [BitConverter]::ToInt32($buf, 4 * ($per - 1))
            $guard++
        }
        $fat = New-Object int[] ($fatSecs.Count * $per)
        for ($i = 0; $i -lt $fatSecs.Count; $i++) {
            $fs.Position = ([long]$fatSecs[$i] + 1) * $c.SecSize
            $got = Read-Exact $fs $buf $c.SecSize
            if ($got -ne $c.SecSize) { break }
            [Buffer]::BlockCopy($buf, 0, $fat, $i * $c.SecSize, $c.SecSize)
        }
        $c.Fat = $fat

        # Каталог
        $dir = Read-CfbChain $c $dirStart 8388608
        $entries = New-Object System.Collections.ArrayList
        for ($off = 0; $off + 128 -le $dir.Length; $off += 128) {
            $nameLen = [BitConverter]::ToUInt16($dir, $off + 0x40)
            $name = ''
            if ($nameLen -ge 2 -and $nameLen -le 64) { $name = [Text.Encoding]::Unicode.GetString($dir, $off, $nameLen - 2) }
            [void]$entries.Add(@{
                Name  = $name
                Type  = [int]$dir[$off + 0x42]
                Left  = [BitConverter]::ToInt32($dir, $off + 0x44)
                Right = [BitConverter]::ToInt32($dir, $off + 0x48)
                Child = [BitConverter]::ToInt32($dir, $off + 0x4C)
                Start = [BitConverter]::ToInt32($dir, $off + 0x74)
                Size  = [long][BitConverter]::ToUInt32($dir, $off + 0x78)
            })
        }
        if ($entries.Count -eq 0) { throw 'в файле нет каталога' }
        $c.Entries = $entries.ToArray()

        # Таблица малых секторов
        $mf = Read-CfbChain $c $miniFatStart 16777216
        $miniFat = New-Object int[] ([int]($mf.Length / 4))
        if ($miniFat.Length -gt 0) { [Buffer]::BlockCopy($mf, 0, $miniFat, 0, $miniFat.Length * 4) }
        $c.MiniFat = $miniFat
        return $c
    } catch { $fs.Dispose(); throw }
}

function Close-Cfb($c) { if ($c -and $c.Stream) { try { $c.Stream.Dispose() } catch { } } }

function Get-CfbChildren($c, [int]$index) {
    # Возвращает таблицу «имя -> номер записи» для вложенных элементов хранилища
    $res = @{}
    $root = $c.Entries[$index].Child
    $stack = New-Object System.Collections.Stack
    if ($root -ge 0) { $stack.Push($root) }
    $guard = 0
    $count = $c.Entries.Length
    while ($stack.Count -gt 0 -and $guard -lt $count * 2 + 10) {
        $guard++
        $i = [int]$stack.Pop()
        if ($i -lt 0 -or $i -ge $count) { continue }
        $e = $c.Entries[$i]
        if ($e.Name -and -not $res.ContainsKey($e.Name)) { $res[$e.Name] = $i }
        if ($e.Left -ge 0) { $stack.Push($e.Left) }
        if ($e.Right -ge 0) { $stack.Push($e.Right) }
    }
    return $res
}

function Get-CfbStream($c, [int]$index, [long]$maxBytes) {
    $e = $c.Entries[$index]
    $size = [Math]::Min($e.Size, $maxBytes)
    if ($size -le 0) { return ,(New-Object byte[] 0) }
    if ($e.Size -lt $c.Cutoff -and $index -ne 0) {
        if ($null -eq $c.MiniStream) { $c.MiniStream = Read-CfbChain $c $c.Entries[0].Start ([Math]::Max($c.Entries[0].Size, 1)) }
        $res = New-Object byte[] $size
        $s = $e.Start
        $pos = 0
        $guard = 0
        while ($s -ge 0 -and $s -lt $c.MiniFat.Length -and $pos -lt $size -and $guard -le $c.MiniFat.Length) {
            $off = [long]$s * $c.MiniSize
            $n = [Math]::Min($c.MiniSize, $size - $pos)
            if ($off + $n -gt $c.MiniStream.Length) { break }
            [Array]::Copy($c.MiniStream, $off, $res, $pos, $n)
            $pos += $n
            $s = $c.MiniFat[$s]
            $guard++
        }
        return ,$res
    }
    $all = Read-CfbChain $c $e.Start $size
    if ($all.Length -gt $size) { $res = New-Object byte[] $size; [Array]::Copy($all, $res, $size); return ,$res }
    return ,$all
}

function Test-OoxmlEncrypted([string]$path) {
    # Файл с расширением docx/xlsx/pptx, защищённый паролем, хранится как составной файл с потоком EncryptedPackage
    $c = $null
    try {
        $c = Open-Cfb $path
        $kids = Get-CfbChildren $c 0
        return ($kids.ContainsKey('EncryptedPackage') -or $kids.ContainsKey('EncryptionInfo'))
    } catch { return $false }
    finally { Close-Cfb $c }
}

function Test-DocEncrypted([string]$path) {
    # Признак шифрования в заголовке документа Word 97-2003
    $c = $null
    try {
        $c = Open-Cfb $path
        $kids = Get-CfbChildren $c 0
        if (-not $kids.ContainsKey('WordDocument')) { return $false }
        $b = Get-CfbStream $c $kids['WordDocument'] 32
        if ($b.Length -lt 12) { return $false }
        return (([BitConverter]::ToUInt16($b, 0x0A) -band 0x0100) -ne 0)
    } catch { return $false }
    finally { Close-Cfb $c }
}

function ConvertFrom-HtmlSimple([string]$html) {
    $t = $html -replace '(?is)<(script|style)\b.*?</\1>', ' '
    $t = $t -replace '(?i)<br\s*/?>|</p>|</div>|</tr>|</h\d>', "`n"
    $t = $t -replace '<[^>]+>', ' '
    $t = $t.Replace('&nbsp;', ' ').Replace('&amp;', '&').Replace('&lt;', '<').Replace('&gt;', '>').Replace('&quot;', '"')
    return $t
}

function Read-MsgText([string]$path, [int]$max) {
    $c = Open-Cfb $path
    try {
        $kids = Get-CfbChildren $c 0
        if (-not $kids.ContainsKey('__properties_version1.0')) { throw 'это не письмо Outlook' }

        # Свойства: даты и кодовая страница
        $cp = 1251
        $date = ''
        $props = Get-CfbStream $c $kids['__properties_version1.0'] 65536
        for ($off = 32; $off + 16 -le $props.Length; $off += 16) {
            $type = [BitConverter]::ToUInt16($props, $off)
            $id   = [BitConverter]::ToUInt16($props, $off + 2)
            if ($type -eq 0x0040 -and ($id -eq 0x0039 -or $id -eq 0x0E06) -and -not $date) {
                $ft = [BitConverter]::ToInt64($props, $off + 8)
                if ($ft -gt 0) { try { $date = [datetime]::FromFileTimeUtc($ft).ToLocalTime().ToString('dd.MM.yyyy HH:mm', $script:Inv) } catch { } }
            } elseif ($type -eq 0x0003 -and ($id -eq 0x3FDE -or $id -eq 0x3FFD)) {
                $v = [BitConverter]::ToInt32($props, $off + 8)
                if ($v -gt 0 -and $v -ne 65001 -and $id -eq 0x3FFD) { $cp = $v }
            }
        }
        $ansi = $script:Enc1251
        try { $ansi = [Text.Encoding]::GetEncoding($cp) } catch { }

        $getStr = {
            param([string]$propId, [long]$limit)
            $n = '__substg1.0_' + $propId + '001F'
            if ($kids.ContainsKey($n)) { return [Text.Encoding]::Unicode.GetString((Get-CfbStream $c $kids[$n] $limit)) }
            $n = '__substg1.0_' + $propId + '001E'
            if ($kids.ContainsKey($n)) { return $ansi.GetString((Get-CfbStream $c $kids[$n] $limit)) }
            return ''
        }
        $subject = (& $getStr '0037' 2000).Trim([char]0, ' ')
        $from    = (& $getStr '0C1A' 1000).Trim([char]0, ' ')
        $to      = (& $getStr '0E04' 2000).Trim([char]0, ' ')
        $body    = & $getStr '1000' ([long]$max * 4 + 64)
        if (-not $body.Trim()) {
            $n = '__substg1.0_10130102'
            if ($kids.ContainsKey($n)) {
                $hb = Get-CfbStream $c $kids[$n] ([long]$max * 40 + 4096)
                $body = ConvertFrom-HtmlSimple (ConvertFrom-TextBytes $hb)
            }
        }

        # Имена вложений
        $att = New-Object System.Collections.ArrayList
        foreach ($k in @($kids.Keys)) {
            if ($k -like '__attach_version1.0_#*') {
                $ak = Get-CfbChildren $c $kids[$k]
                $nm = ''
                foreach ($pn in @('__substg1.0_3707001F', '__substg1.0_3704001F')) {
                    if ($ak.ContainsKey($pn)) { $nm = [Text.Encoding]::Unicode.GetString((Get-CfbStream $c $ak[$pn] 1000)).Trim([char]0, ' '); break }
                }
                if (-not $nm) {
                    foreach ($pn in @('__substg1.0_3707001E', '__substg1.0_3704001E')) {
                        if ($ak.ContainsKey($pn)) { $nm = $ansi.GetString((Get-CfbStream $c $ak[$pn] 1000)).Trim([char]0, ' '); break }
                    }
                }
                if ($nm -and $att.Count -lt 20) { [void]$att.Add($nm) }
            }
        }

        $sb = New-Object System.Text.StringBuilder
        [void]$sb.Append("Письмо`nТема: $subject`nОт: $from`n")
        if ($to) { [void]$sb.Append("Кому: $to`n") }
        if ($date) { [void]$sb.Append("Дата: $date`n") }
        if ($att.Count -gt 0) { [void]$sb.Append('Вложения: ' + ($att -join '; ') + "`n") }
        [void]$sb.Append("`n")
        $head = $sb.ToString()
        return ($head + (Format-Extract $body.Replace([string][char]0, '') $max))
    } finally { Close-Cfb $c }
}

# ---------------------------------------------------------------------
#  RTF
# ---------------------------------------------------------------------
function ConvertFrom-RtfSimple([string]$rtf, [int]$max) {
    $sb = New-Object System.Text.StringBuilder
    $n = $rtf.Length
    $i = 0
    $depth = 0
    $skipDepth = -1
    $enc = $script:Enc1251
    $ucSkip = 1
    $pending = 0
    $hex = New-Object System.Collections.Generic.List[byte]
    $ignore = @{}
    foreach ($w in @('fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf',
                     'ftnsep', 'ftnsepc', 'themedata', 'datastore', 'listtable', 'listoverridetable', 'revtbl', 'rsidtbl', 'generator', 'xmlnstbl', 'latentstyles',
                     'fldinst', 'colorschememapping', 'datafield', 'pgdsctbl', 'filetbl', 'mmathPr', 'wgrffmtfilter', 'bkmkstart', 'bkmkend')) { $ignore[$w] = $true }
    $braces = [char[]]@('{', '}')
    while ($i -lt $n -and $sb.Length -lt $max) {
        $ch = $rtf[$i]
        if ($skipDepth -ge 0) {
            # Пропускаем содержимое служебной группы до её закрытия
            $j = $rtf.IndexOfAny($braces, $i)
            if ($j -lt 0) { break }
            if ($j -gt 0 -and $rtf[$j - 1] -eq '\') { $i = $j + 1; continue }
            if ($rtf[$j] -eq '{') { $depth++ }
            else {
                if ($depth -le $skipDepth) { $skipDepth = -1 }
                $depth--
            }
            $i = $j + 1
            continue
        }
        if ($ch -eq '{') { if ($hex.Count) { [void]$sb.Append($enc.GetString($hex.ToArray())); $hex.Clear() }; $depth++; $i++; continue }
        if ($ch -eq '}') { if ($hex.Count) { [void]$sb.Append($enc.GetString($hex.ToArray())); $hex.Clear() }; $depth--; $i++; continue }
        if ($ch -eq '\') {
            $i++
            if ($i -ge $n) { break }
            $c2 = $rtf[$i]
            if ($c2 -eq "'") {
                if ($i + 2 -lt $n) {
                    $b = 0
                    if ([int]::TryParse($rtf.Substring($i + 1, 2), [Globalization.NumberStyles]::HexNumber, $script:Inv, [ref]$b)) {
                        if ($pending -gt 0) { $pending-- } else { $hex.Add([byte]$b) }
                    }
                }
                $i += 3
                continue
            }
            if ($hex.Count) { [void]$sb.Append($enc.GetString($hex.ToArray())); $hex.Clear() }
            if ($c2 -eq '\' -or $c2 -eq '{' -or $c2 -eq '}') { [void]$sb.Append($c2); $i++; continue }
            if ($c2 -eq '*') { $skipDepth = $depth; $i++; continue }
            if ($c2 -eq '~') { [void]$sb.Append(' '); $i++; continue }
            if ($c2 -eq '-') { $i++; continue }
            if ($c2 -eq '_') { [void]$sb.Append('-'); $i++; continue }
            if ($c2 -eq "`r" -or $c2 -eq "`n") { [void]$sb.Append("`n"); $i++; continue }
            $j = $i
            while ($j -lt $n -and (($rtf[$j] -ge 'a' -and $rtf[$j] -le 'z') -or ($rtf[$j] -ge 'A' -and $rtf[$j] -le 'Z'))) { $j++ }
            if ($j -eq $i) { $i++; continue }
            $word = $rtf.Substring($i, $j - $i)
            $k = $j
            if ($k -lt $n -and ($rtf[$k] -eq '-' -or [char]::IsDigit($rtf[$k]))) {
                $k++
                while ($k -lt $n -and [char]::IsDigit($rtf[$k])) { $k++ }
            }
            $param = $rtf.Substring($j, $k - $j)
            if ($k -lt $n -and $rtf[$k] -eq ' ') { $k++ }
            $i = $k
            if ($word -ceq 'par' -or $word -ceq 'line' -or $word -ceq 'sect' -or $word -ceq 'page' -or $word -ceq 'row') { [void]$sb.Append("`n") }
            elseif ($word -ceq 'tab' -or $word -ceq 'cell') { [void]$sb.Append("`t") }
            elseif ($word -ceq 'u') {
                $code = 0
                if ([int]::TryParse($param, [ref]$code)) {
                    if ($code -lt 0) { $code += 65536 }
                    if ($code -gt 0 -and $code -le 65535) { [void]$sb.Append([char]$code) }
                    $pending = $ucSkip
                }
            }
            elseif ($word -ceq 'uc') { $v = 1; if ([int]::TryParse($param, [ref]$v)) { $ucSkip = $v } }
            elseif ($word -ceq 'ansicpg') { $v = 0; if ([int]::TryParse($param, [ref]$v)) { try { $enc = [Text.Encoding]::GetEncoding($v) } catch { } } }
            elseif ($word -ceq 'emdash') { [void]$sb.Append([char]0x2014) }
            elseif ($word -ceq 'endash') { [void]$sb.Append([char]0x2013) }
            elseif ($word -ceq 'lquote' -or $word -ceq 'rquote') { [void]$sb.Append("'") }
            elseif ($word -ceq 'ldblquote' -or $word -ceq 'rdblquote') { [void]$sb.Append('"') }
            elseif ($word -ceq 'bullet') { [void]$sb.Append('*') }
            elseif ($ignore.ContainsKey($word)) { $skipDepth = $depth }
            continue
        }
        if ($ch -eq "`r" -or $ch -eq "`n") { $i++; continue }
        if ($pending -gt 0) { $pending--; $i++; continue }
        if ($hex.Count) { [void]$sb.Append($enc.GetString($hex.ToArray())); $hex.Clear() }
        [void]$sb.Append($ch)
        $i++
    }
    if ($hex.Count) { [void]$sb.Append($enc.GetString($hex.ToArray())) }
    return $sb.ToString()
}

function Read-RtfText([string]$path, [long]$size, [int]$max) {
    if ($script:IsWin -and $size -lt 31457280) {
        # Встроенный класс .NET RichTextBox, Word не запускается
        $rtb = $null
        try {
            Add-Type -AssemblyName System.Windows.Forms
            $rtb = New-Object System.Windows.Forms.RichTextBox
            $rtb.LoadFile($path, [System.Windows.Forms.RichTextBoxStreamType]::RichText)
            $t = $rtb.Text
            if ($t -and $t.Trim()) { return (Format-Extract $t $max) }
        } catch { Write-Log ('RichTextBox не прочитал RTF, читаю запасным способом: ' + (Get-ErrText $_)) }
        finally { if ($rtb) { try { $rtb.Dispose() } catch { } } }
    }
    $bytes = Read-Head $path ([int][Math]::Min($size, 4194304))
    $raw = [Text.Encoding]::GetEncoding(28591).GetString($bytes)
    return (Format-Extract (ConvertFrom-RtfSimple $raw ($max + 200)) $max)
}

# ---------------------------------------------------------------------
#  HTML: текст и признаки самостоятельного инструмента
# ---------------------------------------------------------------------
function Get-HtmlInfo([string]$path) {
    # Возвращает @{ Title; InlineScript; Saved; Refs; Head }
    $bytes = Read-Head $path 400000
    $html = ConvertFrom-TextBytes $bytes
    $info = @{ Title = ''; InlineScript = 0; Saved = $false; Refs = @(); Html = $html }
    $m = [regex]::Match($html, '(?is)<title[^>]*>(.*?)</title>')
    if ($m.Success) { $info.Title = (($m.Groups[1].Value -replace '\s+', ' ').Trim()) }
    if ($html -match '(?i)<!--\s*saved from url=' -or $html -match '(?i)<meta[^>]+name=["'']?savepage') { $info.Saved = $true }
    $total = 0
    foreach ($sm in [regex]::Matches($html, '(?is)<script\b([^>]*)>(.*?)(</script>|$)')) {
        if ($sm.Groups[1].Value -notmatch '(?i)\bsrc\s*=') { $total += $sm.Groups[2].Value.Trim().Length }
    }
    $info.InlineScript = $total
    $refs = New-Object System.Collections.ArrayList
    foreach ($rm in [regex]::Matches($html, '(?i)\b(?:src|href)\s*=\s*["'']([^"''#?]+)["'']')) {
        $v = $rm.Groups[1].Value.Trim()
        if ($v -match '^(?i)(https?:|data:|mailto:|javascript:|file:|//)') { continue }
        if ($refs.Count -lt 200) { [void]$refs.Add($v) }
    }
    $info.Refs = $refs.ToArray()
    return $info
}
