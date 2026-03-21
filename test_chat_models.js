const fs = require('fs');
let out = '';
async function testModel(modelName) {
  const data = {
    message: "hello",
    skill: {
      model: modelName,
      systemInstruction: "hello",
      allowedTools: ["render_timeline_audio"]
    }
  };
  try {
    const res = await fetch("http://localhost:3001/chat", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" }
    });
    const text = await res.text();
    out += `[${modelName}] HTTP ${res.status}: ${text}\n`;
  } catch(e) {
    out += `[${modelName}] ERROR: ${e.message}\n`;
  }
}

async function run() {
  await testModel("gemini-1.5-pro");
  await testModel("gemini-1.5-pro-latest");
  await testModel("gemini-2.0-flash");
  await testModel("gemini-2.5-flash"); // default
  fs.writeFileSync('out.txt', out, 'utf8');
}
run();
