@echo off
rem Desktop sorter launcher. Latin characters only, no BOM (cmd.exe requirement).
rem The program folder may be a network (UNC) folder: pushd maps a temporary
rem drive letter and popd releases it. The script is started by its full path.
rem No execution policy switches are used: the program does not bypass policies.
setlocal
title Desktop sorter
pushd "%~dp0" 2>nul
if errorlevel 1 goto nofolder
if not exist "%~dp0DesktopSorter.ps1" goto noscript
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -File "%~dp0DesktopSorter.ps1" %*
set "RC=%ERRORLEVEL%"
popd
echo.
pause
exit /b %RC%

:nofolder
echo Cannot open the program folder:
echo "%~dp0"
pause
exit /b 1

:noscript
popd
echo File DesktopSorter.ps1 was not found next to Start.bat
pause
exit /b 1
