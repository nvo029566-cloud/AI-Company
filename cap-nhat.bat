@echo off
chcp 65001 >nul
title Cap nhat Cong ty AI
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Khong tim thay Node.js. Hay cai Node.js 22.5 tro len roi chay lai.
  pause
  exit /b 1
)
node cap-nhat.mjs
echo.
pause