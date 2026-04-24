# Designing the Ideal Agentic Video Editing Assistant

## A Design Research Paper for PipeFX

**Author:** Antigravity AI Research  
**Date:** April 16, 2026  
**Version:** 1.0

---

## Abstract

PipeFX occupies a novel category: an **agentic AI desktop application that orchestrates professional Non-Linear Editors (NLEs) like DaVinci Resolve**. It is not itself the editor — it is the *intelligence layer* that sits alongside the editor, understanding projects, executing multi-step creative workflows (like multicam autopod editing), and maintaining persistent creative memory across sessions.

This document presents wide-ranging research into how such a tool should look, feel, and behave. We examine the competitive landscape, draw from cognitive science and established UX heuristics, analyze the design systems of best-in-class creative and developer tools, and synthesize actionable design principles specific to PipeFX's unique position.

The central thesis is this: **PipeFX should not try to look like a video editor. It should look like a creative director's command center** — an interface where the primary "material" is *information, reasoning, and trust*, not timelines and waveforms.

---

## Table of Contents

1. [Competitive Landscape & Positioning](#1-competitive-landscape--positioning)
2. [Cognitive Foundations: Designing for 10-Hour Sessions](#2-cognitive-foundations-designing-for-10-hour-sessions)
3. [The Agentic UI Paradigm](#3-the-agentic-ui-paradigm)
4. [Trust & Transparency: The Core Design Problem](#4-trust--transparency-the-core-design-problem)
5. [Layout Architecture: The Bento Command Center](#5-layout-architecture-the-bento-command-center)
6. [Color System: Perceptual Design with OKLCH](#6-color-system-perceptual-design-with-oklch)
7. [Typography: The Dual-Register System](#7-typography-the-dual-register-system)
8. [Motion Design: The Feel of Intelligence](#8-motion-design-the-feel-of-intelligence)
9. [High-Performance Text Rendering](#9-high-performance-text-rendering)
10. [The Question of 3D](#10-the-question-of-3d)
11. [Design Principles Summary](#11-design-principles-summary)
12. [References](#12-references)

---

## 1. Competitive Landscape & Positioning

Before making any visual decisions, we must understand where PipeFX sits in the market. No existing product occupies the exact same niche, so we draw comparisons from three adjacent categories.

### 1.1 Professional NLEs (DaVinci Resolve, Adobe Premiere Pro)

These are PipeFX's **target ecosystem**, not its competitors. DaVinci Resolve organizes its complexity into seven task-oriented "Pages" (Media, Cut, Edit, Fusion, Color, Fairlight, Deliver), arranged left-to-right in a linear production pipeline [Blackmagic Design, 2024]. This "page paradigm" reduces cognitive load by presenting only the tools relevant to the current stage of production.

**Key lesson:** Resolve's interface optimizes for *minimizing context switching* by keeping VFX, color, and audio within one platform. PipeFX must respect this — it should never force the editor *out* of Resolve. It is the companion, not the replacement.

Adobe's April 2026 announcement of the **Firefly AI Assistant** is particularly relevant. It introduces a unified conversational interface that orchestrates multi-step workflows across the Creative Cloud ecosystem, maintaining context across sessions [Adobe, April 2026]. This validates PipeFX's core architecture: a chat-driven agent that controls NLEs via tool-calling protocols. However, Adobe's assistant is locked into the Adobe ecosystem. PipeFX's advantage is its **connector-agnostic architecture** — it can control any NLE via MCP.

### 1.2 AI-First Video Tools (Descript, Runway ML, Gling)

Descript pioneered a radical paradigm: **"if you can edit a document, you can edit a video."** By making the text transcript the primary workspace, deleting a word in the transcript automatically removes the corresponding audio/video segments [Descript, 2025]. This dramatically lowered the barrier to entry for video editing.

**Key lesson for PipeFX:** Descript proves that video editing interfaces *do not have to look like traditional timelines*. PipeFX should embrace this. Its interface should be text-first, conversation-first — because that is what the AI agent communicates in.

The AutoPod plugin (for Premiere Pro) and Gling.ai are PipeFX's closest competitors in the multicam automation space, automating camera switching based on speaker detection. But they are *plugins*, not standalone intelligence layers. PipeFX differentiates by offering persistent project memory, multi-step reasoning, and a general-purpose agent that can do far more than just multicam switching.

### 1.3 AI-Powered Developer Tools (Cursor, Warp, Windsurf)

This is, perhaps surprisingly, PipeFX's truest design reference. Tools like Cursor IDE and Warp Terminal face the same core design challenge: **how do you build an interface where an autonomous AI agent operates on the user's behalf, modifying complex artifacts (code/video), while maintaining the user's trust and sense of control?**

Cursor distinguishes between **Ask/Chat** mode (information gathering) and **Agent/Composer** mode (autonomous task execution) [Cursor, 2025]. Users must always know whether the AI is "thinking" or "writing." This is critical for PipeFX: when the agent is *analyzing* a project versus when it is *actively modifying* a DaVinci Resolve timeline.

Warp Terminal's **block-based interaction** model is equally instructive. Instead of treating terminal output as an undifferentiated stream, Warp groups each command and its output into navigable "Blocks" [Warp, 2025]. This makes long histories scannable and actionable. PipeFX's Chain of Thought stream should adopt this same principle — each agent "turn" should be a discrete, navigable, collapsible block.

> [!IMPORTANT]
> **Positioning Statement:** PipeFX is not a video editor. It is not a chatbot. It is a **creative director's command center** — closer in paradigm to Cursor IDE than to Premiere Pro. Its primary materials are *reasoning, memory, and orchestration*, rendered through text, structured data, and status indicators.

---

## 2. Cognitive Foundations: Designing for 10-Hour Sessions

Video editors work in grueling sessions. The interface must be designed for sustained, low-fatigue use over many hours.

### 2.1 Cognitive Load Theory (CLT)

John Sweller's Cognitive Load Theory [Sweller, 1988] identifies three types of mental load:

| Load Type | Definition | PipeFX Implication |
|:---|:---|:---|
| **Intrinsic** | The inherent complexity of the task (e.g., multicam editing decisions) | Cannot be reduced — this is the editor's creative work. |
| **Extraneous** | Unnecessary effort caused by poor UI (clutter, confusing navigation) | **Must be ruthlessly minimized.** |
| **Germane** | Productive effort spent building mental models of the system | Should be **fostered** — the UI should teach users how the agent thinks. |

The Nielsen Norman Group recommends that AI interfaces minimize extraneous load through **progressive disclosure** — showing only the information necessary for the current task and revealing advanced options on demand [NNGroup, 2024]. For PipeFX, this means the Chain of Thought should be collapsed by default, the Project Brain should show summaries rather than raw data, and advanced connector settings should be hidden behind a gear icon.

### 2.2 Miller's Law & Chunking

George Miller's research [Miller, 1956] established that working memory can hold approximately 7 ± 2 items. For PipeFX's dashboard, this means:

- The main view should present **no more than 5-7 primary panels** at any time.
- Dense information (like project knowledge or tool lists) should be **chunked** into logical groups with clear headings.
- The Bento grid layout (see Section 5) is the ideal structure for enforcing this.

### 2.3 Physical Ergonomics

Professional editing setups favor keeping the most important controls within the central "comfort zone" of the display — roughly the center 60% of the screen [Apple HIG, 2025]. Content placed at the extreme edges requires increased eye and neck movement. For PipeFX:

- **Primary actions** (chat input, current task status) should be centrally located.
- **Reference panels** (Project Brain, connector status) can live in sidebars.
- **The 20-20-20 rule** (20-second break every 20 minutes to focus 20 feet away) should inform the visual intensity of the interface — the background should be restful, not stimulating.

---

## 3. The Agentic UI Paradigm

The industry has moved decisively beyond simple chatbot interfaces toward what is now called **Agentic UI** — interfaces where AI agents plan and execute complex, multi-step workflows autonomously [Medium, 2026; UXTigers, 2026].

### 3.1 From Conversational to Delegative

PipeFX should support a spectrum of interaction modes:

| Mode | User Role | Agent Role | PipeFX Example |
|:---|:---|:---|:---|
| **Ask** | Asks a question | Provides information | "What clips are in the current timeline?" |
| **Assist** | Reviews and approves | Suggests a plan, waits | "I suggest we switch to Camera 2 at 00:01:32. Approve?" |
| **Delegate** | Sets a goal, walks away | Plans, executes, reports | "Run the AutoPod pipeline on this podcast." |

This maps directly to the "Shared Autonomy Dial" pattern identified in current agentic UX research [Medium, 2026]. The UI must always make it crystal clear which mode the agent is operating in. A subtle but persistent indicator — perhaps a colored border or a mode label on the chat panel — should communicate this at all times.

### 3.2 Generative UI

Vercel's v0 and the AI SDK have popularized the concept of **Generative UI** — instead of the AI always responding with plain text, it can stream structured React components (cards, tables, interactive forms) directly into the conversation [Vercel, 2025].

For PipeFX, this is transformative. When the agent analyzes a timeline, it shouldn't just *say* "The timeline has 5 video tracks and 3 audio tracks." It should render a **mini timeline visualization component** directly in the chat stream. When it reports on AutoPod results, it should render a **summary card** with camera switch counts and duration. This turns the chat from a log into a **living dashboard**.

### 3.3 Artifact-Based Collaboration

Claude (Anthropic) and other frontier AI interfaces have popularized the "artifact" model — generating side-panel documents that the user and AI can collaboratively iterate on. PipeFX already has a version of this with its event-sourced task system. The design should embrace this: the chat is the *conversation*, and **artifacts** (project plans, analysis reports, edit decision lists) are the *deliverables* that live in a separate, persistent panel.

---

## 4. Trust & Transparency: The Core Design Problem

An AI agent that modifies a professional's creative project is making high-stakes changes. Trust is not a feature — it is the **foundational requirement** that determines whether the product is adopted or abandoned.

### 4.1 Smashing Magazine's Trust Framework

Smashing Magazine's 2025 guidelines for AI interface trust identify these essential patterns:

1. **Confidence Signals:** The agent should communicate its certainty. ("I'm highly confident this is the right camera switch" vs. "I'm making a best guess here — please verify.")
2. **Intent Previews:** Before executing a significant action, provide a clear, human-readable summary of what will happen. ("I will add 14 camera switches to the timeline, affecting markers at TC 00:01:12 through 00:15:44. Proceed?")
3. **Action Audit & Rollback:** Every autonomous action must be logged and easily reversible.

### 4.2 Chain of Thought Visualization

Research into transparent AI reasoning [Eleken, 2025; Medium, 2026] establishes these patterns for visualizing agent reasoning:

- **Collapsible reasoning panels** (Progressive Disclosure): Show a compact "Thinking..." indicator by default; let the user expand to see internal steps.
- **Step-by-step status indicators:** Replace generic spinners with labeled steps: "Connecting to Resolve → Scanning timeline → Analyzing markers → Generating edit plan."
- **Evidence integration:** Embed supporting data (tool results, clip metadata) directly in the reasoning stream, not as separate attachments.

> [!TIP]
> **Design heuristic:** The Chain of Thought should feel like watching a brilliant assistant work through a problem on a whiteboard — structured, visible, but not overwhelming. Not like reading a debug log.

### 4.3 The "Safe to Try" Sandbox

For high-stakes operations (modifying a timeline, importing XML), the ideal UX includes a **preview/simulation mode** where the user can see the *projected outcome* before committing. This is analogous to a Git diff before committing code. In PipeFX, this could mean showing a visual diff of the timeline before and after the proposed edits.

---

## 5. Layout Architecture: The Bento Command Center

The **Bento Grid** has become the defining layout paradigm for data-rich dashboards in 2025-2026 [Orbix Studio, 2026; Landdding, 2026]. Inspired by compartmentalized Japanese lunch boxes, it organizes diverse content types into self-contained rectangular panels of varying sizes.

### 5.1 Why Bento Works for PipeFX

PipeFX must display several different types of information simultaneously:

| Panel | Content Type | Interaction Pattern |
|:---|:---|:---|
| **AI Chat** | Streaming text, generative UI components | Primary — read/write |
| **Task Status** | Event-sourced progress, Chain of Thought | Monitor — read-only, collapsible |
| **Project Brain** | Structured knowledge (episodes, characters, style notes) | Reference — searchable, expandable |
| **Connector Status** | MCP connection health, available tools | Glanceable — status indicators |
| **AutoPod Dashboard** | Pipeline controls, media discovery results | Action — buttons, file inputs |

A Bento grid naturally encodes hierarchy through **panel size**: the AI Chat panel should be the largest (it is the primary workspace), while Connector Status can be a small, narrow strip. The research is clear that this size-based hierarchy improves scan speed and reduces cognitive load [Akrivi, 2026].

### 5.2 Pitfalls to Avoid

- **Overloading:** More than ~7 simultaneous panels erodes the organizational benefit. "If everything is prioritized, nothing is" [Landdding, 2026].
- **Uniform sizing:** If all panels are the same size, the layout loses its core advantage over a simple grid.
- **Inconsistent spacing:** Gutters between panels must be uniform to maintain visual cohesion.

### 5.3 Resizability and Persistence

Apple's Human Interface Guidelines for pro apps [Apple HIG, 2025] emphasize that professional users need to customize their workspace. PipeFX should allow users to:

- Resize panels (drag borders)
- Collapse/expand panels (click headers)
- Save layout presets (e.g., "Editing Mode" vs. "Review Mode")

Linear's design system proves that an opinionated default layout is better than total freeform customization [Sequoia, 2024]. PipeFX should ship with a single, excellent default layout and allow refinement from there.

---

## 6. Color System: Perceptual Design with OKLCH

PipeFX's current stylesheet already uses OKLCH values, which is excellent. This section provides the theoretical foundation for taking this further.

### 6.1 Why OKLCH is Superior for Dark Interfaces

OKLCH (Oklab Lightness, Chroma, Hue) is the gold standard for professional color systems because of **perceptual uniformity** [Evil Martians, 2023; Design Systems Collective, 2025]:

- In HSL, a 10% lightness change looks dramatically different depending on the hue (yellow appears much brighter than blue at the same L value).
- In OKLCH, the L channel directly corresponds to human perception. A 5% increase in L *looks* 5% brighter, regardless of hue.
- This makes generating accessible contrast ratios trivial — you can predict text contrast mathematically rather than by visual testing.

### 6.2 Specific Palette Recommendations

The current palette (`oklch(0.2 0 0)` backgrounds, `oklch(1 0 0)` foregrounds) is completely achromatic (chroma = 0). This is functional but cold. Research recommends:

- **Tinted neutrals:** Add a tiny chroma value (C ≈ 0.005–0.01) and a subtle hue to backgrounds. This creates "warm" or "cool" neutrals that feel premium and organic rather than sterile [Mintlify, 2025].
- **Reduce chroma at extremes:** Ultra-bright or ultra-dark colors should have lower chroma to avoid appearing garish [Mintlify, 2025].
- **Accent color strategy:** PipeFX needs a signature accent. Candidates:
  - **Electric Teal** (`oklch(0.75 0.15 190)`) — fresh, technological, high visibility against dark backgrounds.
  - **Warm Amber** (`oklch(0.8 0.15 75)`) — complementary to Resolve's orange brand, evokes creative warmth.
  - **Selective Violet** (`oklch(0.65 0.2 290)`) — distinctive, modern, differentiates from all competitors.

> [!NOTE]
> The choice of accent color is a brand decision, not a technical one. But whichever is chosen, OKLCH allows us to derive the entire semantic scale (hover states, focus rings, disabled states) by adjusting L and C programmatically, without hue shifts.

### 6.3 Semantic Color Roles

Beyond the accent, the palette should define:

| Role | Purpose | Guidance |
|:---|:---|:---|
| **Surface 0** | App background | `oklch(0.13–0.16 0.005 <hue>)` — nearly black, very low chroma |
| **Surface 1** | Panel backgrounds | `oklch(0.18–0.22 0.005 <hue>)` — step up from base |
| **Surface 2** | Elevated elements (cards, popovers) | `oklch(0.24–0.28 0.008 <hue>)` — subtle lift |
| **Border** | Panel dividers | `oklch(0.30 0.005 <hue>)` — just visible |
| **Text Primary** | Main content | `oklch(0.90 0 0)` — off-white, not pure white (reduces glare) |
| **Text Secondary** | Labels, metadata | `oklch(0.60 0 0)` — clearly subordinate |
| **Accent** | Primary actions, active states | Full chroma accent at L ≈ 0.65–0.80 |
| **Success** | Completed tasks, connected states | Greenish, L ≈ 0.70 |
| **Warning** | Attention needed | Amber, L ≈ 0.75 |
| **Destructive** | Errors, disconnections | Red, L ≈ 0.55 |

---

## 7. Typography: The Dual-Register System

PipeFX communicates in two distinct "registers": **human language** (chat, labels, descriptions) and **machine language** (logs, JSON, tool calls, code). The typographic system must make this distinction instant and effortless.

### 7.1 Font Pairing Strategy

Research on AI chat interfaces recommends a maximum of 2-3 font families, using weight and color for emphasis rather than additional typefaces [PromptPerfect, 2025]:

| Register | Role | Recommended Font | Rationale |
|:---|:---|:---|:---|
| **Sans-serif** | UI chrome, chat text, labels | **Inter Variable** (already in use) | Excellent x-height, readable at small sizes, widely supported |
| **Monospace** | Code blocks, tool calls, JSON, logs | **JetBrains Mono** or **Commit Mono** | Coding ligatures, clear `0/O` and `1/l/I` distinction |

The two fonts should have similar x-heights to avoid visual "jumping" when they appear adjacent to each other [Mohan Vadivel, 2025].

### 7.2 Sizing Scale

For sustained readability in a professional desktop context:

- **Body text (chat messages):** 15–16px — slightly larger than typical web body text, because this is a desktop app used at arm's length.
- **UI labels & metadata:** 12–13px — subordinate to body text.
- **Code/monospace blocks:** 13–14px — monospace fonts look larger at the same pixel size, so they should be set slightly smaller.
- **Line height:** 1.5–1.6 for body text, 1.4 for code — generous spacing reduces eye fatigue over long sessions.
- **Line length:** Chat messages should be constrained to 65–75 characters wide. This is a critical, often-overlooked readability guideline.

### 7.3 Signaling Machine vs. Human Content

Beyond font choice, the interface should use **consistent visual markers** to distinguish AI-generated content from user input and system information:

- **User messages:** Left-aligned or clearly badged with a user avatar.
- **Agent messages:** Distinct background tint (e.g., a very subtle accent-colored surface).
- **Tool calls/results:** Rendered in a contained, bordered block with a monospace font — visually "inset" from the conversation flow.
- **System messages (errors, connection status):** Centered, full-width, with a muted style.

---

## 8. Motion Design: The Feel of Intelligence

Animation in PipeFX is not decoration. It is the **primary mechanism for communicating the agent's state**. When an AI agent is "thinking," "acting," or "waiting for approval," the user must *feel* the difference without reading a label.

### 8.1 Spring Physics

Framer Motion's spring-based animations are the standard for achieving natural, physical-feeling UI feedback [Tigerabrodi, 2025]:

```
Snappy, professional feel:
  stiffness: 400, damping: 15

Heavier, deliberate feel:
  stiffness: 200, damping: 20

Bouncy, playful feel (use sparingly):
  stiffness: 300, damping: 10
```

For PipeFX, the target is **snappy and professional**. Buttons should have a subtle scale-down on press (`whileTap: { scale: 0.97 }`). Panels should expand/collapse with a smooth spring, not a linear ease. Duration: 200–400ms for micro-interactions.

### 8.2 State Animations (Communicating Agent Intelligence)

This is where motion design becomes unique to PipeFX. The agent has several states, each needing a distinct visual signature:

| Agent State | Visual Treatment | Motion Style |
|:---|:---|:---|
| **Idle** | Steady, calm accent indicator | Static or very slow pulse (period > 3s) |
| **Thinking** | Animated reasoning indicator | Flowing gradient or gentle particle drift |
| **Executing** | Active progress, tool call blocks appearing | Crisp, sequential appear animations (stagger) |
| **Waiting for approval** | Clear call-to-action, pulsing approve button | Attention-drawing pulse on the action button |
| **Error** | Red-tinted status, clear error card | Quick shake or flash to draw attention |
| **Success** | Green checkmark, brief celebration | Satisfying scale-up + fade (< 500ms) |

### 8.3 The `prefers-reduced-motion` Imperative

All animations must respect the user's system accessibility preference. If `prefers-reduced-motion: reduce` is set, all spring animations should be replaced with instant state changes or simple opacity fades.

---

## 9. High-Performance Text Rendering

PipeFX is fundamentally a text-heavy application. The Chain of Thought, chat history, tool results, and project knowledge are all text. Performance here is not optional — it is the difference between a tool that feels responsive and one that feels broken.

### 9.1 The Core Problem: Streaming Token Rendering

When the AI agent streams a response token-by-token, the naive approach (updating React state on every token) triggers a full re-render per token, causing catastrophic jank [Reddit, 2025]. The established solutions are:

1. **Buffer + requestAnimationFrame:** Accumulate tokens in a `useRef` buffer and flush to state at ~30-60fps intervals.
2. **Direct DOM manipulation:** For the currently-streaming message, bypass React entirely using `element.textContent += chunk`, then sync to React state when the stream completes.
3. **Streaming-aware Markdown parsing:** Use a parser that can incrementally update without re-parsing the entire message on every token.

### 9.2 Virtual Scrolling for Long Histories

As conversations grow to hundreds of messages, rendering them all to the DOM simultaneously causes memory bloat and scroll lag. **List virtualization** (rendering only the messages currently in the viewport) is essential [TanStack Virtual; React Virtuoso]. For PipeFX's variable-height messages (Markdown, code blocks, generative UI components), React Virtuoso is the strongest candidate because it supports dynamic height measurement.

### 9.3 The Pretext Opportunity

Cheng Lou's `@chenglou/pretext` library [Pretext, March 2026] offers a compelling optimization layer. By using off-screen Canvas measurement instead of DOM layout reflow, it can pre-calculate text dimensions 500x+ faster than standard browser methods. The concrete applications for PipeFX:

- **Height estimation for virtual scrolling:** If we can predict the height of a message *before* rendering it to the DOM, virtualization becomes dramatically smoother (no layout thrashing).
- **Custom log viewer:** For the Chain of Thought panel, which can accumulate thousands of lines, Pretext-powered measurement could enable a fully custom, ultra-fast log viewer.
- **Future: fluid text layouts:** Wrapping text around embedded media or tool result cards.

However, Pretext is a **low-level primitive**, not a drop-in component. Integrating it requires building custom rendering logic. It is best considered a Phase 2 optimization — after the core UI is stable and performance bottlenecks are empirically measured.

---

## 10. The Question of 3D

Should PipeFX use 3D elements? The honest answer is: **probably not as a core UI element, but possibly as a signature visual touch.**

### 10.1 Arguments Against 3D in Core UI

- **Cognitive load:** 3D interfaces add a spatial dimension that the user must mentally process. For a tool that manages complex, abstract information (reasoning chains, project knowledge), this adds unnecessary intrinsic load.
- **Performance cost:** React Three Fiber / WebGL canvases consume significant GPU resources. On a machine simultaneously running DaVinci Resolve (which is extremely GPU-intensive), this is a resource conflict.
- **Maintenance burden:** 3D code is harder to maintain and iterate on than standard React components. Design changes that take minutes in CSS can take hours in Three.js.
- **Accessibility:** 3D elements are effectively invisible to screen readers and present challenges for motion-sensitive users.

### 10.2 Where 3D *Could* Shine

If used, 3D should be a **contained, optional visual flourish**, not a core interaction surface:

- **Project Brain visualization:** A particle graph or node map showing relationships between episodes, characters, and themes in the project knowledge base. This is visually striking and the spatial metaphor actually *serves* the data (showing connections/clusters).
- **Ambient background:** A very subtle, low-poly mesh or particle field behind the main panels — purely atmospheric, using `<Canvas frameloop="demand">` to halt GPU rendering when nothing is animating.
- **Onboarding / empty state:** An impressive 3D animation that plays when PipeFX first launches or when no project is loaded, creating a premium first impression without impacting workflow performance.

### 10.3 Recommendation

Defer 3D elements to a "polish" phase. Build the entire core interface in standard 2D React components. If and when a Project Brain visualization is needed, consider 3D as one option alongside simpler alternatives (a force-directed 2D graph, a well-designed tree view, or even just a structured list).

> [!WARNING]
> **Do not let the pursuit of "wow factor" compromise the tool's primary job: being fast, clear, and trustworthy.** A beautiful 3D visualization that drops frames while DaVinci Resolve is rendering a timeline will actively harm the user's perception of the product.

---

## 11. Design Principles Summary

Based on this research, PipeFX should be built on these foundational principles:

### Principle 1: Information, Not Decoration
Every visual element must serve a communicative purpose. A gradient should indicate state (thinking/idle). A border color should indicate connection health. Aesthetic choices must be *simultaneously* functional choices.

### Principle 2: Structured Transparency
The agent's reasoning should be visible but never overwhelming. Use collapsible Chain of Thought panels, step-by-step status indicators, and evidence-integrated reasoning streams. The default should be *summarized* — the detail should be *available*.

### Principle 3: Respect the Editor's Machine
PipeFX runs alongside DaVinci Resolve on the same machine. Every GPU cycle, every MB of RAM, every CPU thread matters. Prefer CSS animations over JavaScript animations. Use `will-change` surgically. Virtualize long lists. Use `frameloop="demand"` if any 3D is present.

### Principle 4: The Keyboard is First Class
Video editors live on their keyboards. PipeFX must have a comprehensive command palette (`Cmd+K`), keyboard-navigable panels, and shortcuts for every common action. This is non-negotiable for professional adoption — Linear and Warp have proven that keyboard-first design is a competitive advantage [Morgen, 2025; Warp, 2025].

### Principle 5: Two Registers, One Voice
Human-language content (Inter, proportional, warm) and machine-language content (JetBrains Mono, monospace, contained) should be visually distinct but belong to the same tonal system. The app should feel unified, not split.

### Principle 6: Comfort Over Spectacle
For a tool used 10+ hours a day, *visual comfort* beats *visual impact*. Use off-white text (not pure white), tinted neutrals (not pure gray), and restrained accent usage. Save the visual "peaks" for genuinely important moments: a successful pipeline completion, an error that needs attention.

### Principle 7: Progressive Mastery
The interface should reward learning. Surface the most common actions immediately, but let power users discover depth through the command palette, keyboard shortcuts, and expandable sections. Foster germane cognitive load — the productive kind that builds expertise.

---

## 12. References

### Academic & Research

- Sweller, J. (1988). "Cognitive Load During Problem Solving: Effects on Learning." *Cognitive Science, 12*(2), 257–285.
- Miller, G. A. (1956). "The Magical Number Seven, Plus or Minus Two." *Psychological Review, 63*(2), 81–97.
- Nielsen Norman Group. "Cognitive Load in UX Design." nngroup.com.
- IJRASET. "Systematic Review: Cognitive Load Theory in Software Usability." ijraset.com.

### Industry Design Systems & Guidelines

- Apple Human Interface Guidelines, macOS section. developer.apple.com/design/human-interface-guidelines/macos.
- Smashing Magazine (2025). "Designing for AI Trust and Transparency." smashingmagazine.com.
- Evil Martians (2023). "OKLCH in CSS: Why We Moved Away From RGB and HSL." evilmartians.com.
- Design Systems Collective (2025). "Building Dark Mode with OKLCH." designsystemscollective.com.
- Mintlify (2025). "Tinted Neutrals and Professional Palette Design." mintlify.com.

### Product References

- Adobe (April 2026). "Firefly AI Assistant: Agentic Creative Workflows." adobe.com.
- Blackmagic Design. "DaVinci Resolve Interface." blackmagicdesign.com.
- Descript. "Text-Based Video Editing." descript.com.
- Linear. "Design System and Product Philosophy." linear.app.
- Warp Terminal. "Block-Based Interaction Model." warp.dev.
- Vercel. "Generative UI and v0." vercel.com.
- Cursor IDE. "Agent Mode and Contextual AI." cursor.sh.

### Technical Libraries

- Cheng Lou. `@chenglou/pretext` — High-performance text measurement. github.com/chenglou/pretext. March 2026.
- Framer Motion — Spring physics animation library. framer.com/motion.
- React Three Fiber — Declarative Three.js for React. pmnd.rs.
- TanStack Virtual — Headless list virtualization. tanstack.com/virtual.
- React Virtuoso — Variable-height virtual scrolling. virtuoso.dev.
- Rive — State-machine-driven interactive animations. rive.app.

### UX Pattern Sources

- Medium (2026). "Agentic UI Design Patterns: From Conversational to Delegative." 
- UXTigers (2026). "The Shift to Agentic UX."
- Orbix Studio (2026). "The Bento Grid Layout in Modern Dashboard Design."
- Landdding (2026). "Bento Grid: Visual Hierarchy Through Size."
- Eleken (2025). "Chain of Thought UI Visualization for AI Reasoning."
- Tigerabrodi (2025). "Spring Physics in Framer Motion for Desktop UI."
- Sequoia Capital (2024). "Linear: The Craft of an Opinionated Tool."

---

*This document is a living research artifact. It should be revisited as the product evolves and new design patterns emerge in the rapidly developing agentic AI space.*
