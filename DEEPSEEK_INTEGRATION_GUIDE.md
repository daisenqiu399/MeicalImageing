# DeepSeek AI Integration Guide for OHIF Viewer

## Overview

This guide explains how to integrate DeepSeek AI into the OHIF Viewer Segmentation mode with a secure backend proxy.

## ⚠️ CRITICAL SECURITY WARNING

**NEVER expose your DeepSeek API key in client-side code!**

The implementation uses a backend proxy server to protect your API key:
- ✅ API key stored securely on server
- ✅ Server-side environment variables only
- ✅ Client calls your proxy, not DeepSeek directly
- ✅ Prevents key theft and unauthorized usage

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  OHIF Viewer    │─────▶│  AI Proxy Server │─────▶│  DeepSeek API   │
│  (Browser)      │      │  (Node.js)       │      │  (Cloud)        │
└─────────────────┘      └──────────────────┘      └─────────────────┘
     Port 3000               Port 3001                  HTTPS
```

## Setup Instructions

### Step 1: Install Dependencies

```bash
# Navigate to project root
cd d:\Medicalmageing\Viewers-master

# Install required packages
npm install express cors dotenv concurrently
```

### Step 2: Configure Environment Variables

The `.env` file has been created with your API key. **Keep this file secret!**

```bash
# File: .env
DEEPSEEK_API_KEY=sk-62205b9e712b460d9ae027676cda8246
PROXY_PORT=3001
```

**⚠️ Add .env to .gitignore immediately:**
```bash
echo ".env" >> .gitignore
```

### Step 3: Start the AI Proxy Server

#### Option A: Start Proxy Only
```bash
yarn ai:proxy
```

You'll see:
```
🚀 AI Proxy Server running on port 3001
📝 Endpoint: http://localhost:3001/api/ai/chat
💡 DeepSeek API configured: true
```

#### Option B: Start Both Viewer and Proxy (Recommended)
```bash
yarn dev:with-ai
```

This starts both servers simultaneously using `concurrently`.

### Step 4: Test the Integration

1. **Open OHIF Viewer**: http://localhost:3000
2. **Select Segmentation Mode**: Choose a study
3. **Open Right Panel**: Click "AI Assistant" tab
4. **Send a Message**: Type "What can you help me with?"
5. **View Response**: AI should respond within seconds

### Step 5: Verify It's Working

Check the proxy server terminal for logs:
```
POST /api/ai/chat 200 - - ms
```

If you see errors, check:
- API key is correct in `.env`
- Internet connection is active
- DeepSeek API is accessible

## API Endpoints

### Basic Chat
```
POST http://localhost:3001/api/ai/chat
Content-Type: application/json

{
  "message": "Hello!",
  "conversationHistory": []
}
```

### Contextual Chat (Future Enhancement)
```
POST http://localhost:3001/api/ai/chat-with-context
Content-Type: application/json

