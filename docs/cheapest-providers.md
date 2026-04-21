# הפלטפורמות הזולות ביותר לכל סוג מודל

> מדריך פרקטי לבחירת ספקי API זולים לכל קטגוריית מודל ב-PipeFX.
> המטרה: להשיג את אותם המודלים שהמלצנו עליהם ב-[node-recommendations.md](./node-recommendations.md) במחיר הנמוך ביותר.

## TL;DR — המלצה אחת שורה

| קטגוריה | הכי זול | הכי מאוזן | הערה |
| --- | --- | --- | --- |
| **LLM** | OpenRouter (passthrough) | OpenRouter | לכל המודלים בממשק אחד |
| **Image (Flux/SDXL)** | Runware ($0.0006–0.01/img) | fal.ai | Runware ל-batch, fal לפיצ'רים |
| **Image (SeedDream)** | **BytePlus Ark (ישיר!)** | fal.ai | **ישיר חוסך ~50%** |
| **Video (SeedDance)** | **BytePlus/Volcano (ישיר!)** | fal.ai | **ישיר חוסך ~70%** |
| **Video (Kling)** | **Kuaishou dev portal (ישיר!)** | Atlas Cloud (30% off רשמי) | **ישיר חוסך ~40%** מ-fal |
| **Video (Veo)** | fal.ai | fal.ai | ⚠️ **יוצא דופן**: Google ישיר ($0.75/sec) **כפול** מ-fal |
| **Video (Luma/Runway)** | fal.ai (pay-per-use) | Direct sub (אם נפח גבוה) | — |
| **TTS** | Fish Audio ($15/M chars) | Cartesia | 80% פחות מ-ElevenLabs |
| **Music** | Mureka ($10/mo API) | Udio | Suno אין API ציבורי |
| **3D** | Hunyuan3D local (חינם) | fal.ai (Tripo/Rodin) | Direct Tripo ל-$20/mo unlimited |

**עיקרון מנחה**: **ישיר מהיוצר = זול יותר ב-90% מהמקרים**. ה-aggregators (fal, Replicate) לוקחים markup של 30–300%. החריג היחיד המשמעותי: **Veo 3 של Google** (ישיר $0.75/sec מול $0.40 ב-fal, כי Google מתמחר ל-Enterprise). עבור subscriptions חודשיים (Runway/Luma/MiniMax) — pay-per-use דרך fal משתלם רק אם אתה משתמש מעט.

---

## 1. LLM — OpenRouter הוא ברירת המחדל הברורה

**למה**: OpenRouter מחייב **passthrough rates** (עלות הספק + markup קטן), תומך ב-**320+ מודלים** מכל הספקים (OpenAI, Anthropic, Google, Meta, Mistral, Cohere, xAI), וזול יותר מ-Groq ב-12 מתוך 13 מודלים חופפים.

### יתרונות ל-PipeFX

- **API אחד** במקום integration נפרד ל-Anthropic, OpenAI, Google = פחות קוד, פחות ניהול מפתחות.
- **Free tier** לדגמי קהילה (Llama 3.1 8B, Gemini Flash 1.5, Mistral 7B) — 20 req/min.
- **Fallback אוטומטי** בין ספקים אם אחד קורס.
- **Tracking of cost** במקום אחד.

### מחירים לדוגמה (אפריל 2026)

| מודל | OpenRouter | ישיר מהספק |
| --- | --- | --- |
| Claude Opus 4.6 | ~$15/$75 per 1M tok (in/out) | אותו המחיר |
| GPT-5.4 | ~$1.25/$10 per 1M tok | אותו המחיר |
| Gemini 3.1 Pro | ~$1.25/$10 per 1M tok | אותו המחיר |
| Llama 3.1 8B | **חינם (rate limited)** | — |

### מתי **לא** להשתמש ב-OpenRouter

