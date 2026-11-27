#requires -Version 5.1
# =====================================================================
#  Разбор рабочего стола: раскладка файлов по папкам, переименование,
#  журнал с откатом и HTML-каталог. Запускается через Start.bat.
#  Работает под обычной учётной записью, ничего не устанавливает,
#  реестр и системные настройки не меняет.
# =====================================================================
[CmdletBinding()]
param(
    [string]$Mode = '',          # режим без меню: 1..5 (нужен для самопроверки)
    [string]$Root = '',          # папка вместо рабочего стола (нужна для самопроверки)
    [string]$SettingsPath = '',  # другой файл настроек (нужен для самопроверки)
    [string]$ApiUrl = '',        # другой адрес API (нужен для самопроверки)
    [switch]$Yes                 # отвечать «да» на подтверждения (нужно для самопроверки)
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:Version      = '1.0'
$script:IsWin        = ($env:OS -eq 'Windows_NT')
$script:DS           = [IO.Path]::DirectorySeparatorChar
$script:Inv          = [Globalization.CultureInfo]::InvariantCulture
$script:Utf8NoBom    = New-Object System.Text.UTF8Encoding($false)
$script:Utf8Bom      = New-Object System.Text.UTF8Encoding($true)
$script:ProgramDir   = $PSScriptRoot
$script:AutoYes      = [bool]$Yes
$script:ApiUrlOverride = $ApiUrl
$script:RootOverride = $Root
$script:ModeOverride = $Mode
$script:SettingsOverride = $SettingsPath
$script:LogPath      = $null
$script:RunId        = (Get-Date).ToString('yyyyMMdd-HHmmss', $script:Inv)
$script:ServiceName  = '_Каталог'

# Имена служебных файлов в папке «_Каталог»
$script:FileNames = @{
    Db        = 'files.jsonl'
    Cache     = 'api-cache.jsonl'
    Meta      = 'meta.json'
    Journal   = 'Журнал операций.csv'
    Log       = 'Ход работы.log'
    PlanJson  = 'plan.jsonl'
    PlanHtml  = 'План разбора.html'
    PlanXlsx  = 'План разбора.xlsx'
    PlanCsv   = 'План разбора.csv'
    Catalog   = 'catalog.json'
    Labels    = 'labels.json'
    Key       = 'api-key.dat'
    Key2      = 'api-key-gemini.dat'
    Template  = 'catalog-template.html'
    Settings  = 'Настройки.txt'
    Lock      = 'run.lock'
    ToolsDoc  = 'Описание инструментов.html'
}
