# Prompt sources and adaptation notes

The structure, rules, tool lifecycle, and task-state machinery of this package
are modeled after the OpenClaude project (https://github.com/Gitlawb/openclaude).
OpenClaude itself dual-licenses its code: modifications/additions under MIT,
and "Original Code" (derived from Claude Code) under Anthropic's Commercial ToS.

Because the prompt strings in OpenClaude substantially overlap with Claude Code
originals, we do **not** copy them verbatim. Instead:

- **Preserved:** tool set, tool names, state machine (pending/in_progress/completed),
  rules about when to use each tool, example structure, rejection conditions,
  argument schemas, overall XML/markdown scaffolding style.
- **Rewritten:** all teaching prose and concrete examples, in our own words,
  adapted to PipeFX's domain (video/audio editing via MCP connectors rather
  than coding tasks).

Pattern attribution (not code):
- OpenClaude: https://github.com/Gitlawb/openclaude (inspiration + structural reference)
- Claude Code agent/plan/todo design: https://docs.claude.com/en/docs/claude-code/overview
- Model Context Protocol: https://modelcontextprotocol.io
- ReAct loop: https://arxiv.org/abs/2210.03629

If a verbatim-copy license grant from Anthropic is later obtained, the prompt
files in `src/lib/prompts/` can be replaced with Claude Code originals without
changing any other part of the package.
