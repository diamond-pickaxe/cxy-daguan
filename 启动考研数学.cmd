@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "宇的数学大观离线版.exe" (
 start "" "宇的数学大观离线版.exe"
 exit /b
)
if exist "runtime\node.exe" (
 runtime\node.exe server.mjs --open
 pause
 exit /b
)
where node >nul 2>nul
if errorlevel 1 (
 echo 这是源码目录。请下载完整 Windows 便携版，或安装 Node.js 22 及以上版本。
 pause
 exit /b 1
)
node server.mjs --open
pause
