# PipeFX — סקירת אדריכלות + הצעות לשיפור

> נכתב ב-16.4.2026 לאחר סקירה של `apps/`, `packages/`, קונפיגורציות שורש וקוד מקור.
> הסקירה מתמקדת ב-3 צירים לבקשת המשתמש: **אדריכלות וגבולות מודולים**, **איכות קוד ו-DX**, **ביצועים וסקיילביליות**.

---

## חלק 1 — תמונת המצב: מה באמת קיים בקוד

### 1.1 מפת המונוריפו (בפועל vs. CLAUDE.md)

`CLAUDE.md` מתאר 3 apps ו-6 packages. בפועל יש **7 apps** ו-**8 packages**:

| בפועל                    | מתועד ב-CLAUDE.md | הערה                                               |
| ------------------------ | :---------------: | -------------------------------------------------- |
| `apps/desktop`           |         ✅         | Tauri + React                                      |
| `apps/backend`           |         ✅         | Node HTTP server                                   |
| `apps/mcp-davinci`       |         ✅         | Python, יציב                                       |
| `apps/mcp-premiere`      |         ❌         | scaffolded, חלקי                                   |
| `apps/mcp-aftereffects`  |         ❌         | scaffolded                                         |
| `apps/mcp-blender`       |         ❌         | scaffolded                                         |
| `apps/mcp-ableton`       |         ❌         | scaffolded                                         |
| `packages/mcp`           |         ✅         |                                                    |
| `packages/ai`            |         ✅         |                                                    |
| `packages/async`         |         ✅         |                                                    |
| `packages/strings`       |         ✅         |                                                    |
| `packages/colors`        |         ✅         |                                                    |
| `packages/utils`         |         ✅         |                                                    |
| `packages/providers`     |         ❌         | קיים, מכיל image-gen/video-gen/sound-gen/3d/llm    |
| `packages/tasks`         |         ❌         | קיים, reducer/events/types לניהול state של משימות  |

**מסקנה:** התיעוד מפגר אחרי הקוד. `eslint.config.mjs` כבר מכיר את `scope:providers` ו-`scope:tasks` וגם את התלויות החדשות ב-`scope:backend` — אבל `CLAUDE.md` לא.

### 1.2 גרף תלויות בפועל (לפי `eslint.config.mjs`)

```
  apps/backend (scope:backend)
        │
        ├── @pipefx/ai        (scope:ai)         ──┐
        ├── @pipefx/providers (scope:providers)    │── ← גם backend משתמש ישירות בשלושתם
        ├── @pipefx/tasks     (scope:tasks)        │
        ├── @pipefx/mcp       (scope:mcp) ────────┘
        │                            │
        │                            └── @pipefx/async (scope:async)
        │
  @pipefx/ai ── תלוי ישירות ב-@anthropic-ai/sdk, @google/genai, openai ❌
                (למרות ש-@pipefx/providers כבר קיים לתפקיד הזה)
```

### 1.3 מבנה הרצה

1. `apps/desktop` (Tauri/React) שולח HTTP/SSE ל-`apps/backend` על פורט 3001.
2. `apps/backend/src/main.ts` מרים `ConnectorRegistry` ורושם **5 קונקטורים** בהרצה, מנסה להתחבר ל-`resolve` בלבד כברירת מחדל, ויוצר `Agent` אחד.
3. ה-Agent מקבל הודעה → מושך את רשימת הכלים מ-`registry.getAllTools()` → שולח ל-provider (Gemini/OpenAI/Anthropic) → אם יש `toolCalls` מריץ אותם ב-`Promise.all` וחוזר ללופ עד שמקבלים טקסט.
4. כלים "מקומיים" (ניהול משימות, memory) נרשמים דרך `registry.registerLocalTool()` וחיים בתוך ה-backend (לא ב-MCP server).

---

## חלק 2 — ממצאים לפי תחום

### 2.1 אדריכלות וגבולות מודולים

