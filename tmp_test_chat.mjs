import { createAgent } from '@pipefx/ai';
import { ConnectorRegistry } from '@pipefx/mcp';

async function test() {
    const registry = new ConnectorRegistry();
    const agent = createAgent({
        model: 'gemini-1.5-pro',
        apiKey: 'AIzaSyA9btK-hkj-0KehGoaryjqHi75qzRxsySw',
        systemPrompt: "You are an expert translator. First, call `render_timeline_audio`...",
        registry
    });
    
    try {
        console.log("Starting chat...");
        const text = await agent.chat("Test", {
            modelOverride: 'gemini-1.5-pro'
        });
        console.log("Success:", text);
    } catch (err) {
        console.error("Error occurred:", err);
    }
}
test();
