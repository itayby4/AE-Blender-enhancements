---
id: auto-subtitles-generator
name: "Auto Subtitles"
description: "Generate automated subtitles with custom languages, animation, and highlighting."
icon: subtitles
category: video-editing
triggerCommand: "auto-subs"
hasUI: true
---
<!--UI-->
<div class="card" style="display: flex; flex-direction: column; gap: 15px;">
  <h2 style="margin: 0; font-size: 18px;">Auto Subtitles</h2>
  
  <div style="display: flex; flex-direction: column; gap: 5px;">
    <label for="targetLanguage">Target Language:</label>
    <select id="targetLanguage" style="padding: 5px; border-radius: 4px; background: #333; color: white; border: 1px solid #555;">
      <option value="Hebrew">Hebrew (╫ó╫æ╫¿╫Ö╫¬)</option>
      <option value="English">English</option>
      <option value="Spanish">Spanish</option>
      <option value="">Original Language (No Translation)</option>
    </select>
  </div>

  <div style="display: flex; align-items: center; gap: 10px;">
    <input type="checkbox" id="useAnimation" checked style="accent-color: #007bff; width: 16px; height: 16px;">
    <label for="useAnimation">Animated Text (Fusion)</label>
  </div>

  <div style="display: flex; flex-direction: column; gap: 5px;">
    <label for="highlightColor">Highlight Color (for Animated Text):</label>
    <input type="color" id="highlightColor" value="#FFFF00" style="width: 100%; height: 30px; border: none; background: transparent; cursor: pointer;">
  </div>

  <div style="display: flex; flex-direction: column; gap: 5px;">
    <label for="maxWords">Max Words per Line:</label>
    <input type="number" id="maxWords" value="5" min="1" max="15" style="padding: 5px; border-radius: 4px; background: #333; color: white; border: 1px solid #555;">
  </div>

  <button 
    style="padding: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-top: 10px;"
    onclick="execute({ 
      language: document.getElementById('targetLanguage').value,
      animation: document.getElementById('useAnimation').checked,
      color: document.getElementById('highlightColor').value,
      maxWords: parseInt(document.getElementById('maxWords').value)
    })">
    Generate Subtitles
  </button>
</div>
<!--/UI-->

### System Instructions
When the user clicks "Generate Subtitles" and triggers the `execute` function, you will receive an object with `language`, `animation`, `color`, and `maxWords`.

You MUST immediately call the `default_api:auto_generate_subtitles` tool using these exact parameters:
- `target_language`: The `language` from the params (if empty, omit it).
- `animation`: The `animation` boolean from the params.
- `highlight_color`: The `color` hex string from the params.
- `max_words_per_chunk`: The `maxWords` number from the params.

Confirm to the user that you are generating the subtitles with their selected settings, and handle any errors gracefully.