- אם חייבים **תגובה מתחת ל-300ms** → **Groq** (LPU chips, הכי מהיר בעולם).
- אם צריכים throughput ענק ל-open source → **Together AI** או **DeepInfra**.
- אם לקוח enterprise דורש חוזה ישיר עם Anthropic/OpenAI.

### השינוי ב-PipeFX

```
packages/providers/src/lib/llm/
  openrouter.ts     ← adapter אחד חדש שמחליף/עוטף:
  anthropic.ts      (נשאר כ-backup)
  openai.ts         (חדש)
  gemini.ts         (קיים כבר לתמונות)
```

---

## 2. Image — Runware + fal.ai

### 🏆 הזול ביותר: Runware

| מודל | Runware | Together | fal.ai | Replicate |
| --- | --- | --- | --- | --- |
| FLUX.1 Schnell | **$0.0013** | $0.003 | $0.025 | $0.03 |
| FLUX.2 Dev | **$0.0096** | $0.025 | $0.025 | $0.025 |
| SDXL | **$0.0026** | - | - | - |
| Nano Banana | - | - | ✓ | ✓ |

**חישוב**: 10,000 תמונות/חודש ב-FLUX Dev
- Runware: **$96**
- Together/fal: $250
- Replicate: $250–500

➡️ **חיסכון של $150–400/חודש** בהיקף הזה.

### 🎯 המאוזן ביותר: fal.ai

- **985 endpoints** — כמעט כל דבר שתרצה, במקום אחד
- מהיר יותר מ-Replicate (עד 10x)
- Exclusive access ל-**SeedDream V3, Kling 3.0, Kling O3, SeedDance 1.5 Pro** (אלה שכבר ב-PipeFX!)
- פיצ'רים: LoRA, ControlNet, IP-Adapter — הכל מוכן

### המלצה ל-PipeFX

- **Tier 1 (production, high volume)**: Runware — רק ל-Flux/SDXL הבסיסיים
- **Tier 2 (הכל אחר)**: fal.ai — ברירת מחדל לכל המודלים האחרים (SeedDream, Ideogram, Recraft, Midjourney, Imagen)
- **Tier 3 (backup)**: Replicate — אם מודל חסר בשני הראשונים

---

## 3. Video — ישיר מהיוצר כמעט תמיד זול יותר (עם ניואנס אחד)

> **תובנה כללית**: הנחת ברירת המחדל "ישיר מהיוצר = זול יותר" **נכונה ברוב המקרים**. האגרגטורים לוקחים markup של 30–300%. החריגים היחידים: (1) Runway/Luma כשאתה על מסלול **subscription חודשי** ומשתמש פחות ממה ששילמת, ו-(2) מודלים שאין להם API ציבורי בכלל.

### מחירים משווים — השוואת tier זהה (Pro/Master, 1080p)

| מודל | Direct (מהיוצר) | fal.ai | Atlas Cloud (3rd party) | הזוכה |
| --- | --- | --- | --- | --- |
| **SeedDance 2.0 Pro** | **$0.028–0.03** (BytePlus) | $0.08–0.12 | — | 🏆 **Direct (70% חיסכון)** |
| **SeedDance 1.0/1.5** | **~$0.05** (BytePlus) | $0.08 | — | 🏆 Direct |
| **SeedDream 5** (image) | **~$0.02/image** (BytePlus) | $0.04 | — | 🏆 Direct |
| **Kling 3.0 Standard** | **$0.084/sec** (Kuaishou) | $0.14+ | $0.126 | 🏆 **Direct** |
| **Kling 3.0 Pro** | **$0.168/sec** (Kuaishou) | $0.28 (2.1 Master) | $0.126 (3.0) | 🏆 **Atlas Cloud** |
| **Kling 2.6 Pro** | $0.14+ (Kuaishou) | $0.28/sec Master | — | 🏆 Direct |
| **Veo 3** | $0.75 (Google Vertex) | **$0.40** | — | 🏆 fal.ai (חריג!) |
| **Runway Gen-4.5** | $12/mo+ (subscription) | $0.25–0.40/sec | — | תלוי נפח (pay-per-use vs sub) |
| **Luma Ray 3** | $7.99/mo+ (sub) | $0.15/sec | — | תלוי נפח |
| **Hailuo 2.3** (MiniMax) | $6.99/mo+ (sub) | $0.07/sec | — | תלוי נפח |
| **Wan 2.5** | — | $0.04–0.08 | Local: **חינם** | 🏆 **Local (GPU)** |

