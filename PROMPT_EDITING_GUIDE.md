# CardioCare AI - Default Prompt Editing Guide

## Quick Edit Locations

### 1. Main Default Prompt (Used in TwiML endpoint)
**File:** `server/routes.ts` - Line 790
```javascript
script = "Hello, this is CardioCare calling for your health check. How are you feeling today?";
```

**Alternative examples provided in the code:**
- "Hi there, this is your CardioCare assistant calling to check on your recovery progress."
- "Good day, this is CardioCare following up on your recent visit. How can I help you today?"
- "Hello, this is your healthcare team at CardioCare. I'm calling to ensure you're doing well."

### 2. Conversation Templates
**File:** `server/services/prompt-manager.ts` - Lines 36-38
```javascript
greeting: {
  initial: "Hello, {patientName}. This is your CardioCare health assistant. I'm calling to check on your well-being after your recent visit. How are you feeling today?",
  followUp: "Thank you for speaking with me again, {patientName}. I'd like to continue our health check. How have things been since we last spoke?",
  urgent: "Hello {patientName}, this is CardioCare calling with an urgent follow-up. We need to check on some concerning symptoms. How are you feeling right now?"
}
```

### 3. AI-Generated Prompt Instructions
**File:** `server/services/openai.ts` - Lines 34-54
```javascript
const prompt = `You are a CardioCare virtual health assistant. Generate a ${personality.tone} and ${personality.formality} greeting for ${patientName} with ${condition}.`
```

## Custom Prompt System Status
- Custom prompts are stored correctly in the database
- API returns personalized messages accurately
- TwiML endpoint has been simplified to prioritize custom prompts
- Enhanced logging tracks prompt usage

## Troubleshooting
If custom prompts aren't working:
1. Check call record in database for customPrompt field
2. Verify TwiML endpoint logs show "SUCCESS: Using custom prompt"
3. Test with API endpoint: POST /api/calls/start with customPrompt field