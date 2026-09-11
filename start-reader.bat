@echo off
cd /d "%~dp0"
title NMR Reader - Understanding NMR Spectroscopy

py -3 -c "import sys" >nul 2>nul
if not errorlevel 1 goto run_py

python -c "import sys" >nul 2>nul
if not errorlevel 1 goto run_python

echo.
echo   [!] Python 3 was not found on this machine.
echo       Install it from https://www.python.org/downloads/
echo       and remember to tick "Add python.exe to PATH".
echo.
pause
exit /b 1

:run_py
echo Starting NMR reader ... keep this window open while reading.
echo.
py -3 server.py
goto end

:run_python
echo Starting NMR reader ... keep this window open while reading.
echo.
python server.py
goto end

:end
echo.
pause