### החריגים הבודדים

- **Veo 3**: Google גובה $0.75/sec דרך Vertex AI (Enterprise tier). fal.ai מקבל תעריף wholesale ומעביר הנחה — **זה המקרה הנדיר שבו fal באמת זול יותר ממקור**.
- **Runway / Luma / MiniMax**: המחיר הישיר הוא **subscription חודשי**, לא pay-per-use. אם אתה משתמש מעט — fal (pay-per-use) משתלם יותר. אם אתה משתמש הרבה — direct sub משתלם.
- **Atlas Cloud**: third-party aggregator שמריץ את Kling עם הנחה של 30% מהמחיר הרשמי. עובר pre-paid credits.

### למה הישיר זול יותר ברוב המקרים?

- **ByteDance (SeedDance/SeedDream)**: יצרן רוצה שמפתחים יבואו ישירות → פורטל BytePlus / Volcano Ark עם pay-per-use פשוט.
- **Kuaishou (Kling)**: פורטל klingai.com/global/dev פתוח לרישום ישיר, ולמפתח בודד אין "hidden markup".
- **ה-aggregators** מוסיפים 30–300% markup בגלל: (1) DX מסובך יותר של הפורטלים הישירים, (2) unified API, (3) features נוספים (queue, retry, monitoring).

### המלצה מעודכנת ל-PipeFX

```
packages/providers/src/lib/video-gen/
  bytedance-ark.ts    ← SeedDance + SeedDream (Direct — 70% חיסכון)
  kuaishou-kling.ts   ← Kling ישיר מ-klingai.com/global/dev (40% חיסכון)
  google-vertex.ts    ← Veo 3 — אבל קונים דרך fal! (Veo יוצא דופן)
  fal.ts              ← Veo 3, Runway, Luma, Hailuo, Wan (cloud)
  wan-local.ts        ← Wan 2.5 local (חינם אחרי GPU)
```

**חיסכון מעשי לפרויקט עם 100 סרטונים של 10 שניות בחודש**:

| מודל | דרך fal.ai | Direct (Kuaishou/BytePlus) | חיסכון |
| --- | --- | --- | --- |
| SeedDance 2.0 Pro | $100 | **$30** | $70 (70%) |
| Kling 3.0 Pro | $280 | **$168** | $112 (40%) |
| Kling 3.0 Standard | $140 | **$84** | $56 (40%) |
| **סה"כ עבור השלושה** | **$520** | **$282** | **$238 (46%)** 🎯 |

זה חיסכון של **כמעט $3,000 בשנה** על 3 מודלים בלבד. קל להצדיק את ה-overhead של לכתוב adapter נפרד לכל יצרן.

### חלופות לוקליות (חינם אחרי GPU)

- **Wan 2.5** + **LTX-2** — open-weights, רצים מקומית על RTX 4090+.
- יתרון: אפס עלות לנפח גבוה, פרטיות מלאה.
- חיסרון: דורש GPU + ניהול עצמי.

### אזהרה טכנית

נכון ל-27/03/2026, ה-API הרשמי של **SeedDance 2.0** ב-BytePlus עדיין ב-**limited preview** — רק ה-Ark experience center עם free quota. יש לוודא זמינות לפני integration. SeedDance 1.0 ו-1.5 כן פתוחים ועובדים.

---

## 4. TTS — לעזוב את ElevenLabs?

ElevenLabs איכותי אבל **יקר מאוד**. ב-2026 יש חלופות טובות יותר ובזול משמעותי.

| ספק | מחיר | איכות | לטנסי |
| --- | --- | --- | --- |
| **Fish Audio** | **$15/M chars** (80% פחות מ-EL) | #1 ב-TTS-Arena | בינוני |
| **Cartesia** | $5/mo → 100K chars | גבוהה | **הכי נמוך** (real-time) |
| **Speechmatics** | $11/M chars | גבוהה | בינוני |
| **Inworld TTS-1.5-Max** | ~$15/M | **#1 ELO (1,236)** | בינוני |
| **OpenAI TTS-1** | $15/M | טובה | נמוך |
| **Hume Octave 2** | $7.60/M | אמוציונלית | בינוני |
| ElevenLabs (הקיים) | $165/M (Creator) | מעולה | נמוך |

### המלצה ל-PipeFX

ליצור **3 אופציות** בתוך SoundNode:

- **"TTS Budget" → Fish Audio** — לרוב המקרים, 80% חיסכון
- **"TTS Realtime" → Cartesia** — לשידורים חיים / voice agents
- **"TTS Premium" → ElevenLabs** — להישאר לתוכן קריטי באיכות

זה גם נותן למשתמש שליטה ישירה באיכות מול עלות.

---

## 5. Music — Suno אין API ציבורי, Mureka הוא המוצא

**בעיה**: ל-Suno אין API ציבורי רשמי (יש unofficial wrappers שמפרים ToS). ל-Udio יש אבל יקר.

### פתרון: Mureka

- **$10/mo** לבסיסי, **$30/mo** לעסקי
- **API רשמי** (זה העיקר!)
- פיצ'רים: stem separation, MIDI export, integration
- איכות דומה ל-Suno הישן (לא v5)

### חלופות

| ספק | מחיר | רישוי מסחרי | API |
| --- | --- | --- | --- |
| **Mureka** | $10/mo+ | ✅ | ✅ רשמי |
| **Udio** | $10–30/mo | ✅ | ✅ |
| **ElevenLabs Music** | $0.80/min | ✅ **licensed bulletproof** | ✅ |
| **Google Lyria 3** | via Vertex AI | ✅ | ✅ |
| **Stable Audio 2.5** | enterprise | ✅ | ✅ |
| **MusicGen** (Meta) | local | ⚠️ | עצמי |
| **Suno** | $10/mo | ✅ | ❌ אין ציבורי |

### המלצה ל-PipeFX

1. **Mureka** — הפיצ'ר הראשי ב-sound category החדש
2. **ElevenLabs Music** — כבר יש לך חשבון, להרחיב
3. **Google Lyria 3** דרך Vertex — כשרוצים איכות instrumental
4. **MusicGen local** — למשתמשים שמריצים local

---

## 6. 3D Models — fal.ai או Direct

| ספק | fal.ai | Direct |
| --- | --- | --- |
| Tripo | ✅ (~$0.20/model) | $20/mo unlimited |
| Meshy | ❌ | $20/mo (200 credits) |
| Rodin | ✅ ($0.40/model) | credits based |
| Hunyuan3D 2 | ✅ (~$0.10/model) | local (open-source!) |

**המלצה**: fal.ai לכל המשתמשים הקצרי-שעה, Hunyuan3D local לבעלי GPU.

---

## 7. Media FX (Upscale / Lip Sync / Background Remove)

רוב ה-media FX נודים שהמלצנו עליהם זמינים ב-fal ו-Replicate:

