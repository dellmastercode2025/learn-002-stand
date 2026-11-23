# =====================================================================
#  Чтение первой страницы файла любого типа (раздел 5 ТЗ) и проверка пометки ДСП
# =====================================================================

$script:ExtWord   = @('.docx', '.docm', '.dotx', '.dotm')
$script:ExtExcel  = @('.xlsx', '.xlsm', '.xltx', '.xltm')
$script:ExtPpt    = @('.pptx', '.pptm', '.ppsx', '.ppsm', '.potx')
$script:ExtLegacy = @('.doc', '.dot', '.xls', '.xlt', '.ppt', '.pps')
$script:ExtText   = @('.txt', '.csv', '.xml', '.json', '.log', '.md', '.ini', '.tsv')
$script:ExtHtml   = @('.html', '.htm')
$script:ExtImage  = @('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tif', '.tiff', '.webp')
$script:ExtBook   = @('.epub', '.fb2', '.djvu', '.djv')

function Get-FileContent([string]$full, [string]$name, [string]$ext, [long]$size) {
    # Возвращает хеш-таблицу:
    #   State - ok | meta | unverified | protected | corrupt | locked | dsp
    #   Kind  - text | image | pdf | meta      (что можно отправить в Claude)
    #   Text  - извлечённый текст; для сканов это распознанный текст, он наружу не уходит
    #   Image, MediaType, PdfBytes - данные для отправки скана
    #   Note  - пояснение; Dsp - найденный признак ДСП; Html - сведения об HTML-файле
    $max = Get-OptInt 'ЗнаковТекста'
    $res = @{ State = 'meta'; Kind = 'meta'; Text = ''; Image = $null; MediaType = ''; PdfBytes = $null; Note = ''; Dsp = ''; Html = $null; Pages = 0 }
    $extra = ''     # текст колонтитулов: нужен для поиска пометки ДСП
    try {
        if ($size -eq 0) { $res.Note = 'пустой файл'; return $res }

        if (($script:ExtWord + $script:ExtExcel + $script:ExtPpt) -contains $ext) {
            if (Test-CfbFile $full) {
                if (Test-OoxmlEncrypted $full) { $res.State = 'protected'; $res.Note = 'защищён паролем'; return $res }
                $res.State = 'corrupt'; $res.Note = 'содержимое не соответствует расширению файла'; return $res
            }
            $zip = Open-ZipRead $full
            try {
                if ($script:ExtWord -contains $ext) { $res.Text = Read-DocxText $zip $max }
                elseif ($script:ExtExcel -contains $ext) { $res.Text = Read-XlsxText $zip (Get-OptInt 'СтрокExcel') $max }
                else { $res.Text = Read-PptxText $zip $max }
                $extra = Read-OoxmlMargins $zip $ext
            } finally { $zip.Dispose() }
            $res.State = 'ok'; $res.Kind = 'text'
        }
        elseif ($script:ExtLegacy -contains $ext) {
            if (-not (Test-CfbFile $full)) {
                # Бывает, что под расширением .doc лежит RTF или обычный текст
                $head = [Text.Encoding]::ASCII.GetString((Read-Head $full 6))
                if ($head.StartsWith('{\rtf')) { $res.Text = Read-RtfText $full $size $max }
                else { $res.Text = Read-TextHead $full $max }
                $res.State = 'ok'; $res.Kind = 'text'
            } else {
                $r = Read-LegacyOffice $full $ext $size
                $res.State = $r.State; $res.Note = $r.Note; $res.Text = $r.Text
                if ($r.State -eq 'ok') { $res.Kind = 'text' }
                if ($r.ContainsKey('Extra')) {
                    $extra = [string]$r.Extra
                    if ($ext -eq '.xls' -or $ext -eq '.xlt') { $extra = Clear-SheetHeaderCodes $extra }
                }
            }
        }
        elseif ($ext -eq '.rtf') {
            $res.Text = Read-RtfText $full $size $max; $res.State = 'ok'; $res.Kind = 'text'
            # Колонтитулы RTF обычным способом не читаются: дополнительно просматривается начало файла как есть
            try {
                $rawRtf = [Text.Encoding]::GetEncoding(28591).GetString((Read-Head $full ([int][Math]::Min($size, 1048576))))
                $extra = ConvertFrom-RtfSimple $rawRtf 6000
            } catch { }
        }
        elseif ($ext -eq '.msg') {
            try { $res.Text = Read-MsgText $full $max; $res.State = 'ok'; $res.Kind = 'text' }
            catch {
                if (Test-FileBusy $_) { throw }
                $res.State = 'meta'; $res.Note = 'письмо не удалось прочитать: ' + (Get-ErrText $_)
            }
        }
        elseif ($script:ExtText -contains $ext) { $res.Text = Read-TextHead $full $max; $res.State = 'ok'; $res.Kind = 'text' }
        elseif ($script:ExtHtml -contains $ext) {
            $info = Get-HtmlInfo $full
            $res.Html = @{ Title = $info.Title; InlineScript = $info.InlineScript; Saved = $info.Saved }
            $visible = Format-Extract (ConvertFrom-HtmlSimple $info.Html) 1500
            $head = Format-Extract $info.Html 1500
            $kind = 'страница без встроенных скриптов'
            if ($info.Saved) { $kind = 'сохранённая веб-страница' }
            elseif ($info.InlineScript -ge 300) { $kind = "есть встроенные скрипты ($($info.InlineScript) знаков), похоже на самостоятельный инструмент" }
            $res.Text = "HTML-файл. Заголовок: $($info.Title)`nПризнаки: $kind`nВидимый текст:`n$visible`n`nНачало файла:`n$head"
            $res.State = 'ok'; $res.Kind = 'text'
        }
        elseif ($ext -eq '.zip') {
            $zip = Open-ZipRead $full
            try { $res.Text = Read-ZipListing $zip $max } finally { $zip.Dispose() }
            $res.State = 'ok'; $res.Kind = 'text'
        }
        elseif ($ext -eq '.pdf' -or $script:ExtImage -contains $ext) {
            $r = Read-ScanContent $full $ext $size
            $res.State = $r.State; $res.Note = $r.Note; $res.Text = $r.OcrText; $res.Pages = $r.Pages
            $res.Image = $r.Image; $res.MediaType = $r.MediaType; $res.PdfBytes = $r.PdfBytes
            if ($r.PdfBytes) { $res.Kind = 'pdf' } elseif ($r.Image) { $res.Kind = 'image' }
        }
        else { $res.State = 'meta' }
    } catch {
        if (Test-FileBusy $_) { $res.State = 'locked'; $res.Note = 'файл занят другой программой' }
        else { $res.State = 'corrupt'; $res.Note = 'файл не читается: ' + (Get-ErrText $_) }
        $res.Kind = 'meta'; $res.Text = ''; $res.Image = $null; $res.PdfBytes = $null
        return $res
    }

    # Пометка «Для служебного пользования» в тексте или в колонтитулах
    $mark = Find-DspMark $res.Text
    if (-not $mark -and $extra) { $mark = Find-DspMark $extra }
    if ($mark) {
        $res.State = 'dsp'; $res.Dsp = $mark; $res.Kind = 'meta'
        $res.Image = $null; $res.PdfBytes = $null; $res.Text = ''
    } elseif ($extra -and $res.Kind -eq 'text' -and $ext -ne '.rtf') {
        # Колонтитулы помогают понять документ (название организации, номер, гриф), поэтому их начало идёт в запрос
        $short = ($extra -replace '\s+', ' ').Trim()
        if ($short.Length -gt 300) { $short = $short.Substring(0, 300) }
        if ($short) { $res.Text = 'Колонтитулы: ' + $short + "`n`n" + $res.Text }
    }
    return $res
}
