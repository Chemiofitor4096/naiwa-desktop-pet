@echo off
setlocal
cd /d "%~dp0"
for /d %%D in ("dist\*") do (
  for %%F in ("%%~fD\*.exe") do (
    start "" "%%~fF"
    goto :done
  )
)
echo Packaged app not found. Trying dev mode...
call npm start
:done
endlocal