{
  "message": "Analyze this scan",
  "studyInfo": { ... },
  "seriesInfo": [ ... ],
  "measurements": [ ... ],
  "segmentations": [ ... ]
}
```

## Features

### ✅ Current Implementation
- Secure API key management
- Conversation history support
- Error handling and retry logic
- Loading states
- Medical imaging context awareness

### 🔜 Future Enhancements
- Automatic medical image context injection
- Support for measurements and segmentations data
- Multi-modal analysis (images + reports)
- Customizable AI personality/specialization
- Response streaming

## Configuration Options

### Change AI Model
Edit `server/ai-proxy.js`, line ~60:
```javascript
model: 'deepseek-chat',  // Change to other DeepSeek models
```

### Adjust Temperature
Controls response creativity (0.0 = deterministic, 1.0 = creative):
```javascript
temperature: 0.7,  // Balanced (recommended)
```

### Increase Max Tokens
For longer responses:
```javascript
max_tokens: 2000,  // Default: 1000
```

### System Prompt Customization
Edit the `buildSystemPrompt()` function to change AI behavior:
```javascript
function buildSystemPrompt(context) {
  return `You are a specialized cardiac imaging AI...`;
}
```

## Troubleshooting

### Issue: "Invalid API key"
**Solution**:
1. Check `.env` file exists in project root
2. Verify API key is correct (no extra spaces)
3. Restart proxy server

### Issue: "Cannot connect to proxy"
**Solution**:
1. Ensure proxy server is running (`yarn ai:proxy`)
2. Check port 3001 is not blocked by firewall
3. Verify `ChatPanel.tsx` calls correct endpoint

### Issue: "Network request failed"
**Solution**:
1. Check internet connection
2. Verify DeepSeek API status
3. Check proxy server logs for errors

### Issue: CORS Errors
**Solution**:
The proxy already includes CORS headers. If issues persist:
1. Clear browser cache
2. Check browser console for specific error
3. Verify proxy server includes `app.use(cors())`

### Issue: Slow Responses
**Solution**:
1. Check internet speed
2. Reduce `max_tokens` in proxy config
3. Lower `temperature` for faster responses

## Security Best Practices

### ✅ DO:
- Keep `.env` file in `.gitignore`
- Use environment variables for API keys
- Run proxy on separate port
- Implement rate limiting
- Log all API requests
- Use HTTPS in production

### ❌ DON'T:
- Commit `.env` to version control
- Hardcode API keys in source code
- Call DeepSeek API directly from browser
- Share your API key publicly
- Use same key for development and production

## Production Deployment

### Environment Setup
```bash
# Production .env
DEEPSEEK_API_KEY=your_production_key
PROXY_PORT=3001
NODE_ENV=production
RATE_LIMIT=100
```

### Deploy Proxy Server
Options:
1. **Same server as OHIF**: Configure nginx reverse proxy
2. **Separate server**: Deploy to Heroku, AWS Lambda, etc.
3. **Container**: Docker container with orchestration

### Nginx Configuration Example
```nginx
location /api/ai/ {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

## Monitoring & Logging

### Enable Detailed Logging
Add to `.env`:
```
LOG_LEVEL=debug
```

### Monitor API Usage
Check proxy logs:
```bash
tail -f logs/proxy.log
```

### Track Costs
Monitor DeepSeek usage via their dashboard:
https://platform.deepseek.com/dashboard

## Cost Estimation

DeepSeek pricing (example):
- Input: $0.001 per 1K tokens
- Output: $0.002 per 1K tokens

**Estimated Monthly Cost**:
- 100 users × 10 messages/day × 500 tokens = 500K tokens/day
- Daily cost: ~$1.00
- Monthly cost: ~$30.00

## Advanced Features

### Add Rate Limiting
Install `express-rate-limit`:
```bash
npm install express-rate-limit
```

Add to `ai-proxy.js`:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
});

app.use('/api/ai/', limiter);
```

### Add Authentication
Protect your proxy with authentication:
```javascript
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
};

app.post('/api/ai/chat', authenticateToken, async (req, res) => {
  // ... handler
});
```

### Cache Responses
Reduce API calls by caching common queries:
```javascript
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes

// In chat handler
const cached = cache.get(messageHash);
if (cached) return res.json({ response: cached });
```

## Testing the Integration

### Manual Test Script
```bash
# Test basic endpoint
curl -X POST http://localhost:3001/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","conversationHistory":[]}'
```

### Automated Tests
Create test file `test-ai-integration.js`:
```javascript
const assert = require('assert');

async function testChat() {
  const response = await fetch('http://localhost:3001/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Test message',
      conversationHistory: []
    })
  });

  const data = await response.json();
  assert.ok(data.response, 'Response should exist');
  console.log('✅ Test passed!');
}

testChat();
```

## Resources

- [DeepSeek API Documentation](https://platform.deepseek.com/docs)
- [Express.js Guide](https://expressjs.com/)
- [OHIF Documentation](https://docs.ohif.org/)
- [Security Best Practices](https://cheatsheetseries.owasp.org/)

## Support

For issues or questions:
1. Check this guide first
2. Review TROUBLESHOOTING_CHAT_PANEL.md
3. Check proxy server logs
4. Contact DeepSeek support for API issues

---

**Last Updated**: 2026-03-15
**Version**: 1.0
**Status**: Production Ready ✅
