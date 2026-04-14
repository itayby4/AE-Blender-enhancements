---
id: fusion-node-generator
name: "Fusion AI Builder"
description: "Prompt and generate DaVinci Resolve Fusion nodes using AI."
icon: auto_awesome
category: fusion
triggerCommand: "fusion prompt"
hasUI: true
---
<!--UI-->
<div class="card">
  <h2>Fusion AI Builder</h2>
  <p style="font-size: 0.9em; color: #aaa;">Describe the node tree or effect you want to build in your active Fusion composition.</p>
  
  <textarea id="fusionPrompt" rows="4" style="width: 100%; margin-top: 10px; margin-bottom: 15px; background: #1e1e1e; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 10px; font-family: inherit; resize: vertical;" placeholder="e.g., Add a Text node that says 'Cyberpunk', make it red, and connect it to a Glow node."></textarea>
  
  <button onclick="execute({ prompt: document.getElementById('fusionPrompt').value })" style="width: 100%; padding: 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Generate in Fusion</button>
</div>
<!--/UI-->

When the `execute` function is triggered, you will receive a `prompt` parameter containing the user's natural language request for a Fusion composition.

Your instructions to fulfill this request:
1. **Analyze the Prompt:** Understand what nodes, connections, and properties the user wants to set up.
2. **Check Context:** Call `get_fusion_composition_status` to see what nodes currently exist on the user's Fusion canvas (e.g., `MediaIn1`, `MediaOut1`).
3. **Execute:** Use your available Fusion tools to build the requested setup:
   - Call `add_fusion_node` to spawn the required tools.
   - Call `set_fusion_node_property` to configure them based on the prompt (like text content, colors, sizes).
   - Call `connect_fusion_nodes` to route them together properly, ensuring the final output flows into `MediaOut1` if applicable.
   - *Alternatively*, for highly complex setups, you can formulate and run a script using `execute_fusion_script`.
4. **Report back:** Give the user a brief, friendly summary of what was generated and connected on their canvas.