#### 🔴 קריטי: `@pipefx/ai` עוקף את `@pipefx/providers`

`packages/ai/package.json` מצהיר על תלות ישירה ב-3 SDKs של ספקי LLM:

```json
"dependencies": {
  "@anthropic-ai/sdk": "^0.82.0",
  "@google/genai": "^1.46.0",
  "openai": "^6.32.0",
  ...
}
```

ו-`packages/ai/src/lib/agent.ts:3-5` מייבא אותם ישירות:

```ts
import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
```

למרות ש-`packages/providers/` כבר כולל תקייה `lib/llm/` עם registry לספקי LLM. התוצאה:

- שכפול לוגיקת חיבור ל-SDKs בשני מקומות (`packages/ai/src/lib/providers/*.ts` וגם `packages/providers/src/lib/llm/*`).
- `apps/backend` מייבא גם `@google/genai` וגם `openai` ישירות (`apps/backend/src/main.ts:9-10`) — פעם שלישית לאותן התלויות.
- להחליף ספק, להוסיף ספק, או לעבור למודל מקומי ידרוש שינוי בשלושה מקומות.

**גבול מודולים שצריך לקיים:**
```
@pipefx/ai → @pipefx/providers → SDK
             ^^^^^^^^^^^^^^^^^
             המקום היחיד שמדבר ישירות עם Anthropic/OpenAI/Gemini
```

#### 🟡 `apps/backend/src/main.ts` אינו "wiring דק" כפי ש-CLAUDE.md טוען

CLAUDE.md (שורה 207): *"The backend is a thin wiring layer."*

בפועל `main.ts` הוא 365 שורות, מתוכן:
- `registerTaskTools()` — 65 שורות של הגדרות schema (שורות 149-213).
- `registerMemoryTools()` — 145 שורות של הגדרות schema (שורות 215-360).

זו לוגיקה עסקית (schemas + handlers + prompt-engineering של descriptions כמו "Store a new piece of knowledge..."). לפי הכללים שלך ב-CLAUDE.md, זה שייך ל-package ייעודי, למשל `@pipefx/memory-tools` (או כחלק מ-`@pipefx/tasks` אם רוצים לצרף).

#### 🟡 `apps/backend/src/config.ts` — prompt מערכת ענק hardcoded

שורות 48-120 של `config.ts` מכילות prompt מערכת של 70+ שורות, כולל:
- כללי התנהגות כלליים
- מערכת memory
- פורמט JSON ל-pipeline editor
- פורמט skills עם YAML frontmatter ו-HTML embedded

**בעיה 1:** זה לא נשלט ע"י גרסאות במובן משמעותי (diff כואב, אי-אפשר לטעון איטרציות).
**בעיה 2:** חלק מהדברים (`pipeline_actions`, `skills`) לוגיים מקום אחר (UI/frontend) — backend לא אמור להכיר את זה.
**בעיה 3:** אין טסטים ל-prompt. שינוי מילה בודדת יכול לשבור התנהגות של הסוכן בלי שאף אחד ישים לב.

#### 🟢 `@pipefx/mcp` — עיצוב נקי ותקין

interface ה-`Connector`/`ConnectorRegistry` נקי, discriminated union של `TransportConfig` עובד כראוי. יש בעיות ביישום (ראה סעיף 2.3) אבל ה-shape נכון.

---

### 2.2 איכות קוד ו-DX

#### 🔴 כיסוי טסטים נמוך מאוד איפה שהוא הכי חשוב

יש טסטים רק ב-:
- `packages/async` (retryWithBackoff)
- `packages/strings` (capitalize, slugify)
- `packages/colors` (המרות צבע)

**אין טסטים כלל** ב-:
- `@pipefx/mcp` — כל הלוגיקה של ConnectorRegistry, routing, reconnect
- `@pipefx/ai` — כל הלופ של ה-agent, compaction, tool execution
- `apps/backend` — כל ה-routes, memory, workflows
- `apps/mcp-davinci` — כל הכלים ב-Python

