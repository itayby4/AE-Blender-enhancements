import { GoogleGenAI } from '@google/genai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from 'http';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables (.env file)
dotenv.config();

// Ensure API key is present
const geminiApiKeyRaw = process.env.GEMINI_API_KEY;
if (!geminiApiKeyRaw) {
    console.error('ERROR: GEMINI_API_KEY is not set in the environment variables.');
    process.exit(1);
}

// Clean the key from any accidental unicode chars, quotes, or whitespace
const geminiApiKey = geminiApiKeyRaw.replace(/[\u0590-\u05FF]/g, '').replace(/["']/g, '').trim();

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

// Initialize MCP Client
const mcpClient = new Client({
    name: "PipeFX AI Engine",
    version: "1.0.0"
}, {
    capabilities: {}
});

async function startMcpClient() {
    // Determine the absolute path to the root of the Nx workspace
    // When running via 'nx serve', the current working directory is the project root (pipefx)
    const workspaceRoot = process.cwd();
    
    // Configure the transport to run the Python server we created in Step 1
    const serverScriptPath = path.join(workspaceRoot, 'apps/mcp-davinci/apps/mcp-davinci/server.py');
    const venvPythonPath = path.join(workspaceRoot, 'apps/mcp-davinci/apps/mcp-davinci/venv/Scripts/python.exe');

    console.log(`Connecting to DaVinci MCP Server using Python: ${venvPythonPath}`);
    console.log(`Executing script at: ${serverScriptPath}`);
    
    const transport = new StdioClientTransport({
        command: venvPythonPath,
        args: [serverScriptPath]
    });

    try {
        await mcpClient.connect(transport);
        console.log('Successfully connected to DaVinci Resolve MCP Server!');
        return true;
    } catch (error) {
        console.error('Failed to connect to MCP Server:', error);
        return false;
    }
}

async function processChatMessage(userMessage: string): Promise<string> {
    console.log(`\nProcessing user message: "${userMessage}"`);
    
    // 1. Fetch available tools from our DaVinci MCP Server
    const { tools } = await mcpClient.listTools();
    console.log(`Loaded ${tools.length} tools from DaVinci Resolve.`);

    // 2. Format tools for Gemini API
    const geminiTools = tools.map(tool => ({
        functionDeclarations: [{
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema as any
        }]
    }));

    // 3. System Instruction to give Gemini context
    const systemInstruction = `You are the PipeFX AI, an expert video editing assistant natively connected to DaVinci Resolve via the Model Context Protocol.
You have tools available to control DaVinci Resolve. When the user asks you to do something, use your tools to do it.
If a tool execution fails, explain what happened to the user.
Always be concise, professional, and friendly.`;

    try {
        console.log('Sending request to Gemini...');
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction,
                tools: geminiTools,
            }
        });

        let response = await chat.sendMessage({ message: userMessage });

        // 4. Handle tool calls if Gemini decides to use one
        while (response.functionCalls && response.functionCalls.length > 0) {
            const call = response.functionCalls[0];
            const callName = call.name || "unknown_tool";
            
            console.log(`\nGemini requested to run tool: ${callName}`);
            console.log(`Arguments:`, call.args);

            try {
                // Execute the tool on the DaVinci MCP Server
                const result = await mcpClient.callTool({
                    name: callName,
                    arguments: call.args as any
                });

                console.log(`Tool execution result:`, result.content);

                // Send the result back to Gemini so it can answer the user
                response = await chat.sendMessage({
                    message: [{
                        functionResponse: {
                            name: call.name,
                            response: { result }
                        }
                    }]
                });
            } catch (toolError) {
                console.error(`Error executing tool ${call.name}:`, toolError);
                // Inform Gemini about the error
                response = await chat.sendMessage({
                    message: [{
                        functionResponse: {
                            name: callName,
                            response: { error: String(toolError) }
                        }
                    }]
                });
            }
        }

        // 5. Final output
        if (response.text) {
            console.log(`\nAI Response: ${response.text}`);
            return response.text;
        }
        
        return "I processed your request, but I have no text response.";

    } catch (error) {
        console.error('Error in agent loop:', error);
        return "Sorry, I ran into an error processing that request.";
    }
}

// Basic HTTP Server to accept requests from the React Frontend
const server = createServer(async (req, res) => {
    // Enable CORS for testing from localhost (Tauri/Vite)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/chat') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        
        req.on('end', async () => {
            try {
                const { message } = JSON.parse(body);
                if (!message) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Message is required' }));
                    return;
                }

                const aiResponse = await processChatMessage(message);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ text: aiResponse }));
            } catch (err: any) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message || String(err) }));
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

const PORT = 3001;

// Startup Sequence
console.log('Starting PipeFX AI Engine...');
startMcpClient().then((connected) => {
    if (connected) {
        server.listen(PORT, () => {
            console.log(`\nBackend HTTP server is listening on http://localhost:${PORT}`);
            console.log('Ready to receive commands from PipeFX Desktop!');
        });
    } else {
        console.error('Failed to initialize MCP client. Exiting...');
        process.exit(1);
    }
});
