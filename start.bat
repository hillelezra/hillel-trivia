@echo off
chcp 65001 >nul
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
echo ====================================================
echo   Starting Hebrew Multiplayer Trivia Server...
echo   Admin Screen:  http://localhost:3000/admin.html
echo   Player Screen: http://localhost:3000/index.html
echo ====================================================
start "" "http://localhost:3000/admin.html"
node server.js
pause
