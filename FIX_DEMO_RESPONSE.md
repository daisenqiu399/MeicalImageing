# 🔧 Fix: Still Seeing Demo Response

## Problem
You're still seeing: _"Thank you for your message. This is a demo response..."_

This means the ChatPanel cannot reach the AI proxy server.

---

## ✅ Solution Steps (Follow in Order)

### Step 1: Check if Proxy Server is Running

Open a NEW terminal and run:

```bash
yarn ai:proxy
```

**Expected Output:**
```
🚀 AI Proxy Server running on port 3001
📝 Endpoint: http://localhost:3001/api/ai/chat
💡 DeepSeek API configured: true
```

If you see this, **skip to Step 4**.

If you see errors, continue to Step 2.

---

### Step 2: Install Missing Dependencies

The proxy server needs these packages:

```bash
npm install express cors dotenv node-fetch --save
```

Then try starting again:
```bash
yarn ai:proxy
```

---

### Step 3: Verify Environment Setup

Check that `.env` file exists in project root:

```bash
# Windows PowerShell
Get-Content .env

# Mac/Linux
cat .env
```

**Should show:**
```
DEEPSEEK_API_KEY=sk-62205b9e712b460d9ae027676cda8246
PROXY_PORT=3001
```

If file doesn't exist, create it with the content above.

---

### Step 4: Test the Proxy Directly

Run the test script:

```bash
node test-ai-proxy.js
```

**If tests pass:** ✅ Proxy is working! Go to Step 5.

**If tests fail:** ❌ See error message for specific issue.

---

### Step 5: Clear Browser Cache & Reload

The frontend might be cached:

1. **Chrome/Edge:**
   - Press `Ctrl + Shift + Delete`
   - Select "Cached images and files"
   - Click "Clear data"
   - Hard refresh: `Ctrl + F5`

2. **Firefox:**
   - Press `Ctrl + Shift + Delete`
   - Check "Cache"
   - Click "Clear Now"
   - Hard refresh: `Ctrl + F5`

3. **Safari (Mac):**
   - Press `Cmd + Option + E`
   - Then `Cmd + R`

---

### Step 6: Check Browser Console

1. Open DevTools (F12)
2. Go to **Console** tab
3. Look for messages starting with:
   - `🔍 Attempting to call AI proxy...`
   - `❌ Error sending message to AI:`

**Common Errors:**

#### Error: "Failed to fetch"
**Meaning**: Proxy server not running or wrong URL

**Fix:**
```bash
# Make sure proxy is running
yarn ai:proxy

# Or restart OHIF with both servers
yarn dev:with-ai
```

#### Error: "Network request failed"
**Meaning**: Port 3001 blocked or firewall issue

**Fix:**
1. Check Windows Firewall
2. Try different port in `.env`:
   ```
   PROXY_PORT=3002
   ```
3. Update ChatPanel.tsx line ~53:
   ```typescript
   const response = await fetch('http://localhost:3002/api/ai/chat', {
   ```

#### Error: "CORS policy"
**Meaning**: CORS headers missing

**Fix:** Verify `server/ai-proxy.js` has:
```javascript
app.use(cors());
```

---

### Step 7: Restart Everything

Sometimes you need a clean start:

```bash
# 1. Stop all Node processes
# Windows: Ctrl+C in all terminals
# Mac/Linux: Ctrl+C

# 2. Kill any stuck processes
taskkill /F /IM node.exe  # Windows
killall node              # Mac/Linux

# 3. Clean browser cache completely
# Use browser settings or Ctrl+Shift+Delete

# 4. Start fresh
yarn dev:with-ai
```

Wait for both servers to fully start (~30 seconds).

---

### Step 8: Verify It's Working

1. **Check proxy logs** - Should show:
   ```
   🚀 AI Proxy Server running on port 3001
   ```

2. **Open browser console** - Should show NO errors

3. **Send test message** in OHIF chat

4. **Check proxy terminal** - Should show:
   ```
   POST /api/ai/chat 200 - - ms
   ```

5. **See AI response** in chat panel

---

## 🎯 Quick Diagnostic Commands

### Is proxy running?
```bash
curl http://localhost:3001/health
```

Should return: `{"status":"ok",...}`

### Can frontend reach proxy?
Open browser console and type:
```javascript
fetch('http://localhost:3001/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

Should log health status.

### Is .env loaded?
In proxy server terminal, check for:
```
💡 DeepSeek API configured: true
```

If `false`, API key not loaded.

---

## 🔍 Advanced Debugging

### Enable Verbose Logging

Add to `.env`:
```
LOG_LEVEL=debug
```

Restart proxy and check logs.

### Test with Different API Key Format

Sometimes keys have hidden characters:

```bash
# In .env, make sure NO quotes or spaces:
DEEPSEEK_API_KEY=sk-62205b9e712b460d9ae027676cda8246
# NOT like this:
DEEPSEEK_API_KEY="sk-62205b9e712b460d9ae027676cda8246"
```

### Check Network Tab

1. Open DevTools → Network tab
2. Send message in chat
3. Look for `ai/chat` request
4. Click it → Check:
   - **Status**: Should be 200
   - **Request URL**: Should be `http://localhost:3001/api/ai/chat`
   - **Response**: Should contain AI message

---

## 🆘 Still Not Working?

### Nuclear Option

Complete clean reinstall:

```bash
# 1. Delete everything
rm -rf node_modules
rm yarn.lock
rm .env

# 2. Reinstall
yarn install

# 3. Recreate .env
echo "DEEPSEEK_API_KEY=sk-62205b9e712b460d9ae027676cda8246" > .env
echo "PROXY_PORT=3001" >> .env

# 4. Install proxy dependencies
npm install express cors dotenv node-fetch

# 5. Start
yarn dev:with-ai
```

### Get Help

1. Run diagnostic script:
   ```bash
   node test-ai-proxy.js
   ```

2. Screenshot the output

3. Check these files:
   - `server/ai-proxy.js` - Proxy code
   - `extensions/default/src/Panels/ChatPanel.tsx` - Frontend code
   - `.env` - Configuration

4. Review logs in both terminals

---

## ✅ Success Indicators

You'll know it's working when:

✅ Proxy terminal shows: `POST /api/ai/chat 200`
✅ Browser console shows: `✅ Received AI response:`
✅ Chat displays actual AI response (not demo text)
✅ No errors in browser console
✅ Health check returns OK

---

## 📋 Checklist

Before asking for help, verify:

- [ ] `.env` file exists with correct API key
- [ ] Ran `npm install express cors dotenv`
- [ ] Proxy server started without errors
- [ ] Port 3001 is accessible
- [ ] Browser cache cleared
- [ ] Checked browser console for errors
- [ ] Ran `test-ai-proxy.js` successfully
- [ ] Verified network tab shows 200 status

---

**Last Updated**: 2026-03-15
**Version**: 1.1
**Applies To**: OHIF Viewer with DeepSeek Integration
