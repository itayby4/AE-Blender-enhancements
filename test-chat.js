
async function testChat(llmModel) {
  try {
    console.log(`\nTesting ${llmModel}...`);
    const resp = await fetch('http://localhost:3001/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hello!',
        llmModel: llmModel,
        history: []
      })
    });
    
    const data = await resp.json();
    require('fs').writeFileSync(`${llmModel}-resp.json`, JSON.stringify(data, null, 2));
    console.log(`Saved ${llmModel}-resp.json`);
  } catch (err) {
    console.error(`Error for ${llmModel}:`, err);
  }
}

async function run() {
  const { ConnectorRegistry } = require('./packages/mcp/dist/index.js');
  const { mapToolsToAnthropic } = require('./packages/ai/dist/lib/tool-mapper.js');
  
  try {
    const reg = new ConnectorRegistry();
    // Assuming backend config loads connectors
    console.log("We just need to check the schemas.");
  } catch(e) {}
  
  await testChat('claude-sonnet-4.6');
}

run();
