@echo off
setlocal
pushd "%~dp0" || exit /b 1
node tools\local-web.mjs start
set "semanoteExit=%errorlevel%"
if "%semanoteExit%"=="0" start "" "http://127.0.0.1:8090"
if not "%semanoteExit%"=="0" pause
popd
exit /b %semanoteExit%
