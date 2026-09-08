$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
  python -m pip install -r requirements.txt
  python -m PyInstaller --noconfirm --clean timetable-engine.spec
} finally {
  Pop-Location
}