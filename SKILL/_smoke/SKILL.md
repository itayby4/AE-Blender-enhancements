---
id: _smoke
name: Smoke Test
description: Synthetic prompt-mode skill used to prove the library + run dispatcher loop end-to-end before built-ins ship in 12.9.
category: dev
icon: Beaker
triggers: ['/smoke', 'smoke', 'test']
inputs:
  - id: message
    type: string
    label: Message
    description: Free-form text the brain echoes back as part of the run.
    required: true
    default: hello pipefx
  - id: shout
    type: boolean
    label: Shout?
    description: When true the brain replies in upper-case.
    default: false
ui: inline
version: 0.0.1
---

# Smoke Test

You are running the PipeFX smoke skill. Acknowledge the request and echo
back the user's message.

Inputs:

- `message` — verbatim text from the user.
- `shout` — when true, reply in upper-case.

Reply with one short sentence confirming the run, then quote the message
on a new line. If `shout` is set, capitalise the entire reply.
