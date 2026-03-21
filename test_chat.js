const data = {
  message: "hello",
  skill: {
    model: "gemini-1.5-pro",
    systemInstruction: "hello",
    allowedTools: ["render_timeline_audio"]
  }
};
fetch("http://localhost:3001/chat", {
  method: "POST",
  body: JSON.stringify(data),
  headers: { "Content-Type": "application/json" }
}).then(res => res.text()).then(console.log).catch(console.error);