זו בדיוק הפירמידה ההפוכה למה שצריך: יש טסטים ל-`capitalize` אבל לא לקונקטור שחלקים קריטיים בתוכנה תלויים בו.

#### 🟡 `any` נרחב בממשקים ציבוריים

`packages/ai/src/lib/types.ts:17` — `history?: any[]` כחלק מ-`ChatOptions` הציבורי.
`packages/ai/src/lib/agent.ts:116` — `rawHistory: any[] = options?.history || []`.
`main.ts:167, 184, 205, 242, 266, 288, 307, 326, 355` — `async (args: any)` בכל tool handler.

זה מנטרל את הערך של TypeScript בגבולות החשובים ביותר (API בין שכבות). הסכימות של הכלים *כבר* מוגדרות כ-JSONSchema — אפשר לגזור מהן טיפוסים.

#### 🟡 ניקוי תווים בעברית מ-API keys — workaround לבעיה שנשכחה

`apps/backend/src/config.ts:28-43`:
```ts
geminiApiKey: geminiRaw
  .replace(/[\u0590-\u05FF]/g, '')    // עברית
  .replace(/["']/g, '')
  .trim(),
```

זה כנראה נולד כי ב-`.env` היו תגובות בעברית לצד המפתחות. הפתרון הזה מנטרל מפתחות תקינים שמכילים במקרה בסיס-64 שדומה לעברית (לא ריאליסטי אבל) ומסתיר את הבעיה האמיתית. יותר טוב לוודא ב-validation ברמת ה-loader של ה-`.env` (או סתם לעבור ל-`zod`/`envalid`) ולתת שגיאה מפורשת אם המפתח לא תואם regex של המפתח הצפוי.

#### 🟡 Artifacts בשורש הריפו

- `import json` — קובץ 16KB בשורש. זה תוכן של `less` help (כנראה paste תקוע בטרמינל). מלכלך את `ls`.
- `backend_crash_test.log` — log מהיום עם crash trace.
- `check_formats.py` — סקריפט חד-פעמי?
- `tmp/test_api.mjs`, `tmp/test_stream.mjs` — סקריפטים שלא ברור אם רלוונטיים.

ה-`.gitignore` לא מתפוס אותם. כדאי לעבור על זה בסבב ניקיון ולהוסיף `*.log`, `tmp/`, וקבצים זמניים לשם.

#### 🟢 ESLint module boundaries עובדים ועדכניים

למרות ש-CLAUDE.md לא מוזכרים, הסקופים החדשים (`providers`, `tasks`) רשומים נכון ב-`eslint.config.mjs`. התשתית קיימת, רק צריך ליישר את התיעוד.

---

### 2.3 ביצועים וסקיילביליות

#### 🔴 `ConnectorRegistry.getAllTools()` לא אטומי

`packages/mcp/src/lib/registry.ts:113-137`:

```ts
async getAllTools(): Promise<Tool[]> {
  this.toolIndex.clear();          // ← שלב 1: מרוקן
  const allTools: Tool[] = [];

  for (const [id, connector] of this.connectors) {
    if (!connector.isConnected()) continue;
    const tools = await connector.listTools();   // ← await! הלופ יכול להיקטע
    for (const tool of tools) {
      this.toolIndex.set(tool.name, id);
      ...
    }
  }
  ...
}
```

**תרחיש בעייתי:**
1. בקשה A קוראת ל-`getAllTools()`, מרוקנת את `toolIndex`, מתחילה לאכלס.
2. בזמן שהיא ב-`await connector.listTools()`, בקשה B מגיעה ל-`callTool('foo')`.
3. `toolIndex` ריק/חלקי → `callTool` זורק "Unknown tool".

ה-agent קורא `getAllTools()` בתחילת כל `chat()` (`agent.ts:108`), אז ברגע שיש שתי שיחות מקביליות זה עלול להיכשל.

**תיקון:** לבנות את ה-index במשתנה מקומי ו-swap בסוף אטומית (`this.toolIndex = newIndex`), או להוסיף mutex על העדכון.

#### 🟡 Double timeout + connector leak בתוך `callTool`

`packages/mcp/src/lib/connector.ts:80-105`:
```ts
const executeWithTimeout = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => { reject(...) }, TOOL_TIMEOUT);   // timeout #1
    client.callTool(..., { timeout: TOOL_TIMEOUT } as any)               // timeout #2
      .then(...).catch(...);
  });
};
```

שני timeouts באותו משך, ואם הראשון יורה ה-`client.callTool` עדיין רץ ברקע עד ש-SDK יסגור אותו. ב-reconnect (שורה 55) יוצרים `Client` חדש אבל הישן אולי עדיין מחזיק transport/process פתוח. ב-MCP stdio זה יכול להשאיר תהליך Python יתום.

**תיקון:** תלות אחת על timeout של ה-SDK + `AbortController` אחד. בריקונקט, לדאוג ל-`await client.close()` + `transport.close()` מפורש לפני יצירת client חדש.

#### 🟡 הערכת טוקנים נאיבית

`packages/ai/src/lib/compaction.ts:53-55`:
```ts
function estimateMessageTokens(msg: ProviderMessage): number {
  return Math.ceil(msg.content.length / 4) + 1;
}
```

זה port מ-claw-code, אבל:
- Gemini / Claude / GPT משתמשים בטוקנייזרים שונים ויחס שונה של תווים לטוקן.
- טקסט בעברית (שמשתמשים כותבים) מתחלק שונה לגמרי (BPE של רוב המודלים לא יעיל לעברית, לפעמים 1:1).
- מתעלם לחלוטין מטוקנים של tool definitions ושל system prompt (שכאן 70+ שורות, כנראה >1000 טוקן).

התוצאה: `maxEstimatedTokens: 8000` עלול להיות בפועל 15000 או 4000. ה-compaction עלול לרוץ מוקדם מדי או מאוחר מדי.

**תיקון:** להשתמש ב-tokenizer אמיתי לפי הספק (`@anthropic-ai/tokenizer`, `tiktoken`, או Gemini count-tokens API) כחלק מה-`Provider` interface, וגם להכניס את ה-system prompt ו-tools לחישוב.

#### 🟡 רישום eager של כל הקונקטורים

`apps/backend/src/main.ts:45-50` רושם את כל חמשת הקונקטורים (`resolve`, `premiere`, `aftereffects`, `blender`, `ableton`) גם אם הקונפיגורציה שלהם כוללת `venv` שלא קיים (לא לכל user יש את כל האפליקציות מותקנות). `switchActiveConnector('resolve')` מנסה רק resolve, אבל ה-registry עדיין מחזיק 5 connectors שבעת `getAllTools()` יעברו עליהם (אפילו אם לא-מחוברים זה פשוט `continue`, אז OK ביצועית — אבל לא נקי).

בנוסף, `resolveVenvPython()` (מ-`@pipefx/mcp`) רץ בזמן import — אם venv של `mcp-aftereffects` לא קיים (סביר מאוד, הוא scaffolded), ה-backend אולי בכלל לא עולה. חייב לוודא שזה lazy.

#### 🟡 Local tools ו-connector tools באותו `toolIndex`

`registry.ts:126` ממפה local tools ל-`'local'`. אבל שם של local tool יכול להתנגש עם שם של כלי מ-MCP server. `register()` זורק אם יש כפילות באותו מפה אבל אין בדיקה צולבת בין local ל-connector. כרגע אולי לא קורה בפועל, אבל עם 5 MCP servers וצוות של tools מקומיים זה באג שמחכה לקרות.

#### 🟡 SQLite sync init חוסם startup

`apps/backend/src/main.ts:57-58`:
```ts
getDatabase();
const migrationResult = migrateJsonProjects();   // synchronous
```

`better-sqlite3` הוא סינכרוני בכוונה, אבל מיגרציה של projects מ-JSON יכולה להיות לא-טריוויאלית אם יש הרבה קבצים. עדיף להפריד migration ל-`pnpm nx run backend:migrate` כ-target נפרד, במקום להריץ אותו בכל `serve`.

#### 🟢 קאשינג ב-`ResolveConnector` (Python) — מעולה

`apps/mcp-davinci/src/mcp_davinci/resolve_connector.py` — אסטרטגיית הקאשינג (module=permanent, resolve=5s TTL, project/timeline=never) מתאימה בול לאופי של DaVinci. כשתגיעו ל-Premiere חשוב לשמור על אותה פילוסופיה.

---

### 2.4 הערות נקודתיות קטנות יותר

- `packages/strings/package.json` — `@pipefx/utils` רשום ב-`devDependencies` ולא ב-`dependencies`. אם `strings` באמת משתמש ב-`utils` ב-runtime זה יישבר בפאקג'ינג.
- `apps/backend/src/routes/chat.ts` (סעיף חלקי) — SSE helper לא תופס write errors. בחיבור איטי יכול לזרוק וללא catch.
- אין pre-commit hooks (`husky`/`lint-staged`) למרות ש-CI מריץ `lint`.
- `package.json` בשורש — אין `"engines"` field. Node 22+ הוא דרישה ב-README אבל לא נאכפת.

---

## חלק 3 — הצעות לשיפור, לפי עדיפות

### 🔴 עדיפות גבוהה (יום-יומיים)

**H1. לאחד את שכבת ה-LLM providers.**
להעביר את `packages/ai/src/lib/providers/*` לתוך `packages/providers/src/lib/llm/`. לעדכן את `@pipefx/ai` לקרוא ל-registry של providers במקום לייבא SDKs ישירות. להסיר את `@anthropic-ai/sdk`/`@google/genai`/`openai` מ-`packages/ai/package.json` וגם מ-`apps/backend/package.json` (שם להשאיר רק אם באמת משתמשים — כנראה workflows).

**H2. לעטוף את `getAllTools()` ב-swap אטומי.**
```ts
async getAllTools(): Promise<Tool[]> {
  const newIndex = new Map<string, string>();
  const allTools: Tool[] = [];
  // ... למלא את newIndex, allTools ...
  this.toolIndex = newIndex;   // swap בסוף
  return allTools;
}
```
בו-זמנית, לשקול קאש קצר (5s TTL) על התוצאה של `getAllTools()` כדי לא להריץ `listTools()` על כל connector בכל chat.

**H3. להוציא את ה-system prompt מ-`config.ts`.**
להעביר ל-`apps/backend/src/prompts/system.md`, לטעון בזמן boot. לפצל ל-sections (core / memory / pipeline_actions / skills) כדי שאפשר להרכיב דינמית. להוסיף unit test קצר שבודק שה-prompt לא ריק ושיש בו את placeholders קריטיים.

**H4. להוסיף טסטים ל-`@pipefx/mcp` ו-`@pipefx/ai`.**
מינימום: `registry.spec.ts` (concurrency, routing, local-vs-connector collision), `connector.spec.ts` (timeout, reconnect, mock Client), `agent.spec.ts` (tool loop, compaction trigger, streaming events). אלה הכי חשובים בפירמידה.

### 🟡 עדיפות בינונית (שבוע)

**M1. תוקן-תוקן ה-timeout הכפול ב-`connector.ts`.**
להסיר את ה-`setTimeout` הידני, להסתמך על `{ timeout }` של SDK או על `AbortController` אחד. בריקונקט לעשות `await transport.close()` מפורש.

**M2. Tokenizer אמיתי לתוך `Provider` interface.**
להוסיף `countTokens(messages): Promise<number>` ל-`Provider` type. כל ספק מממש עם הטוקנייזר שלו. `shouldCompact` יקבל `provider` ויקרא ל-`provider.countTokens()` במקום הנאיבי.

**M3. לפצל את `main.ts` של ה-backend.**
להעביר את `registerTaskTools()` ו-`registerMemoryTools()` ל-`apps/backend/src/tools/task-tools.ts` ו-`memory-tools.ts` (או עוד יותר טוב — ל-`@pipefx/memory-tools`). `main.ts` צריך להיות <100 שורות.

**M4. לשכתב את ה-tool args typing.**
לגזור טיפוסים מה-JSONSchema (למשל עם `json-schema-to-ts` או לכתוב טיפוסים מקבילים). להסיר את כל ה-`async (args: any)`.

**M5. לשפר בעיקרון את loading של `.env`.**
להחליף את ה-regex של עברית ב-`zod` schema:
```ts
const envSchema = z.object({
  GEMINI_API_KEY: z.string().regex(/^[A-Za-z0-9_-]+$/),
  OPENAI_API_KEY: z.string().regex(/^sk-[A-Za-z0-9_-]+$/),
  ...
});
```
תשפיע גם על vaildation של pagamentos של קונקטורים (לאמת שה-venv/path באמת קיים לפני `register`).

**M6. lazy registration של קונקטורים.**
לבדוק `fs.existsSync(venvPath)` לפני `registry.register(config.connectors.X)`. הכי חשוב ל-aftereffects/blender/ableton שרובם scaffolded.

### 🟢 עדיפות נמוכה (כשיש זמן)

**L1. לעדכן את `CLAUDE.md`.**
להוסיף את `packages/providers`, `packages/tasks`, ואת 4 ה-MCP apps החדשים. לעדכן את dependency graph diagram.

**L2. ניקיון שורש הריפו.**
למחוק/להוסיף ל-`.gitignore`: `import json`, `backend_crash_test.log`, `check_formats.py`, `tmp/*.mjs`. לאחד את `stools/` לתוך `apps/mcp-davinci` אם זה באמת בשימוש שם, או להעביר לריפו נפרד.

**L3. להוסיף pre-commit hook.**
`husky` + `lint-staged` שמריץ `nx format:check` + `nx affected -t lint typecheck` על קבצים staged.

**L4. להוסיף `"engines": { "node": ">=22" }` ו-`"packageManager": "pnpm@10.x"` ל-root `package.json`.**

**L5. לשקול Nx Cloud Distributed Task Execution.**
השורות של `nx-cloud` מופיעות ב-CI אבל ממוטטות. עם 8 packages + 7 apps, matrix של `build/lint/typecheck/test` הוא ~56 tasks — הגיוני להפעיל DTE.

**L6. לפרוש Python MCP servers ל-uv או Poetry.**
`venv` + `pyproject.toml` בלי lockfile משמעו שכל user מקבל גרסה שונה של `pymiere`/`fusionscript`. `uv` יבריא את ה-reproducibility.

---

## חלק 4 — סיכום פעולה מוצע

אם תבחר להתמקד בסבב אחד, הסדר שהכי מחזיר ROI:

1. **H1 (איחוד providers)** — מוריד 3 תלויות ישירות, מפשט את הקוד של `@pipefx/ai`, פותח דרך ל-provider רביעי (Ollama/local) בעתיד. ~4 שעות.
2. **H3 (הוצאת system prompt)** — מאפשר איטרציות מהירות על הסוכן בלי לעבור על 365 שורות של `main.ts`. ~1 שעה.
3. **H2 (אטומיות getAllTools)** — מונע באג שיתפוס אותך בייצור. ~30 דקות.
4. **H4 (טסטים ל-mcp/ai)** — 3-4 שעות ראשוניות לצדדי הכי קריטיים, משלמים את עצמם בפעם הראשונה שתשנה את ה-tool loop.

אחרי זה, M1-M3 יוצרים שדרוג משמעותי ב-DX. כל השאר זה ליטוש.
