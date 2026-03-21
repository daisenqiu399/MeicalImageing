@echo off
REM Verification script for AI Chat Panel setup in OHIF Viewer
echo ========================================
echo AI Chat Panel Setup Verification
echo ========================================
echo.

echo [1/6] Checking ChatPanel component...
if exist "extensions\default\src\Panels\ChatPanel.tsx" (
    echo ✓ ChatPanel.tsx exists
) else (
    echo ✗ ChatPanel.tsx NOT found
)
echo.

echo [2/6] Checking panel module registration...
findstr /C:"name: 'chatPanel'" extensions\default\src\getPanelModule.tsx >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ chatPanel registered in getPanelModule.tsx
) else (
    echo ✗ chatPanel NOT registered in getPanelModule.tsx
)
echo.

echo [3/6] Checking Basic Viewer mode configuration...
findstr /C:"@ohif/extension-default.panelModule.chatPanel" modes\basic\src\index.tsx >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ Basic mode configured with chatPanel
) else (
    echo ✗ Basic mode NOT configured with chatPanel
)
echo.

echo [4/6] Checking Basic Dev mode configuration...
findstr /C:"@ohif/extension-default.panelModule.chatPanel" modes\basic-dev-mode\src\index.ts >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ Basic Dev mode configured with chatPanel
) else (
    echo ✗ Basic Dev mode NOT configured with chatPanel
)
echo.

echo [5/6] Checking Basic Test mode configuration...
findstr /C:"@ohif/extension-default.panelModule.chatPanel" modes\basic-test-mode\src\index.ts >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ Basic Test mode configured with chatPanel
) else (
    echo ✗ Basic Test mode NOT configured with chatPanel
)
echo.

echo [6/6] Checking Segmentation mode configuration...
findstr /C:"@ohif/extension-default.panelModule.chatPanel" modes\segmentation\src\index.tsx >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ Segmentation mode configured with chatPanel
) else (
    echo ✗ Segmentation mode NOT configured with chatPanel
)
echo.

echo ========================================
echo Summary
echo ========================================
echo.
echo If all checks passed (✓), the configuration is correct.
echo.
echo Next steps:
echo 1. Stop dev server if running (Ctrl+C)
echo 2. Clear browser cache (Ctrl+Shift+Delete)
echo 3. Run: yarn dev
echo 4. Test each mode
echo.
echo If still not working, see TROUBLESHOOTING_CHAT_PANEL.md
echo ========================================
