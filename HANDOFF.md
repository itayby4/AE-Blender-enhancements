# PipeFX — Handoff: מערכת משתמשים וקרדיטים

> מסמך העברה לחבר שממשיך מכאן. עודכן: 2026-04-17

## מה יש לנו

בעל הפרויקט (איתי) הוא המייסד של **PipeFX**. המוצר מורכב משני דברים שחולקים את אותה פלטפורמה:

1. **pipefx.io (האתר)** — התחיל כמערכת לביקורת וידאו בשם ReviewNotes. זה _נשאר חינמי_, וזה גם הבית של ה-Agent החדש.
2. **PipeFX Agent (תוכנה דסקטופית)** — Tauri-app שמפעילה AI כדי לשלוט ב-DaVinci Resolve / Premiere / After Effects / Blender / Ableton דרך MCP. נמצאת ב-repo `pipefx`.

המטרה: לבנות מערכת משתמשים אחת + קרדיטים ש**תחבר את שני המוצרים**. כניסה אחת = גישה לכל.

## שני ה-Repos

| Repo / Folder | מה זה | מיקום |
|---|---|---|
| `pipefx` (Nx monorepo) | מכיל את ה-Agent הדסקטופי + backend מקומי + packages משותפים. כאן נוסיף גם את `apps/website` ו-`apps/cloud-api`. | `C:\Users\PC\Documents\GitHub\pipefx` |
| `Video viewer` (ReviewNotes) | הקוד הנוכחי של האתר pipefx.io. Next.js + Supabase, כבר יש Auth עובד. | `C:\Users\PC\Desktop\Video viewer` |

**החלטה:** בסוף נמזג את ReviewNotes לתוך `apps/website` של ה-monorepo של pipefx, כדי שהכל יהיה תחת repo אחד.

## החלטות אדריכליות שהתקבלו

### מודל תמחור — BYOK + Credits

- **חינם**: המשתמש מוריד את ה-Agent, מחבר מפתחות API של עצמו (OpenAI / Gemini / Anthropic). אנחנו לא גובים כלום. הקריאות מהדסקטופ ישירות לספקים.
- **בתשלום**: המשתמש קונה קרדיטים אצלנו. מפתחות ה-API שלנו נמצאים בסוד על שרת ה-cloud-api. התוכנה שולחת בקשות לשרת שלנו עם device token, אנחנו מאמתים, מורידים קרדיטים, קוראים לספק, מחזירים.

### אחסון אימות / מסד נתונים

- **Supabase** — אותו פרויקט של ReviewNotes, מורחב עם טבלאות חדשות. יש פרויקט קיים (איתי יש לו אותו).
- **טבלת `auth.users`** של Supabase היא מקור האמת למשתמשים.

### תשלומים

- **Stripe** — נבחר (איתי עדיף אותו). Checkout Sessions + Webhooks + Price IDs.

### Hosting

- **עדיין לא סופי.** איתי רגיל ל-Hostinger. צריך לוודא איזה חבילה יש לו — אם Shared לא יעבוד (לא תומך ב-Node.js server). VPS כן יעבוד.
- ברירת מחדל מומלצת: **Railway** (פשוט, git push → deploy, SSL אוטומטי) או **Hostinger VPS + Coolify** (חוויה דומה ל-Vercel על VPS שלו).
- רוצים **לצאת מ-Vercel** (לא להמשיך שם).

### Monorepo Layout שיהיה בסוף

```
pipefx/
  apps/
    desktop/        # Tauri agent (קיים)
    backend/        # local Node HTTP server (קיים)
    mcp-*/          # MCP servers לכל אפליקציה יצירתית (קיים)
    website/        # חדש — Next.js. יחליף את pipefx.io. כולל ReviewNotes
    cloud-api/      # חדש — שרת ענן לניהול קרדיטים + AI proxy
  packages/
    ai, mcp, providers, ...  # (קיים)
  supabase/
    migrations/
      002_credits_and_auth.sql  # ✅ נכתב, מחכה להרצה
```

## מה כבר עשיתי

### ✅ SQL Migration — `supabase/migrations/002_credits_and_auth.sql`

מוסיף, בלי לגעת בסכמה הקיימת של ReviewNotes, את הטבלאות:

- `profiles` — פרופיל + יתרת קרדיטים (1-1 עם auth.users)
- `credit_transactions` — ledger append-only של כל תנועות קרדיט
- `device_tokens` — טוקנים לחיבור התוכנה הדסקטופית (נשמרים כ-sha256 hash, אף פעם לא plaintext)
- `usage_logs` — רישום כל קריאת AI (prompt_tokens, completion_tokens, credits_charged)
- `products` — חבילות קרדיטים לקנייה, מקושר ל-Stripe price IDs
- `stripe_events` — idempotency log ל-webhooks

**פונקציות DB אטומיות:**
- `debit_credits(user_id, amount, ...)` — חיוב אטומי. זורק `insufficient_credits` אם אין מספיק.
- `credit_credits(user_id, amount, ...)` — זיכוי אטומי.
- Trigger על `auth.users` שיוצר `profiles` אוטומטית בכל רישום.
- Trigger על `profiles` שמונע שינוי של `credits_balance` / `plan` / `stripe_customer_id` מצד הלקוח (רק service_role מורשה).

**RLS פוליסים:**
- כל משתמש רואה רק את הרשומות שלו.
- `products` קריא ציבורית (עבור דף התמחור).
- `device_tokens`: משתמש יכול לראות ולבטל (UPDATE revoked_at) אבל לא ליצור (INSERT דרך API בלבד, כדי שהשרת יוצר את ה-hash).
- `stripe_events`: רק service_role.

**הערה על יחידת הקרדיט:** בחרתי `1 credit = $0.0001 USD` (10,000 קרדיטים = $1). מאפשר מחיר מדויק לטוקן AI. ניתן לשנות.

### ✅ עיצוב המערכת

התרשים הכללי:

```
pipefx.io (Next.js)
  ← Login/Signup דרך Supabase Auth
  ← Dashboard: יתרת קרדיטים, היסטוריה, device tokens
  ← Checkout דרך Stripe
  ← עמודי ReviewNotes (כמו היום)
       │
       │ הזמנת קרדיטים → Stripe webhook → credit_credits()
       │
       ▼
Supabase (auth + profiles + credits + logs)
       ▲
       │
cloud-api (Node server)
  ← מקבל בקשות AI מה-Desktop עם device token
  ← מאמת token (פענוח hash), בודק יתרה
  ← קורא ל-OpenAI/Gemini/Anthropic עם המפתחות שלנו
  ← debit_credits() ו-INSERT ל-usage_logs
       ▲
       │ HTTPS + Bearer <device_token>
       │
Desktop Agent (Tauri)
  • BYOK mode: קורא ישירות לספקים עם המפתח של המשתמש
  • Paid mode: קורא ל-cloud-api במקום
  • MCP connectors לאפליקציות יצירתיות נשארים מקומיים תמיד
```

## מה נשאר לעשות (לפי סדר)

### 1. הרצת ה-migration ב-Supabase
- [ ] לקחת את `supabase/migrations/002_credits_and_auth.sql`
- [ ] להדביק ב-SQL Editor של פרויקט ה-Supabase הקיים ולהריץ
- [ ] לוודא: `SELECT * FROM profiles;` מחזיר שורה לכל משתמש קיים
- [ ] לוודא שיש 6 טבלאות חדשות ב-Database → Tables

### 2. הקמת `apps/website` ב-monorepo של pipefx
- [ ] `pnpm nx g @nx/next:app website` (או דומה, צריך לבדוק את הגנרטור הנכון של Nx)
- [ ] להעתיק את קוד Supabase client מ-`Video viewer/lib/supabase/` לתוך `apps/website/src/lib/supabase/`
- [ ] להעתיק middleware ואת `/login` ו-`/auth/callback` מ-ReviewNotes
- [ ] להגדיר Tailwind v4 + shadcn/ui (ככה שה-Agent מוגדר)
- [ ] `.env.local` עם הגדרות Supabase
- [ ] לוודא: `pnpm nx serve website` פותח login ואפשר להירשם

### 3. Dashboard
- [ ] `/dashboard` — page מוגנת, מציגה יתרת קרדיטים, שם, plan
- [ ] `/dashboard/usage` — היסטוריית שימוש (טבלה מ-`usage_logs`)
- [ ] `/dashboard/tokens` — רשימת device tokens עם אפשרות ליצור חדש / לבטל
  - יצירת token חדש: `POST /api/tokens` (API route). יוצר token אקראי, שומר hash, מחזיר ללקוח את ה-plaintext **פעם אחת בלבד** (מודאל "העתק עכשיו, לא תוכל לראות שוב")
- [ ] `/dashboard/billing` — קישורי קנייה + היסטוריית קניות (מ-`credit_transactions` עם `type='purchase'`)

### 4. אינטגרציית Stripe
- [ ] יצירת products ב-Stripe Dashboard (חבילות קרדיטים — למשל $10/$25/$50)
- [ ] להזין אותן ל-`products` ב-Supabase (עם stripe_price_id)
- [ ] `/api/stripe/checkout` — יוצר Checkout Session
- [ ] `/api/stripe/webhook` — מקבל `checkout.session.completed`:
  1. verify signature
  2. insert ל-`stripe_events` (unique key מונע עיבוד כפול)
  3. `SELECT ... FROM products WHERE stripe_price_id = ?`
  4. `credit_credits(user_id, credits, 'purchase', ..., stripe_session_id)`
- [ ] מסך הצלחה `/dashboard/billing/success?session_id=...`

### 5. `apps/cloud-api`
- [ ] `pnpm nx g @nx/node:app cloud-api`
- [ ] Middleware לאימות Bearer token:
  1. hash הטוקן (sha256)
  2. `SELECT ... FROM device_tokens WHERE token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`
  3. `UPDATE device_tokens SET last_used_at = NOW(), last_used_ip = ?`
- [ ] `POST /ai/complete` — מקבל `{ provider, model, messages }`:
  1. אומד עלות במקרה הגרוע (max_tokens × price_per_token) ובודק יתרה
  2. קורא לספק
  3. מחשב credits_charged לפי tokens שנצרכו בפועל
  4. `debit_credits()` + INSERT ל-`usage_logs` (באותו transaction דרך RPC)
  5. מחזיר את התוצאה
- [ ] טיפול בשגיאות: אם הספק נפל אחרי שכבר חייבנו, החזר קרדיטים (`credit_credits` עם type='refund')

### 6. שינויים ב-Desktop
- [ ] ב-`apps/desktop` — להוסיף זרימת login:
  - לחיצה על "Sign in" פותחת דפדפן ל-`pipefx.io/auth/device?callback=pipefx://auth`
  - האתר: אחרי login, יוצר device_token אוטומטית וחוזר ל-`pipefx://auth?token=...` (deep link)
  - Tauri מקבל את ה-deep link, שומר token ב-OS keystore (`tauri-plugin-store` או `keyring`)
- [ ] ב-`packages/providers` או שכבה חדשה — החלטה מה המצב הנוכחי:
  - `mode === 'byok'` → הקוד הקיים ישיר לספק
  - `mode === 'cloud'` → POST ל-cloud-api עם Bearer token
- [ ] ב-UI של ה-Agent — טוגל Settings: BYOK / Cloud, ותצוגת יתרת קרדיטים

### 7. פריסה
- [ ] לבחור hosting סופית (תלוי בתשובה של איתי על Hostinger)
- [ ] לרשום דומיין / להפנות pipefx.io לשרת החדש
- [ ] SSL (Let's Encrypt)
- [ ] Secrets: environment variables ל-website + cloud-api (Supabase keys, Stripe keys, AI provider keys)
- [ ] הרצת webhook של Stripe בפרודקשן (URL יציב + signing secret)

### 8. אימות end-to-end
- [ ] הרשמה באתר → מופיע משתמש ב-Supabase + `profiles` עם 0 credits
- [ ] קנייה עם כרטיס Stripe test → balance מתעדכן נכון
- [ ] יצירת device token מה-dashboard → הצגת ה-token פעם אחת
- [ ] הדבקת token ב-Desktop → login מוצלח
- [ ] קריאת AI מה-Agent → credits יורדים + שורה ב-`usage_logs`
- [ ] DB reconciliation: `SELECT SUM(amount) FROM credit_transactions WHERE user_id = ...` == `credits_balance` מ-`profiles`

## שאלות פתוחות שאיתי צריך להחליט

1. **חבילת Hostinger** — איזו חבילה יש לו? אם Shared — חייב לעבור ל-VPS או Railway.
2. **תמחור חבילות קרדיטים** — כמה כל חבילה תעלה ותיתן? למשל $10 → 100K credits. תלוי במרווח רצוי.
3. **פרטי login ל-Supabase** — לא יצאו לצ'אט; צריך לקבל URL ו-anon key, ולשים ב-`.env.local` בכל app. ה-service_role key רק ל-cloud-api ול-website (server-only).
4. **שאלה עתידית**: האם לתמוך ב-BYOK בתוך האתר (לא רק בדסקטופ)? למשל משתמש מכניס מפתח Gemini ב-dashboard והאתר מציע Agent עבור שימוש מהדפדפן. כרגע לא מתוכנן, אפשר להחליט אחר כך.

## איך לבדוק מצב ה-Tasks

אם אתה באותה סביבה של Cowork, יש TodoList עם 9 משימות שמשקפות את מה שכאן. משימה 1–3 הושלמו (קריאת סכמה, עיצוב, כתיבת migration). 4–9 פתוחות.

## חומר עזר — קבצים חשובים

| קובץ | למה |
|---|---|
| `pipefx/CLAUDE.md` | הוראות פרויקט ל-AI agents, מסביר את הארכיטקטורה של ה-Nx monorepo |
| `pipefx/AGENTS.md` | סקירה ארכיטקטונית של ה-Agent |
| `pipefx/ARCHITECTURE_REVIEW.md` | דיון פנימי על בחירות ארכיטקטוניות |
| `pipefx/apps/backend/src/main.ts` | הכניסה של השרת המקומי, מראה איך Agent + ConnectorRegistry מתחברים |
| `pipefx/packages/providers/` | עוטף את OpenAI/Gemini/Anthropic. כאן יהיה הכי הרבה השינוי כדי לתמוך במצב Cloud |
| `Video viewer/supabase/migrations/001_initial_schema_safe.sql` | הסכמה המקורית של ReviewNotes |
| `Video viewer/lib/supabase/` | Supabase clients (browser/server/service) שאפשר להעתיק |
| `Video viewer/middleware.ts` | middleware של Supabase auth שצריך להעתיק |
| `pipefx/supabase/migrations/002_credits_and_auth.sql` | ה-migration החדש שנכתב היום |

## טיפ אחרון

העיקרון המנחה: **אל תיצור vendor lock-in ל-Supabase**.
- שום Edge Function של Supabase. כל הלוגיקה ב-API routes של Next.js או ב-cloud-api.
- שום `supabase.rpc()` לפונקציות business — רק ל-`debit_credits` / `credit_credits` שהם אטומיים ואמיתית צריכים לרוץ ב-DB.
- החלף את `supabase.auth` דרך wrapper שלנו (למשל `lib/auth/index.ts`) כדי שיום אחד נוכל להחליף ל-Auth.js / Clerk.

ביום שנרצה לעזוב Supabase — `pg_dump` על הסכמה, הרמת Postgres בכל מקום, החלפת שכבת ה-auth. פרויקט של שבוע-שבועיים, לא חודשים.

בהצלחה 🚀
