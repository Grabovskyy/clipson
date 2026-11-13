@echo off
setlocal
cd /d "%~dp0"
title Clipson - instalacja
echo.
echo  ===  Clipson - instalacja  ===
echo.

python --version >nul 2>nul
if errorlevel 1 (
    echo [!] Nie znaleziono Pythona. Probuje zainstalowac Python 3.12 przez winget...
    winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
    echo.
    echo Python zostal zainstalowany. Zamknij to okno i uruchom install.bat jeszcze raz.
    pause
    exit /b 1
)

echo [1/4] Tworzenie srodowiska .venv ...
if not exist ".venv\Scripts\python.exe" (
    python -m venv .venv || goto :error
)

echo [2/4] Instalowanie bibliotek (pywebview, yt-dlp) ...
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
".venv\Scripts\python.exe" -m pip install --upgrade -r requirements.txt || goto :error

echo [3/4] Sprawdzanie ffmpeg ...
where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo      Brak ffmpeg - instaluje przez winget...
    winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
) else (
    echo      OK
)

echo [4/4] Sprawdzanie Deno (potrzebne yt-dlp do pelnej jakosci z YouTube) ...
where deno >nul 2>nul
if errorlevel 1 (
    echo      Brak Deno - instaluje przez winget...
    winget install -e --id DenoLand.Deno --accept-source-agreements --accept-package-agreements
) else (
    echo      OK
)

echo.
echo  Gotowe! Uruchom aplikacje plikiem Clipson.bat
echo.
pause
exit /b 0

:error
echo.
echo [X] Cos poszlo nie tak. Sprawdz komunikaty powyzej.
pause
exit /b 1
