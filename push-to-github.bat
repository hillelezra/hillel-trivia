@echo off
chcp 65001 >nul
set "PATH=C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%PATH%"
cd /d "%~dp0"
echo ====================================================
echo   Uploading Hillel Trivia Project to GitHub...
echo   Repository: https://github.com/hillelezra/hillel-trivia.git
echo ====================================================
git init
git config --global --add safe.directory "*"
git add .
git commit -m "Update Hillel Trivia App" 2>nul
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/hillelezra/hillel-trivia.git
echo.
echo Pushing files to GitHub (if a GitHub login window opens, please approve it)...
git push -u origin main
echo.
echo ====================================================
echo   Done! Refresh your GitHub page to see the files.
echo ====================================================
pause
