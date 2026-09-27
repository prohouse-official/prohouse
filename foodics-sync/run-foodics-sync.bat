@echo off
cd /d %~dp0
echo [%date% %time%] Starting Foodics sync... >> sync.log
node pull-foodics.js >> sync.log 2>&1
echo [%date% %time%] Done. >> sync.log
