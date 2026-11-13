@echo off
cd /d "%~dp0"
title Clipson - aktualizacja yt-dlp
if not exist ".venv\Scripts\python.exe" (
    echo Najpierw uruchom install.bat
    pause
    exit /b 1
)
echo Aktualizowanie yt-dlp i pywebview ...
".venv\Scripts\python.exe" -m pip install --upgrade -r requirements.txt
echo.
echo Gotowe.
pause
