/**
 * Test Script for DeepSeek AI Proxy
 * Run this to verify your proxy server is working correctly
 */

const fetch = require('node-fetch');

async function testProxy() {
  console.log('🧪 Testing DeepSeek AI Proxy...\n');

  try {
    // Test 1: Health check
    console.log('Test 1: Health Check');
    const healthResponse = await fetch('http://localhost:3001/health');
    const healthData = await healthResponse.json();

    if (healthResponse.ok) {
      console.log('✅ Health check passed:', healthData);
    } else {
      console.log('❌ Health check failed');
      return;
    }
    console.log('');

    // Test 2: Basic chat
    console.log('Test 2: Basic Chat Request');
    const chatResponse = await fetch('http://localhost:3001/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Hello, this is a test message.',
        conversationHistory: [],
      }),
    });

    console.log('📡 Response Status:', chatResponse.status);

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      console.log('❌ Chat request failed:', errorText);
      return;
    }

    const chatData = await chatResponse.json();
    console.log('✅ Chat response received:');
    console.log('   Response:', chatData.response?.substring(0, 100) + '...');
    console.log('   Timestamp:', chatData.timestamp);
    console.log('');

    // Test 3: Conversation with history
    console.log('Test 3: Conversation with History');
    const conversationResponse = await fetch('http://localhost:3001/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'What did I say before?',
        conversationHistory: [
          { role: 'user', content: 'Hello!' },
          { role: 'assistant', content: 'Hi there! How can I help?' },
        ],
      }),
    });

    const conversationData = await conversationResponse.json();
    console.log('✅ Conversation response:', conversationData.response?.substring(0, 100) + '...');
    console.log('');

    console.log('🎉 All tests passed! Your AI proxy is working correctly.');
    console.log('\nNext steps:');
    console.log('1. Open OHIF Viewer: http://localhost:3000');
    console.log('2. Select Segmentation mode');
    console.log('3. Open right panel → AI Assistant');
    console.log('4. Send a test message!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure proxy server is running: yarn ai:proxy');
    console.error('2. Check that port 3001 is accessible');
    console.error('3. Verify .env file has DEEPSEEK_API_KEY set');
    console.error('4. Check proxy server logs for errors');
  }
}

// Run the test
testProxy();
