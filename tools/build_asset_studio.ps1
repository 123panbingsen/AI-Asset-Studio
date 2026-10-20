# 打包 Eclipsed Asset Studio 为单文件 exe
$ErrorActionPreference = "Stop"
$proj = "C:\Users\Administrator\EclipsedBlade"
$py = "C:\Users\Administrator\.venvs\asset_studio\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "venv 不存在: $py" }

$out = Join-Path $proj "tools\asset_studio\dist"
$work = Join-Path $proj "tools\asset_studio\build"
$spec = Join-Path $proj "tools\asset_studio"
$entry = Join-Path $proj "tools\asset_studio\launcher.py"

& $py -m PyInstaller --noconfirm --clean --onefile --windowed `
  --name AssetStudio --icon (Join-Path $proj "tools\asset_studio\icon.ico") `
  --distpath $out --workpath $work --specpath $spec `
  --paths (Join-Path $proj "tools") `
  --add-data "$proj\tools\asset_studio\ai_worker.py;." `
  --add-data "$proj\tools\asset_studio\fonts;fonts" `
  --collect-all tkinterdnd2 `
  --exclude-module cv2 --exclude-module rembg --exclude-module onnxruntime --exclude-module torch --exclude-module scipy `
  $entry

if ($LASTEXITCODE -eq 0) {
  "OK -> " + (Join-Path $out "AssetStudio.exe")
} else {
  throw "PyInstaller failed: $LASTEXITCODE"
}





