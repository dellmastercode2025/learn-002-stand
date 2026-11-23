# =====================================================================
#  Снимок первой страницы PDF и распознавание текста на изображении.
#  Используются компоненты, встроенные в Windows 10 и 11:
#    Windows.Data.Pdf   - отрисовка страницы PDF в картинку;
#    Windows.Media.Ocr  - распознавание текста (нужно, чтобы найти пометку ДСП в скане);
#    System.Drawing     - уменьшение картинки перед отправкой.
#  Распознавание выполняется на этом компьютере, наружу ничего не уходит.
# =====================================================================

$script:WinRT = @{
    Ready = $false; Pdf = $false; Ocr = $null; OcrLang = ''; OcrMax = 2000; Drawing = $false
    Notes = (New-Object System.Collections.ArrayList); T = @{}; PdfFails = 0; PdfOk = 0
}

function Get-WinRTType([string]$fullName) {
    $ns = $fullName.Substring(0, $fullName.LastIndexOf('.'))
    $cands = New-Object System.Collections.ArrayList
    $p = $ns
    while ($p) {
        [void]$cands.Add($p)
        $i = $p.LastIndexOf('.')
        if ($i -lt 0) { break }
        $p = $p.Substring(0, $i)
    }
    [void]$cands.Add('Windows.Foundation')
    foreach ($a in $cands) {
        $t = [Type]::GetType(($fullName + ', ' + $a + ', ContentType=WindowsRuntime'), $false)
        if ($t) { return $t }
    }
    throw "в Windows не найден компонент $fullName"
}

function Wait-WinRT($operation, [Type]$resultType, [int]$timeoutMs) {
    $task = $script:WinRT.AsTaskOp.MakeGenericMethod($resultType).Invoke($null, @($operation))
    if (-not $task.Wait($timeoutMs)) { throw 'компонент Windows не ответил вовремя' }
    return $task.Result
}
function Wait-WinRTAction($operation, [int]$timeoutMs) {
    $task = $script:WinRT.AsTaskAct.Invoke($null, @($operation))
    if (-not $task.Wait($timeoutMs)) { throw 'компонент Windows не ответил вовремя' }
}

