# AI Chat Panel Setup Verification Script for PowerShell

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AI Chat Panel Setup Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allPassed = $true

# Check 1: ChatPanel component exists
Write-Host "[1/6] Checking ChatPanel component..." -NoNewline
if (Test-Path "extensions\default\src\Panels\ChatPanel.tsx") {
    Write-Host " ✓ ChatPanel.tsx exists" -ForegroundColor Green
} else {
    Write-Host " ✗ ChatPanel.tsx NOT found" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Check 2: Panel module registration
Write-Host "[2/6] Checking panel module registration..." -NoNewline
$content = Get-Content "extensions\default\src\getPanelModule.tsx" -Raw
if ($content -match "name:\s*'chatPanel'") {
    Write-Host " ✓ chatPanel registered in getPanelModule.tsx" -ForegroundColor Green
} else {
    Write-Host " ✗ chatPanel NOT registered in getPanelModule.tsx" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Check 3: Basic Viewer mode
Write-Host "[3/6] Checking Basic Viewer mode configuration..." -NoNewline
$content = Get-Content "modes\basic\src\index.tsx" -Raw
if ($content -match "@ohif/extension-default\.panelModule\.chatPanel") {
    Write-Host " ✓ Basic mode configured with chatPanel" -ForegroundColor Green
} else {
    Write-Host " ✗ Basic mode NOT configured with chatPanel" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Check 4: Basic Dev mode
Write-Host "[4/6] Checking Basic Dev mode configuration..." -NoNewline
$content = Get-Content "modes\basic-dev-mode\src\index.ts" -Raw
if ($content -match "@ohif/extension-default\.panelModule\.chatPanel") {
    Write-Host " ✓ Basic Dev mode configured with chatPanel" -ForegroundColor Green
} else {
    Write-Host " ✗ Basic Dev mode NOT configured with chatPanel" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Check 5: Basic Test mode
Write-Host "[5/6] Checking Basic Test mode configuration..." -NoNewline
$content = Get-Content "modes\basic-test-mode\src\index.ts" -Raw
if ($content -match "@ohif/extension-default\.panelModule\.chatPanel") {
    Write-Host " ✓ Basic Test mode configured with chatPanel" -ForegroundColor Green
} else {
    Write-Host " ✗ Basic Test mode NOT configured with chatPanel" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Check 6: Segmentation mode
Write-Host "[6/6] Checking Segmentation mode configuration..." -NoNewline
$content = Get-Content "modes\segmentation\src\index.tsx" -Raw
if ($content -match "@ohif/extension-default\.panelModule\.chatPanel") {
    Write-Host " ✓ Segmentation mode configured with chatPanel" -ForegroundColor Green
} else {
    Write-Host " ✗ Segmentation mode NOT configured with chatPanel" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($allPassed) {
    Write-Host "✓ All checks passed! Configuration is correct." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Stop dev server if running (Ctrl+C)" -ForegroundColor White
    Write-Host "2. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor White
    Write-Host "3. Run: yarn dev" -ForegroundColor White
    Write-Host "4. Test each mode" -ForegroundColor White
    Write-Host ""
    Write-Host "If still not working, see TROUBLESHOOTING_CHAT_PANEL.md" -ForegroundColor Gray
} else {
    Write-Host "✗ Some checks failed! Please review the errors above." -ForegroundColor Red
    Write-Host ""
    Write-Host "See TROUBLESHOOTING_CHAT_PANEL.md for solutions" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan
