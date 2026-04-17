# המלצות לנודים חדשים ב-PipeFX Node System

> מסמך זה מרכז את המלצות ההרחבה ל־`NodeSystemDashboard` — מבוסס על מיפוי הנודים הקיימים ב־`apps/desktop/src/features/node-system/` ועל חקר שוק של מודלים וכלים פופולריים ב־2026.

## מצב קיים (אפריל 2026)

קטגוריות קיימות ב־`NodeSystemDashboard.tsx`:

- **VIDEO_MODELS**: Kling 3.0, SeedDance 2 (Pro), SeedDance 2 (Fast)
- **IMAGE_MODELS**: SeedDream 5, Nano Banana 2
- **LLM_MODELS**: Claude 3.5 Sonnet
- **SOUND_MODELS**: ElevenLabs TTS / SFX / STS / Isolate
- **TOOLS_NODES**: Trigger, Prompt, Download, Null (+ MediaNode רשום ב־`nodeTypes` אבל לא מופיע ב־sidebar — **לתקן**)

להלן המלצות מסודרות לפי עדיפות (1 = הכי קריטי).

---

## עדיפות 1 — מודלים שחייבים להיכנס (GAP אמיתי מול השוק)

### VIDEO_MODELS — להוסיף

| מודל | תיאור | למה חשוב |
| --- | --- | --- |
| **Veo 3.1** (Google) | Text-to-Video ו־Image-to-Video עד 4K, מייצר **דיאלוג + סאונד סביבתי** יחד עם הווידאו | מוביל את ה־leaderboards ב־2026; חוסך עבודת post-production שלמה. הנוד הכי מבוקש. |
| **Runway Gen-4.5** | Cinematic quality, שליטה מדויקת בזוויות מצלמה | סטנדרט תעשייתי למפיקים מקצועיים — חייב להיות שם |
| **Luma Ray 3** | Hi-Fi 4K HDR, פיזיקה מצוינת | זול יחסית ($7.99/mo), איכות cinematic |
| **Hailuo 2.3** (MiniMax) | הכי חזק בהבעות פנים ודמויות מדברות | משלים פער — SeedDance ו־Kling פחות חזקים ב־talking-head |
| **Pika 2.5** | מהיר, אפקטים מוכנים לסושיאל | מצוין לאיטרציה מהירה ותוכן שורט |
| **Wan 2.5** (local) | Open-weights, רץ מקומי | פרטיות + מחיר 0 לנפח גבוה — חשוב למשתמשים מקצועיים |
| **LTX-2** | דיפוזיה מהירה לווידאו קצר | חלופה local קלילה ל־Wan |

### IMAGE_MODELS — להוסיף

| מודל | תיאור | למה חשוב |
| --- | --- | --- |
| **Flux 2 / Flux 1.1 Pro** (Black Forest Labs) | ריאליזם מוביל, טקסטורות עור, 4.5s generation | הסטנדרט הפוטוריאליסטי של 2026; חובה |
| **Midjourney V8** | איכות אסתטית גבוהה, 2K native, פי 5 מהיר יותר מגרסאות קודמות | מוביל לסגנון אומנותי / board design |
| **Ideogram 3.0** | הכי טוב ברנדור **טקסט בתוך תמונות** (לוגו, פוסטרים, שלטים) | ה־niche הזה חסר לחלוטין ב־PipeFX |
| **Recraft V4** | #1 בלוגואים, export ל־SVG, vector | חשוב לזהות מותג / thumbnails |
| **GPT Image 1.5** (OpenAI) | טקסט מדויק + עריכות מורכבות | השוואה תקפה מול Flux |
| **Imagen 4 / Imagen 4 Fast** (Google) | $0.02/image, 2K resolution | אופציה מהירה וזולה במיוחד |

### SOUND_MODELS — להוסיף

| מודל | תיאור | למה חשוב |
| --- | --- | --- |
| **Suno v5.5** | שיר מלא (ווקאל + מוזיקה) מטקסט; voice cloning | חסר לחלוטין — PipeFX כרגע רק voice, לא שירים |
| **Udio v1.5** | 48kHz סטריאו, inpainting לשיר, stems | חלופה לאיכות סטודיו |
| **ElevenLabs Music** | מוזיקה עם licensing בטוח למסחר | חשוב ליוצרים שמפחדים מסכסוכי זכויות |
| **Stable Audio 2.5** | SFX ו־loops (enterprise) | משלים את ElevenLabs SFX |
| **Google Lyria 3** | מוזיקה + ווקאל | חלופה נוספת לאקו־סיסטם Google |
| **MusicGen** (Meta) | Open-source | רץ מקומית, ללא עלויות API |

### LLM_MODELS — להוסיף

| מודל | תיאור | למה חשוב |
| --- | --- | --- |
| **Claude Opus 4.6** | הכי חזק בקוד וכתיבה מדויקת | כבר `anthropic` קיים — פשוט להוסיף עוד מודל לאותו provider |
| **GPT-5.4** | Computer use + reasoning מובנה | חסר OpenAI לגמרי ב־LLM_MODELS כרגע |
| **Gemini 3.1 Pro** | מוביל ב־GPQA (94.3%), multimodal | ה־provider Gemini כבר קיים בקוד (image) — קל להרחיב ל־LLM |
| **Grok 4** | מוביל בהסקה קשה | alternative מענייננ |
| **GLM-5 / MiniMax M2.5** | Open-source, מתחרים בצמרת | חלופה עצמאית |

---

## עדיפות 2 — נודי עיבוד מדיה (Post-processing)

קבוצה חדשה שמומלץ ליצור: **`MEDIA_FX_NODES`** (אייקון `Wand2` / `Filter`).

| נוד | תיאור | יישום |
| --- | --- | --- |
| **Upscale Node** | Topaz / Real-ESRGAN / SeedVR2 — שדרוג ל־4K/8K | חיבור אחרי כל ModelNode |
| **Frame Interpolation Node** | RIFE / Topaz — 24→60fps, slow motion | שימושי מאוד בפלטים של Kling / SeedDance |
| **Lip Sync Node** | Wav2Lip / LivePortrait / MuseTalk | ברירת מחדל: חיבור video + audio → video לפי sync |
| **Face Swap Node** | Roop / FaceFusion / InSwapper | לקונסיסטנטיות דמויות |
| **Background Removal Node** | BiRefNet / Remove.bg / RMBG-2.0 | לפני compositing |
| **Inpaint / Outpaint Node** | Flux Fill | עריכת תמונות קיימות |
| **Style Transfer / ControlNet Node** | Pose, Canny, Depth references | לשליטה בקומפוזיציה |
| **Video Segmentation Node** | SAM 2 / Segment Anything | מסיכות אובייקט בווידאו |

---

## עדיפות 3 — נודי Utility / Logic

נודים שנמצאים בכל עורך מקצועי (ComfyUI, Nuke, Blender). חיוני לבניית pipelines לא־ליניארים.

| נוד | תיאור | דוגמת שימוש |
| --- | --- | --- |
| **Switch Node** | בוחר בין N כניסות לפי index | A/B testing של מודלים |
| **Merge / Concat Node** | איחוד שני וידאו / אודיו ברצף | סוף סצנה 1 → התחלת סצנה 2 |
| **If / Condition Node** | Route לפי boolean | אם ה־LLM מחזיר "yes" → מסלול A, אחרת B |
| **Math Node** | חיבור/חיסור/השוואה של מספרים (duration, seed, weights) | חישוב זמן כולל לפני render |
| **String Transform Node** | append / slice / template / replace | בניית prompt דינמי |
| **Loop / Iterator Node** | הרצה מרובה עם שינוי פרמטר | grid של 5 variations לאותו prompt |
| **Random Node** | seed, רנדומיזציה של prompt | exploration אוטומטי |
| **Wait / Delay Node** | לעכב שלב (rate limiting) | חשוב לכפיפות לAPI |
| **Webhook / HTTP Node** | POST/GET ל־API חיצוני | אינטגרציה עם Slack/Discord/Notion |

---

## עדיפות 4 — נודים ספציפיים ל־Video Pipeline (PipeFX specific)

בהתבסס על ה־backend workflows הקיימים (`subtitles.ts`, `transcript.ts`, `autopod.ts`):

| נוד | תיאור | עומד על workflow קיים? |
| --- | --- | --- |
| **Whisper / Transcribe Node** | שמע → טקסט עם word-level timestamps | כן — `workflows/transcript.ts` |
| **Subtitle Node** | טקסט + timings → SRT/VTT/burned-in | כן — `workflows/subtitles.ts` |
| **Silence Cut Node** | חיתוך silences אוטומטי | לא — הוספה חדשה |
| **Scene Detect Node** | חיתוך לפי change of scene | לא — הוספה חדשה |
| **DaVinci Timeline Node** | לייצא/לייבא timeline מ־Resolve | יש אינטגרציה — ניתן להרחיב |
| **Speaker Diarization Node** | זיהוי דוברים | לא — שימושי מאוד לפודקאסטים |
| **Auto-crop / Vertical Node** | המרת landscape → 9:16 עם smart cropping | טרנד שורטס |

---

## עדיפות 5 — 3D Models (יש placeholder ב־`packages/providers/src/lib/3d-models`)

| מודל | תיאור | נישה |
| --- | --- | --- |
| **Tripo 3.0** | Text/Image → 3D, quad topology לגיימינג | הכי טוב למעצבי game asset |
| **Meshy 5** | מהיר, פורמט 3MF, print-ready | מדפסות תלת־מימד |
| **Rodin Gen-2** | 10B params, הכי פוטוריאליסטי | render / cinematic |
| **Hunyuan3D 2** (Tencent) | Open-source | רץ local |

נוד מוצע: **Model3DNode** (סימטרי ל־`ModelNode` אבל יוצא mesh).

---

## עדיפות 6 — Input / Integration Nodes

| נוד | תיאור |
| --- | --- |
| **URL Fetch Node** | הורדת מדיה מ־YouTube / Drive / Dropbox |
| **Clipboard Node** | קריאה מה־clipboard של המשתמש |
| **Camera / Screen Capture Node** | כניסה ישירה מהמצלמה / מסך |
| **Text File Node** | טעינת `.txt` / `.md` לטקסט ב־pipeline |
| **JSON Node** | parsing/templating של JSON |
| **Notion / Airtable / Sheets Node** | כתיבה/קריאה מטבלה חיצונית |

---

## המלצות מעשיות לקוד

1. **לתקן ה־bug הקיים**: `MediaNode` רשום ב־`nodeTypes` אבל לא מופיע באף אחת מהרשימות ב־`TOOLS_NODES` → להוסיף ל־sidebar.
2. **להוסיף קטגוריית `MEDIA_FX_MODELS`** ו־`UTILITY_NODES` ל־`openSections`:
   ```ts
   const [openSections, setOpenSections] = useState({
     video: true, image: true, llm: true, sound: true,
     mediaFx: true,  // חדש
     utility: true,  // חדש
     threeD: false,  // חדש
     tools: true,
   });
   ```
3. **שינוי ב־`usePipelineExecutor.ts`**: נודים חדשים כמו Switch/Condition דורשים טיפול בזרימת control flow (לא רק data flow). מומלץ להרחיב את ה־executor לתמיכה ב־"conditional edges".
4. **Registry ב־`packages/providers`**: לכל מודל חדש נדרש adapter חדש תחת `image-gen/`, `video-gen/`, `sound-gen/`, או `3d-models/`.

---

## סדר יישום מומלץ

1. **שבוע 1**: Flux 2, Veo 3.1, Suno v5 (ה־3 GAPs הגדולים ביותר) + fix של MediaNode ב־sidebar.
2. **שבוע 2**: נודי Utility (Switch, Math, Condition, String) — משדרגים את היכולת לבנות pipelines אמיתיים.
3. **שבוע 3**: Upscale + Frame Interpolation + Lip Sync — מכפילים את הערך של ה־video nodes הקיימים.
4. **שבוע 4**: הרחבת LLM (Gemini, GPT), Whisper/Subtitles כנודים חזיתיים שעוטפים את ה־backend workflows.
5. **עתיד**: 3D, Integrations (Notion/Sheets), Scene Detect, Speaker Diarization.

---

## מקורות

- [Best Video Generation AI Models in 2026 — Pinggy](https://pinggy.io/blog/best_video_generation_ai_models/)
- [Best AI Video Model 2026 — LaoZhang AI](https://blog.laozhang.ai/en/posts/best-ai-video-model)
- [Best AI Image Models 2026 — TeamDay.ai](https://www.teamday.ai/blog/best-ai-image-models-2026)
- [10 Best AI Image Generators 2026 — fal.ai](https://fal.ai/learn/tools/ai-image-generators)
- [Best AI Music Models 2026 — TeamDay.ai](https://www.teamday.ai/blog/best-ai-music-models-2026)
- [10 Best AI Music Generation Models 2026 — ModelHunter](https://modelhunter.ai/blog/best-ai-music-generation-models-2026)
- [LLM Leaderboard 2026 — Vellum AI](https://www.vellum.ai/llm-leaderboard)
- [Best LLM for Coding 2026 — SmartScope](https://smartscope.blog/en/generative-ai/chatgpt/llm-coding-benchmark-comparison-2026/)
- [ComfyUI Nodes — ComfyUI Wiki](https://comfyui-wiki.com/en/comfyui-nodes)
- [ComfyUI-Logic GitHub](https://github.com/theUpsider/ComfyUI-Logic)
- [8 Best Open Source Lip-Sync Models 2026 — Pixazo](https://www.pixazo.ai/blog/best-open-source-lip-sync-models)
- [Best 3D Model Generation APIs in 2026 — 3DAI Studio](https://www.3daistudio.com/blog/best-3d-model-generation-apis-2026)
- [BiRefNet Background Removal — fal](https://fal.ai/models/fal-ai/birefnet)
- [Flux Fill Inpainting Guide — Apatero](https://apatero.com/blog/flux-fill-inpainting-outpainting-complete-guide-2025)