function Initialize-WinRT {
    $w = $script:WinRT
    if (-not $script:IsWin) { [void]$w.Notes.Add('не Windows: снимки PDF и распознавание текста недоступны'); return }
    try { Add-Type -AssemblyName System.Drawing; $w.Drawing = $true }
    catch { [void]$w.Notes.Add('System.Drawing недоступен: ' + (Get-ErrText $_)) }
    try {
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
        $w.AsTaskOp  = @($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
        $w.AsTaskAct = @($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
        if (-not $w.AsTaskOp -or -not $w.AsTaskAct) { throw 'не найдены средства ожидания операций Windows' }
        $w.Ready = $true
    } catch { [void]$w.Notes.Add('Компоненты Windows Runtime недоступны: ' + (Get-ErrText $_)); return }

    try {
        $w.T.PdfDocument = Get-WinRTType 'Windows.Data.Pdf.PdfDocument'
        $w.T.PdfPageRenderOptions = Get-WinRTType 'Windows.Data.Pdf.PdfPageRenderOptions'
        $w.T.InMemoryRandomAccessStream = Get-WinRTType 'Windows.Storage.Streams.InMemoryRandomAccessStream'
        $w.Pdf = $true
    } catch { [void]$w.Notes.Add('Отрисовка PDF недоступна: ' + (Get-ErrText $_)) }

    try {
        $w.T.OcrEngine = Get-WinRTType 'Windows.Media.Ocr.OcrEngine'
        $w.T.OcrResult = Get-WinRTType 'Windows.Media.Ocr.OcrResult'
        $w.T.BitmapDecoder = Get-WinRTType 'Windows.Graphics.Imaging.BitmapDecoder'
        $w.T.SoftwareBitmap = Get-WinRTType 'Windows.Graphics.Imaging.SoftwareBitmap'
        $w.T.Language = Get-WinRTType 'Windows.Globalization.Language'
        $tOcr = $w.T.OcrEngine
        try { $w.OcrMax = [int]$tOcr::MaxImageDimension } catch { }
        $engine = $null
        # Нужен распознаватель, который знает кириллицу: пометка ДСП пишется по-русски
        foreach ($tag in @('ru-RU', 'ru')) {
            try {
                $lang = [Activator]::CreateInstance($w.T.Language, [object[]]@($tag))
                if ($tOcr::IsLanguageSupported($lang)) { $engine = $tOcr::TryCreateFromLanguage($lang) }
            } catch { }
            if ($engine) { break }
        }
        if (-not $engine) {
            try {
                $e2 = $tOcr::TryCreateFromUserProfileLanguages()
                if ($e2) {
                    $tag2 = [string]$e2.RecognizerLanguage.LanguageTag
                    if ($tag2 -match '^(ru|uk|be|bg|sr|mk|kk)') { $engine = $e2 }
                    else { [void]$w.Notes.Add("Распознаватель текста есть только для языка $tag2, кириллицу он не читает") }
                }
            } catch { }
        }
        if ($engine) { $w.Ocr = $engine; $w.OcrLang = [string]$engine.RecognizerLanguage.LanguageTag }
        else { [void]$w.Notes.Add('Распознаватель русского текста в Windows не установлен') }
    } catch { [void]$w.Notes.Add('Распознавание текста недоступно: ' + (Get-ErrText $_)) }
}

function Test-ErrorCode($err, [int]$code) {
    try {
        $ex = $err
        if ($err -is [System.Management.Automation.ErrorRecord]) { $ex = $err.Exception }
        while ($ex) {
            if ($ex.HResult -eq $code) { return $true }
            $ex = $ex.InnerException
        }
    } catch { }
    return $false
}

function Test-PdfEncryptMark([string]$path, [long]$size) {
    # Ищет слово /Encrypt в начале и в конце файла PDF
    try {
        $fs = Open-ReadStream $path
        try {
            $n = [int][Math]::Min(16384, $size)
            $buf = New-Object byte[] $n
            [void](Read-Exact $fs $buf $n)
            $text = [Text.Encoding]::ASCII.GetString($buf)
            if ($size -gt $n) {
                $fs.Position = [Math]::Max(0, $size - 16384)
                $buf2 = New-Object byte[] 16384
                $got = Read-Exact $fs $buf2 16384
                $text += [Text.Encoding]::ASCII.GetString($buf2, 0, $got)
            }
            return ($text.IndexOf('/Encrypt', [StringComparison]::Ordinal) -ge 0)
        } finally { $fs.Dispose() }
    } catch { return $false }
}

function Get-PdfPagePng([string]$path, [int]$edge) {
    # Отрисовывает первую страницу PDF. Возвращает @{ Png; Pages }
    $w = $script:WinRT
    $tPdf = $w.T.PdfDocument
    $fs = Open-ReadStream $path
    $ras = $null; $doc = $null; $page = $null; $mem = $null
    try {
        $ras = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fs)
        $doc = Wait-WinRT ($tPdf::LoadFromStreamAsync($ras)) $tPdf 90000
        $pages = [int]$doc.PageCount
        if ($pages -lt 1) { throw 'в файле PDF нет страниц' }
        $page = $doc.GetPage(0)
        $sz = $page.Size
        $pw = [double]$sz.Width
        $ph = [double]$sz.Height
        if ($pw -le 0 -or $ph -le 0) { throw 'у страницы PDF нулевой размер' }
        $scale = $edge / [Math]::Max($pw, $ph)
        $opt = [Activator]::CreateInstance($w.T.PdfPageRenderOptions)
        $opt.DestinationWidth  = [uint32][Math]::Max(1, [Math]::Round($pw * $scale))
        $opt.DestinationHeight = [uint32][Math]::Max(1, [Math]::Round($ph * $scale))
        $mem = [Activator]::CreateInstance($w.T.InMemoryRandomAccessStream)
        Wait-WinRTAction ($page.RenderToStreamAsync($mem, $opt)) 90000
        $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStream($mem)
        $net.Position = 0
        $ms = New-Object IO.MemoryStream
        $net.CopyTo($ms)
        $png = $ms.ToArray()
        $ms.Dispose()
        if ($png.Length -lt 100) { throw 'снимок страницы пуст' }
        return @{ Png = $png; Pages = $pages }
    } finally {
        if ($page) { try { $page.Dispose() } catch { } }
        if ($mem) { try { $mem.Dispose() } catch { } }
        if ($ras) { try { $ras.Dispose() } catch { } }
        try { $fs.Dispose() } catch { }
    }
}

function Get-OcrText([byte[]]$imageBytes) {
    # Распознаёт текст на картинке (PNG или JPEG). Возвращает строку.
    $w = $script:WinRT
    if (-not $w.Ocr) { return '' }
    $ms = New-Object IO.MemoryStream(, $imageBytes)
    $ras = $null
    try {
        $ras = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($ms)
        $tDec = $w.T.BitmapDecoder
        $dec = Wait-WinRT ($tDec::CreateAsync($ras)) $tDec 60000
        $bmp = Wait-WinRT ($dec.GetSoftwareBitmapAsync()) $w.T.SoftwareBitmap 60000
        try {
            $res = Wait-WinRT ($w.Ocr.RecognizeAsync($bmp)) $w.T.OcrResult 90000
            return [string]$res.Text
        } finally { try { $bmp.Dispose() } catch { } }
    } finally {
        if ($ras) { try { $ras.Dispose() } catch { } }
        $ms.Dispose()
    }
}

function ConvertTo-ScaledImage([byte[]]$bytes, [int]$edge, [string]$format) {
    # Уменьшает картинку так, чтобы длинная сторона была не больше $edge.
    # $format: jpeg или png. Возвращает @{ Bytes; Width; Height }
    $src = New-Object IO.MemoryStream(, $bytes)
    $img = $null; $bmp = $null; $g = $null; $out = $null
    try {
        $img = [System.Drawing.Image]::FromStream($src)
        $scale = [Math]::Min(1.0, $edge / [double][Math]::Max($img.Width, $img.Height))
        $nw = [int][Math]::Max(1, [Math]::Round($img.Width * $scale))
        $nh = [int][Math]::Max(1, [Math]::Round($img.Height * $scale))
        $bmp = New-Object System.Drawing.Bitmap($nw, $nh, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.Clear([System.Drawing.Color]::White)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($img, 0, 0, $nw, $nh)
        $out = New-Object IO.MemoryStream
        if ($format -eq 'png') {
            $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
        } else {
            $codec = @([System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' })[0]
            $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
            $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]85)
            $bmp.Save($out, $codec, $ep)
            $ep.Dispose()
        }
        return @{ Bytes = $out.ToArray(); Width = $nw; Height = $nh }
    } finally {
        if ($g) { $g.Dispose() }
        if ($bmp) { $bmp.Dispose() }
        if ($img) { $img.Dispose() }
        if ($out) { $out.Dispose() }
        $src.Dispose()
    }
}

function Read-ScanContent([string]$path, [string]$ext, [long]$size) {
    # Для PDF и изображений. Возвращает:
    #   State   - ok (текст распознан), unverified (распознать не удалось), protected, meta
    #   OcrText - распознанный текст (остаётся на компьютере, нужен для поиска пометки ДСП)
    #   Image   - JPEG для отправки, MediaType; PdfBytes - файл целиком (режим «целиком»)
    $w = $script:WinRT
    $isPdf = ($ext -eq '.pdf')
    $minLetters = Get-OptInt 'МинБуквДляПроверкиСкана'
    $sendEdge = Get-OptInt 'ДлиннаяСторонаКартинки'
    $res = @{ State = 'unverified'; OcrText = ''; Image = $null; MediaType = 'image/jpeg'; PdfBytes = $null; Note = ''; Pages = 0 }

    # Подмена для самопроверки вне Windows
    if (-not $script:IsWin -and $env:DESKTOPSORTER_TEST_SCAN -eq '1') {
        $side = $path + '.ocr.txt'
        $t = 'Тестовый распознанный текст первой страницы документа'
        if ([IO.File]::Exists($side)) { $t = (Read-TextFile $side).Trim() }
        if ($t -eq 'PASSWORD') { $res.State = 'protected'; $res.Note = 'защищён паролем'; return $res }
        if ($env:DESKTOPSORTER_TEST_JPEG) { $res.Image = [IO.File]::ReadAllBytes($env:DESKTOPSORTER_TEST_JPEG) }
        if ($t -eq 'EMPTY') { $res.Note = 'текст не распознан'; return $res }
        $res.OcrText = $t; $res.State = 'ok'; $res.Pages = 1
        return $res
    }

    $ocrEdge = [Math]::Min(2200, [Math]::Max(600, $w.OcrMax))
    $png = $null
    if ($isPdf) {
        if (-not $w.Pdf) { $res.Note = 'отрисовка PDF на этом компьютере недоступна'; return $res }
        try {
            $r = Get-PdfPagePng $path $ocrEdge
            $png = $r.Png
            $res.Pages = $r.Pages
            $w.PdfOk++
        } catch {
            if ((Test-ErrorCode $_ -2147023573) -or (Test-PdfEncryptMark $path $size)) {
                $res.State = 'protected'; $res.Note = 'защищён паролем'
                return $res
            }
            $w.PdfFails++
            $res.Note = 'не удалось сделать снимок первой страницы: ' + (Get-ErrText $_)
            if ($w.PdfOk -eq 0 -and $w.PdfFails -ge 8) {
                $w.Pdf = $false
                Warn 'Отрисовка PDF не сработала на первых восьми файлах подряд и отключена до конца запуска. Пришлите файл «Ход работы.log» разработчику.'
            }
            return $res
        }
    } else {
        if (-not $w.Drawing) { $res.Note = 'обработка изображений на этом компьютере недоступна'; return $res }
        $limit = [long](Get-OptInt 'МаксРазмерИзображения_МБ') * 1048576
        if ($size -gt $limit) { $res.State = 'meta'; $res.Note = 'изображение больше порога из настроек'; return $res }
        try {
            $bytes = [IO.File]::ReadAllBytes($path)
            $png = (ConvertTo-ScaledImage $bytes $ocrEdge 'png').Bytes
        } catch {
            $res.Note = 'изображение не удалось прочитать: ' + (Get-ErrText $_)
            return $res
        }
    }

    # Распознавание текста на этом компьютере
    if ($w.Ocr) {
        try {
            $res.OcrText = Get-OcrText $png
            if ((Get-LetterCount $res.OcrText) -ge $minLetters) { $res.State = 'ok' }
            else { $res.Note = 'на первой странице не распознан текст' }
        } catch { $res.Note = 'распознавание текста не удалось: ' + (Get-ErrText $_) }
    } else { $res.Note = 'распознаватель русского текста в Windows недоступен' }

    # Что отправлять
    $pdfMode = (Get-Opt 'РежимPDF').ToLowerInvariant()
    if ($isPdf -and $pdfMode -eq 'целиком') {
        $limit = [long](Get-OptInt 'МаксРазмерPDF_МБ') * 1048576
        if ($size -le $limit) { $res.PdfBytes = [IO.File]::ReadAllBytes($path) }
        else { $res.Note = (($res.Note + ' PDF больше порога, отправляется только имя').Trim()) }
    } else {
        try { $res.Image = (ConvertTo-ScaledImage $png $sendEdge 'jpeg').Bytes }
        catch { $res.Note = (($res.Note + ' не удалось подготовить картинку: ' + (Get-ErrText $_)).Trim()) }
    }
    return $res
}
