# Troubleshooting: AI Chat Panel Not Showing in Basic/Test Modes

## Problem
The AI chat panel appears in Segmentation mode but not in Basic Viewer or Test Basic Viewer modes.

## Solution Steps

### 1. Restart Development Server

The most common issue is that the dev server is still running with old configuration.

```bash
# Stop the current dev server (Ctrl+C)
# Then restart:
yarn dev
```

### 2. Clear Browser Cache

Old cached files may prevent the new configuration from loading.

**Chrome/Edge:**
- Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
- Select "Cached images and files"
- Click "Clear data"
- Refresh the page with `Ctrl+F5` or `Cmd+Shift+R`

**Firefox:**
- Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
- Check "Cache"
- Click "Clear Now"
- Hard refresh with `Ctrl+F5` or `Cmd+Shift+R`

### 3. Verify Panel Module Registration

Check that the panel module is properly registered in the default extension:

**File**: `extensions/default/src/getPanelModule.tsx`

Should include:
```typescript
{
  name: 'chatPanel',
  iconName: 'tab-chat',
  iconLabel: 'AI Assistant',
  label: i18n.t('ChatPanel:AI Assistant'),
  component: () => <ChatPanel />,
}
```

### 4. Check Mode Configuration

Verify each mode has the correct right panel configuration:

#### Basic Viewer Mode
**File**: `modes/basic/src/index.tsx` (line ~289-291)
```typescript
rightPanels: [
  '@ohif/extension-default.panelModule.chatPanel',
],
```

#### Basic Dev Mode
**File**: `modes/basic-dev-mode/src/index.ts` (line ~139-141)
```typescript
rightPanels: [
  '@ohif/extension-default.panelModule.chatPanel',
],
```

#### Basic Test Mode
**File**: `modes/basic-test-mode/src/index.ts` (line ~242-244)
```typescript
rightPanels: [
  '@ohif/extension-default.panelModule.chatPanel',
],
```

#### Segmentation Mode (Working Example)
**File**: `modes/segmentation/src/index.tsx` (line ~207-209)
```typescript
rightPanels: [
  '@ohif/extension-default.panelModule.chatPanel',
],
```

### 5. Check Browser Console for Errors

Open browser DevTools (F12) and check for errors:

**Common Errors:**
- `Module not found` - Extension not registered
- `Component is not a function` - Import issue
- `Cannot read property 'panelModule'` - Module path incorrect

### 6. Verify ChatPanel Component Exists

Check that all required files exist:

```bash
# Should exist:
extensions/default/src/Panels/ChatPanel.tsx
extensions/default/src/Panels/index.js (exports ChatPanel)
platform/i18n/src/locales/en-US/ChatPanel.json
```

### 7. Full Rebuild

If still not working, do a complete rebuild:

```bash
# Stop dev server
# Clean cache
rm -rf node_modules/.cache  # Mac/Linux
rmdir /s /q node_modules\.cache  # Windows

# Reinstall dependencies
yarn install

# Restart dev server
yarn dev
```

### 8. Test Each Mode Separately

#### Test Segmentation Mode (Should Work)
1. Navigate to worklist
2. Select a study
3. Choose "Segmentation" mode
4. Right panel should show "AI Assistant" tab

#### Test Basic Viewer Mode
1. Navigate to worklist
2. Select a study
3. Choose "Basic" mode OR go to `/viewer` route
4. Right panel should show "AI Assistant" tab
5. If not visible, check if panel is collapsed (click right edge to expand)

#### Test Basic Dev Mode
1. Go to `/viewer-cs3d` route
2. Right panel should show "AI Assistant" tab

#### Test Basic Test Mode
1. Go to `/basic-test` route
2. Right panel should show "AI Assistant" tab

### 9. Manual Panel Service Check

Add this console log to debug (temporarily):

**File**: `platform/core/src/services/PanelService/PanelService.tsx`

Find the `getPanelData` method and add:
```typescript
console.log('Getting panel data for:', panelId);
```

This will show if the panel service is trying to load the chat panel.

### 10. Check Panel Visibility

The panel might be loaded but hidden:

- Look for a tab labeled "AI Assistant" on the right side
- Check if `rightPanelClosed: false` is set in mode config
- Try clicking the right edge of the viewport to expand hidden panel
- Look for panel toggle button in the UI

## Expected Behavior

When working correctly:
1. Right sidebar shows tabs at the top
2. One tab should be "AI Assistant" with a chat icon
3. Clicking it shows the chat interface
4. Chat interface has:
   - Header with "AI Assistant" title
   - Message area with welcome message
   - Input field at bottom

## Quick Test Command

Run this to verify all files are correct:

```bash
# Check if ChatPanel component exists
ls extensions/default/src/Panels/ChatPanel.tsx

# Check if panel module exports it
grep -n "chatPanel" extensions/default/src/getPanelModule.tsx

# Check if basic mode imports it
grep -n "chatPanel" modes/basic/src/index.tsx

# Check if test mode imports it
grep -n "chatPanel" modes/basic-test-mode/src/index.ts

# Check if segmentation mode imports it
grep -n "chatPanel" modes/segmentation/src/index.tsx
```

All commands should return results showing the chat panel references.

## Common Issues & Solutions

### Issue: Panel tabs not showing
**Solution**: Panel service might not be initializing. Check browser console for errors.

### Issue: Tab shows but is empty
**Solution**: ChatPanel component import failed. Verify file paths.

### Issue: Only shows in some modes
**Solution**: Those modes have correct config, others need updating. Compare configurations.

### Issue: Shows old panels (measurements/segmentation)
**Solution**: Browser cache or dev server needs restart. Clear cache and restart.

## Still Not Working?

If none of the above works, try this nuclear option:

```bash
# Complete clean install
rm -rf node_modules
rm yarn.lock
yarn install
yarn dev
```

Then test each mode one by one, starting with Segmentation (which is known to work).

## Success Indicators

You'll know it's working when:
- ✅ Right panel has "AI Assistant" tab
- ✅ Clicking tab shows chat interface
- ✅ Can type and send messages
- ✅ Works in ALL modes (Basic, Dev, Test, Segmentation)

---

**Last Updated**: 2026-03-15
**Applies To**: OHIF Viewer v3.x with AI Chat Panel
