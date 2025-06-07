import WebSocket from 'ws';
import fetch from 'node-fetch';

async function testWebSocketConnection() {
  try {
    // First create a session
    const sessionResponse = await fetch('http://localhost:5000/api/realtime/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        patientId: 1, 
        patientName: "Test Patient", 
        callId: 999 
      })
    });
    
    if (!sessionResponse.ok) {
      throw new Error('Failed to create session');
    }
    
    const sessionData = await sessionResponse.json();
    console.log('Session created:', sessionData.sessionId);
    
    // Test WebSocket connection
    const wsUrl = `ws://localhost:5000${sessionData.websocketUrl}`;
    console.log('Connecting to:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout'));
      }, 10000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        console.log('✅ WebSocket connection successful');
        ws.close();
        resolve(true);
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        console.log('❌ WebSocket connection failed:', error.message);
        reject(error);
      });
      
      ws.on('message', (data) => {
        console.log('📨 Received message:', data.toString());
      });
      
      ws.on('close', (code, reason) => {
        console.log('🔌 Connection closed:', code, reason.toString());
      });
    });
    
  } catch (error) {
    console.error('Test failed:', error.message);
    throw error;
  }
}

// Run the test
testWebSocketConnection()
  .then(() => {
    console.log('WebSocket test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('WebSocket test failed:', error.message);
    process.exit(1);
  });