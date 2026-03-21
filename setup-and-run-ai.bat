@echo off
REM Quick Start Script for OHIF Viewer with DeepSeek AI Integration
REM This script installs dependencies and starts both servers

echo ========================================
echo OHIF Viewer + DeepSeek AI Setup
echo ========================================
echo.

echo [1/4] Installing required packages...
call npm install express cors dotenv concurrently --save
if %errorlevel% neq 0 (
    echo ✗ Installation failed!
    exit /b 1
)
echo ✓ Packages installed successfully
echo.

echo [2/4] Checking environment configuration...
if not exist ".env" (
    echo ✗ .env file not found!
    echo Please create .env file with your DEEPSEEK_API_KEY
    exit /b 1
)
echo ✓ Environment configuration found
echo.

echo [3/4] Verifying API key...
findstr /C:"DEEPSEEK_API_KEY=" .env >nul 2>&1
if %errorlevel% neq 0 (
    echo ✗ DEEPSEEK_API_KEY not found in .env!
    exit /b 1
)
echo ✓ API key configured
echo.

echo [4/4] Starting servers...
echo.
echo ========================================
echo Starting OHIF Viewer and AI Proxy
echo ========================================
echo.
echo OHIF Viewer: http://localhost:3000
echo AI Proxy:    http://localhost:3001
echo.
echo Press Ctrl+C to stop all servers
echo ========================================
echo.

yarn dev:with-ai
