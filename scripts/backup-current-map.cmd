@echo off
set "NODE_EXE=C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%NODE_EXE%" "%~dp0backup-current-map.mjs"
pause
