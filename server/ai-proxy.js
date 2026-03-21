/**
 * Backend API Proxy for DeepSeek AI
 *
 * This server acts as a secure proxy between the OHIF Viewer and DeepSeek API.
 * It protects your API key and adds medical image context to requests.
 *
 * IMPORTANT: Never expose your DeepSeek API key in client-side code!
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PROXY_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Store conversation history (in production, use Redis or database)
const conversations = new Map();

// DeepSeek API configuration
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

if (!DEEPSEEK_API_KEY) {
  console.error('⚠️  WARNING: DEEPSEEK_API_KEY not found in environment variables!');
  console.error('Please set it in .env file or export it before running.');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Chat endpoint
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, conversationHistory, studyContext } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build conversation messages for DeepSeek
    const systemPrompt = buildSystemPrompt(studyContext);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10), // Last 10 messages for context
      { role: 'user', content: message }
    ];

    // Call DeepSeek API
    const deepSeekResponse = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
        stream: false,
      }),
    });

    if (!deepSeekResponse.ok) {
      const errorData = await deepSeekResponse.json().catch(() => ({}));
      console.error('DeepSeek API Error:', errorData);

      if (deepSeekResponse.status === 401) {
        throw new Error('Invalid DeepSeek API key');
      } else if (deepSeekResponse.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`DeepSeek API error: ${deepSeekResponse.status}`);
      }
    }

    const completion = await deepSeekResponse.json();
    const aiResponse = completion.choices?.[0]?.message?.content || 'I received your message.';

    res.json({
      response: aiResponse,
      usage: completion.usage,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error in chat proxy:', error);

    res.status(500).json({
      error: error.message || 'Failed to process request',
      timestamp: new Date().toISOString(),
    });
  }
});

// Enhanced endpoint with medical image context
app.post('/api/ai/chat-with-context', async (req, res) => {
  try {
    const { message, conversationHistory, studyInfo, seriesInfo, measurements, segmentations } = req.body;

    // Build rich medical context
    const medicalContext = buildMedicalContext({
      studyInfo,
      seriesInfo,
      measurements,
      segmentations,
    });

    const systemPrompt = buildSystemPrompt(medicalContext);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10),
      { role: 'user', content: message }
    ];

    const deepSeekResponse = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        temperature: 0.6,
        max_tokens: 1500,
        stream: false,
      }),
    });

    const completion = await deepSeekResponse.json();
    const aiResponse = completion.choices?.[0]?.message?.content || '';

    res.json({
      response: aiResponse,
      usage: completion.usage,
      context: medicalContext,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error in contextual chat:', error);
    res.status(500).json({
      error: error.message || 'Failed to process request with context',
      timestamp: new Date().toISOString(),
    });
  }
});

// Helper function to build system prompt
function buildSystemPrompt(context) {
  return `You are an expert AI assistant specialized in medical imaging analysis. You help radiologists and healthcare professionals analyze and interpret medical images including CT, MRI, X-ray, ultrasound, and other modalities.

Your capabilities include:
- Explaining medical imaging findings
- Describing anatomical structures visible in images
- Discussing potential abnormalities and their significance
- Providing educational information about imaging techniques
- Assisting with measurements and segmentation interpretation

Important guidelines:
- Always be precise and professional
- Acknowledge uncertainty when present
- Recommend consultation with qualified radiologists for definitive interpretations
- Do not provide definitive diagnoses - support clinical decision-making
- Reference specific image features when relevant

${context ? `Current Context:\n${context}` : ''}

Provide clear, concise, and clinically relevant responses.`;
}

// Helper function to build medical context
function buildMedicalContext({ studyInfo, seriesInfo, measurements, segmentations }) {
  let context = [];

  if (studyInfo) {
    context.push(`Patient Age: ${studyInfo.patientAge || 'N/A'}`);
    context.push(`Sex: ${studyInfo.patientSex || 'N/A'}`);
    context.push(`Study Description: ${studyInfo.studyDescription || 'N/A'}`);
  }

  if (seriesInfo && seriesInfo.length > 0) {
    context.push('\nActive Series:');
    seriesInfo.forEach(series => {
      context.push(`- ${series.description} (${series.modality}, ${series.seriesNumber})`);
    });
  }

  if (measurements && measurements.length > 0) {
    context.push('\nMeasurements:');
    measurements.forEach(m => {
      context.push(`- ${m.type}: ${m.value} ${m.unit || ''}`);
    });
  }

  if (segmentations && segmentations.length > 0) {
    context.push('\nSegmentations:');
    segmentations.forEach(s => {
      context.push(`- ${s.name}: ${s.volume || 'N/A'}`);
    });
  }

  return context.join('\n') || 'No specific medical image context available.';
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Proxy Server running on port ${PORT}`);
  console.log(`📝 Endpoint: http://localhost:${PORT}/api/ai/chat`);
  console.log(`🏥 Contextual Endpoint: http://localhost:${PORT}/api/ai/chat-with-context`);
  console.log(`💡 DeepSeek API configured: ${!!DEEPSEEK_API_KEY}`);
});

module.exports = app;
