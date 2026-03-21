# AI Chat Panel Integration Guide

## Overview
This guide explains how to integrate a real AI/LLM backend with the Chat Panel in the Segmentation mode.

## Current Implementation

The Chat Panel has been added to the Segmentation mode and replaces the default segmentation panels on the right side. The panel features:

- **ChatGPT-like interface**: Modern, clean UI with message bubbles
- **User messages**: Displayed on the right in blue
- **AI responses**: Displayed on the left in gray
- **Auto-scrolling**: Automatically scrolls to latest message
- **Loading states**: Animated typing indicator
- **Enter to send**: Press Enter to send messages, Shift+Enter for new line
- **Auto-resize textarea**: Input field grows with content

## Files Modified/Created

1. **New Chat Panel Component**: `extensions/default/src/Panels/ChatPanel.tsx`
2. **Panel Module Registration**: `extensions/default/src/getPanelModule.tsx`
3. **Segmentation Mode Configuration**: `modes/segmentation/src/index.tsx`
4. **Translations**: `platform/i18n/src/locales/en-US/ChatPanel.json`

## Integrating with a Real AI Backend

To connect the Chat Panel to a real AI service (like OpenAI GPT, Anthropic Claude, or a custom medical AI), follow these steps:

### 1. Update the `handleSendMessage` function

In `extensions/default/src/Panels/ChatPanel.tsx`, replace the simulated response with an actual API call:

```typescript
const handleSendMessage = async () => {
  if (!inputValue.trim()) return;

  const userMessage: Message = {
    id: Date.now().toString(),
    role: 'user',
    content: inputValue.trim(),
    timestamp: new Date(),
  };

  setMessages(prev => [...prev, userMessage]);
  setInputValue('');
  setIsLoading(true);

  try {
    // Example: Call to your AI backend API
    const response = await fetch('YOUR_AI_API_ENDPOINT', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${YOUR_API_KEY}`,
      },
      body: JSON.stringify({
        message: inputValue.trim(),
        // You can also send additional context like:
        // - Current study information
        // - Active viewport images
        // - Selected segments
        // - Measurements
      }),
    });

    if (!response.ok) {
      throw new Error('API request failed');
    }

    const data = await response.json();

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: data.response, // Adjust based on your API response structure
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);
  } catch (error) {
    console.error('Error sending message to AI:', error);

    // Show error message to user
    const errorMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: 'Sorry, I encountered an error processing your request. Please try again.',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, errorMessage]);
  } finally {
    setIsLoading(false);
  }
};
```

### 2. Access Medical Image Context

To provide contextual AI assistance, you can access the current medical image data:

```typescript
// Add servicesManager prop to the component
const ChatPanel: React.FC<{ servicesManager?: any }> = ({ servicesManager }) => {
  // Access services
  const {
    measurementService,
    segmentationService,
    viewportGridService,
    displaySetService,
  } = servicesManager?.services || {};

  // Get current study/series information
  // Get active measurements
  // Get active segmentations
  // etc.

  // Include this context in your API request
};
```

### 3. Example API Integration (OpenAI GPT)

```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful AI assistant for medical image analysis. Provide accurate information about medical imaging findings.'
      },
      ...messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: inputValue.trim()
      }
    ],
    temperature: 0.7,
    max_tokens: 500,
  }),
});

const data = await response.json();
const aiResponse = data.choices[0].message.content;
```

### 4. Example API Integration (Custom Medical AI Server)

Create a backend service that:
- Receives user questions
- Processes medical image metadata
- Returns AI-generated insights

```typescript
const response = await fetch('http://your-medical-ai-server.com/api/analyze', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    question: inputValue.trim(),
    studyInstanceUID: currentStudyUID,
    seriesInstanceUIDs: currentSeriesUIDs,
    measurements: currentMeasurements,
    segmentations: currentSegmentations,
    conversationHistory: messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  }),
});
```

## Security Considerations

1. **API Keys**: Never expose API keys in client-side code. Use a backend proxy server.
2. **HIPAA Compliance**: Ensure your AI provider is HIPAA compliant if handling PHI.
3. **Data Anonymization**: Remove patient identifiers before sending to AI services.
4. **Audit Logging**: Log all AI interactions for compliance and quality assurance.

## Customization Options

### Change Panel Position

To show both chat and segmentation panels, update `modes/segmentation/src/index.tsx`:

```typescript
rightPanels: [
  '@ohif/extension-default.panelModule.chatPanel',
  cornerstone.labelMapSegmentationPanel,
  cornerstone.contourSegmentationPanel,
],
```

### Styling

Modify the Tailwind CSS classes in `ChatPanel.tsx` to match your branding.

### Add Features

Consider adding:
- Voice input
- Image annotation suggestions
- Structured reporting
- Measurement recommendations
- Differential diagnosis suggestions
- Educational content

## Testing

Test the integration by:
1. Starting the development server
2. Opening a study in Segmentation mode
3. Clicking the "AI Assistant" tab in the right panel
4. Sending a message
5. Verifying the API call and response

## Troubleshooting

**Issue**: Panel doesn't appear
- Check that the extension is properly registered
- Verify the panel module ID matches in the mode configuration

**Issue**: Messages don't send
- Check browser console for errors
- Verify API endpoint is accessible
- Ensure proper authentication

**Issue**: Slow responses
- Optimize API calls
- Add timeout handling
- Consider streaming responses

## Next Steps

1. Set up your AI backend service
2. Implement the API integration
3. Add medical image context to requests
4. Test thoroughly with real use cases
5. Deploy to production with proper security measures

For questions or issues, refer to the OHIF documentation or community forums.