| יישום | מומלץ | מחיר ב-fal |
| --- | --- | --- |
| **Upscale** | Real-ESRGAN / SeedVR2 | $0.002-0.01/image |
| **Frame Interpolation** | RIFE | $0.05/sec video |
| **Lip Sync** | Wav2Lip / LivePortrait | $0.10-0.30 per run |
| **Face Swap** | InSwapper | $0.005/image |
| **Background Remove** | BiRefNet / RMBG-2.0 | $0.003/image |
| **Inpaint** | Flux Fill | $0.03-0.05/image |
| **ControlNet** | SDXL ControlNet suite | $0.02-0.04/image |

➡️ **fal.ai מכסה את כולם** — אין צורך בספק נוסף.

---

## סיכום: ארכיטקטורת פרובידרים מומלצת ל-PipeFX

```
packages/providers/src/lib/
├── aggregators/
│   ├── fal.ts           ← פרימרי (video/image/3D/FX)
│   ├── runware.ts       ← high-volume images (Flux/SDXL)
│   └── openrouter.ts    ← כל ה-LLMs
├── sound-gen/
│   ├── fishaudio.ts     ← TTS זול
│   ├── cartesia.ts      ← TTS real-time
│   ├── elevenlabs.ts    ← TTS premium (קיים)
│   ├── mureka.ts        ← music generation
│   └── lyria.ts         ← google music
├── video-gen/           ← רובם יוצאים דרך fal.ts, רק wrappers
├── image-gen/           ← רובם יוצאים דרך fal.ts/runware.ts
└── llm/                 ← רובם יוצאים דרך openrouter.ts
```

### שלבי יישום

1. **שלב 1 (זול ומהיר)**: רק fal.ts + openrouter.ts → מחליף 80% מה-providers הישירים.
2. **שלב 2 (אופטימיזציית מחיר)**: להוסיף runware.ts ל-batch images ו-fishaudio.ts ל-TTS זול.
3. **שלב 3 (עומק)**: להוסיף WaveSpeedAI כ-fallback שני, Mureka למוזיקה, Hunyuan3D local ל-3D.

### חיסכון משוער (פרויקט בינוני: 1000 video + 10k image + 1M tokens LLM + 100K chars TTS בחודש)

| תרחיש | עלות חודשית |
| --- | --- |
| **כולם Direct / Replicate** | ~$850–1,200 |
| **המלצה הנוכחית** (fal + runware + OpenRouter + Fish Audio) | **~$350–450** |
| חיסכון | **~60%** |

---

## מקורות

- [WaveSpeedAI vs Replicate vs Fal.ai vs Runware comparison](https://wavespeed.ai/blog/posts/best-ai-inference-platform-2026/)
- [AI Image Model Pricing — Price Per Token](https://pricepertoken.com/image)
- [fal.ai Pricing Page](https://fal.ai/pricing)
- [Runware Pricing](https://runware.ai)
- [OpenRouter Pricing (300+ models)](https://openrouter.ai/pricing)
- [OpenRouter vs Together AI comparison](https://pricepertoken.com/endpoints/compare/openrouter-vs-together)
- [Replicate Alternative guide — TokenMix](https://tokenmix.ai/blog/replicate-alternative-cheaper?lang=es)
- [Flux Schnell cheapest API — Pixazo](https://www.pixazo.ai/blog/flux-schnell-api-cheapest-pricing)
- [Best ElevenLabs alternatives 2026 — Deepgram](https://deepgram.com/learn/text-to-speech-elevenlabs-alternatives-2026)
- [Best TTS APIs 2026 — Speechmatics](https://www.speechmatics.com/company/articles-and-news/best-tts-apis-in-2025-top-12-text-to-speech-services-for-developers)
- [Best Suno Alternatives 2026 — Musci.io](https://musci.io/blog/suno-alternative)
- [Mureka vs Suno comparison](https://champsignal.com/comparisons/mureka.ai-vs-suno.com)
- [Best AI inference platforms 2026 — apidog](https://apidog.com/blog/best-ai-inference-platform-guide-2026/)
- [fal.ai vs Replicate detailed — TeamDay.ai](https://www.teamday.ai/blog/fal-ai-vs-replicate-comparison)
