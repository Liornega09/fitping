# FitPing — ספר פרויקט

גרסה: 1.0 | תאריך: 2026-05-10 | Branch: `main` @ `dbb2cca` + `feat/proactive-nudges`

---

## תוכן עניינים

1. [מהו FitPing](#1-מהו-fitping)
2. [ארכיטקטורה טכנית](#2-ארכיטקטורה-טכנית)
3. [מבנה Codebase](#3-מבנה-codebase)
4. [מודל הנתונים](#4-מודל-הנתונים)
5. [פקודות משתמש — WhatsApp](#5-פקודות-משתמש--whatsapp)
6. [פיצ'ר: Twilio Signature Verification](#6-פיצר-twilio-signature-verification)
7. [פיצ'ר: MessageSid Idempotency](#7-פיצר-messagesid-idempotency)
8. [פיצ'ר: Personal Record Detection](#8-פיצר-personal-record-detection)
9. [פיצ'ר: Progressive Overload Suggestions](#9-פיצר-progressive-overload-suggestions)
10. [פיצ'ר: Weekly Auto-Summary](#10-פיצר-weekly-auto-summary)
11. [פיצ'ר: Hebrew Support](#11-פיצר-hebrew-support)
12. [פיצ'ר: LLM Fallback](#12-פיצר-llm-fallback)
13. [פיצ'ר: Proactive Nudges](#13-פיצר-proactive-nudges)
14. [Internal Jobs API](#14-internal-jobs-api)
15. [ספריית התרגילים](#15-ספריית-התרגילים)
16. [CI/CD ו-Branch Protection](#16-cicd-ו-branch-protection)
17. [משתני סביבה](#17-משתני-סביבה)
18. [טסטים](#18-טסטים)
19. [Roadmap עתידי](#19-roadmap-עתידי)

---

## 1. מהו FitPing

FitPing הוא בוט WhatsApp למעקב אימונים. המשתמש שולח הודעות טקסט קצרות מ-WhatsApp — FitPing מנתח, שומר, ומחזיר תשובות מיידיות עם תובנות (PR, המלצה לסט הבא, סיכום שבוע).

**עקרונות עיצוב:**
- **Text-first** — אין אפליקציה, אין לוגין, רק WhatsApp
- **Minimal friction** — `bench 60 5,5` מספיק כדי לרשום סט
- **Smart without noise** — מידע מוצג רק כשהוא רלוונטי (PR רק אם יש היסטוריה)
- **Deterministic** — הלוגיקה אינה תלויה ב-LLM; ה-LLM הוא fallback בלבד

---

## 2. ארכיטקטורה טכנית

```
WhatsApp User
      |
   Twilio (inbound webhook + outbound REST)
      |
   Fastify 4 (Node.js 20 ESM, TypeScript strict)
      |
   Domain Layer (pure functions: parser, PR, overload, summary, nudge, i18n)
      |
   Prisma 5 ORM
      |
   PostgreSQL
```

**Stack:**
| Component | Tech |
|---|---|
| Runtime | Node.js 20, TypeScript 5 (ESM, strict) |
| HTTP framework | Fastify 4.28 (`trustProxy: true`) |
| ORM | Prisma 5.22 |
| DB | PostgreSQL |
| Messaging | Twilio WhatsApp (inbound: webhook, outbound: REST API via `fetch`) |
| LLM (optional) | OpenAI `gpt-4o-mini` (JSON mode, zero new npm packages) |
| Tests | Vitest 4.1.5 |
| CI | GitHub Actions (Ubuntu, Node 20) |

**Zero extra npm packages** for outbound messaging and LLM — both use native `fetch` with Basic/Bearer auth.

---

## 3. מבנה Codebase

```
src/
  app.ts                   # Fastify factory (buildApp, injectable options)
  config.ts                # Zod schema validation of process.env
  server.ts                # Entry point (reads config, calls buildApp)
  domain/
    catalog.ts             # Exercise seed data + normalizeText()
    i18n.ts                # detectLanguage() + translateHebrewToCanonical()
    nudge.ts               # shouldNudge() + buildNudgeMessage() — pure
    overload.ts            # suggestNextTarget() + formatSuggestion() — pure
    parser.ts              # parseIntent() — deterministic regex parser
    pr.ts                  # estimate1RM() (Epley) + bestE1RM helpers — pure
    replies.ts             # Per-language reply templates (en / he)
    summary.ts             # buildWeeklySummary() + week boundary helpers — pure
  lib/
    llm.ts                 # LLMIntentClassifier interface + OpenAIIntentClassifier
    prisma.ts              # Prisma client singleton
    twilioClient.ts        # TwilioRestClient (fetch-based outbound sender)
    twilioSignature.ts     # HMAC-SHA1 signature validation
  routes/
    internalJobs.ts        # runWeeklySummaryJob, runNudgeJob, POST endpoints
    whatsapp.ts            # Webhook handler (all user-facing intents)

prisma/
  schema.prisma
  seed.ts
  migrations/

tests/                     # 13 test files, 146 tests
```

---

## 4. מודל הנתונים

### User
| Field | Type | Notes |
|---|---|---|
| id | cuid | PK |
| whatsappNumber | String unique | format: `whatsapp:+972...` |
| timezone | String | default `UTC` (not yet used per-user) |
| lastNudgeSentAt | DateTime? | idempotency for nudge job |
| createdAt | DateTime | |

### Workout
| Field | Type | Notes |
|---|---|---|
| id | cuid | PK |
| userId | String | FK → User |
| name | String | e.g. "A", "Push", "Legs" |
| status | ACTIVE \| DONE | |
| startedAt / finishedAt | DateTime | |
| totalSets | Int? | computed on `done` |
| setsPerMuscleJson | Json? | `{ "chest": 9, "back": 6 }` |

### ExerciseLog
| Field | Type | Notes |
|---|---|---|
| id | cuid | PK |
| userId | String | FK → User |
| workoutId | String | FK → Workout |
| exerciseId | String | FK → Exercise |
| rawAlias | String | what the user typed ("בנץ") |
| weight | Float | kg |
| reps | Json | `[10, 10, 8]` |
| setsCount | Int | `reps.length` |
| volume | Float | `weight * sum(reps)` |
| loggedAt | DateTime | |

### Exercise
| Field | Type | Notes |
|---|---|---|
| canonicalName | String unique | "bench press" |
| primaryMuscle | String | "chest" |
| secondaryMuscles | Json | ["triceps", "front delts"] |
| aliases | Json | ["bench"] |
| isActive | Boolean | |

### ProcessedMessage
| Field | Type | Notes |
|---|---|---|
| messageSid | String unique | Twilio MessageSid |
| fromNumber | String | |
| replyText | String | cached reply for idempotency |
| processedAt | DateTime | |

### WeeklySummary
| Field | Type | Notes |
|---|---|---|
| userId + weekStart | @@unique | idempotency key |
| body | String | the full message that was sent |
| sentAt | DateTime | |

### BodyMetric
| Field | Type | Notes |
|---|---|---|
| type | WEIGHT \| SLEEP \| ENERGY \| PAIN | |
| valueNum | Float? | for numeric metrics |
| valueText | String? | for pain note |
| painScore | Int? | 0–10 |

---

## 5. פקודות משתמש — WhatsApp

כל הפקודות עובדות גם בעברית וגם באנגלית.

### ניהול אימון
| פקודה | תיאור | תשובה לדוגמה |
|---|---|---|
| `start A` / `התחל A` | פותח אימון חדש | "Started workout a." |
| `done` / `סיימתי` | סוגר אימון פעיל | סיכום עם שרירים + סטים + Top lift |
| `undo` / `בטל` | מוחק את הפעולה האחרונה | "bench press removed." |

### רישום תרגיל
```
bench 60 5,5,4
בנץ 60 5,5,4
```
תשובה:
```
bench press saved: 60kg — 3 sets (5,5,4).
New 1RM est: 70kg (was 63.3kg).   ← רק אם PR
Next: 62.5kg x 5.                 ← רק אם יש היסטוריה
```

### סיכומים ועקיבה
| פקודה | תיאור |
|---|---|
| `summary today` / `סיכום היום` | שרירים + סטים של היום |
| `summary week` / `סיכום שבוע` | שרירים + סטים השבוע הנוכחי |
| `progress bench` / `התקדמות בנץ` | 5 אימונים אחרונים עם תאריך + משקל |

### מדדי גוף
| פקודה | תיאור |
|---|---|
| `weight 92.4` / `משקל 92.4` | שמירת משקל גוף |
| `sleep 6.5` / `שינה 6.5` | שמירת שעות שינה |
| `energy 7` / `אנרגיה 7` | שמירת רמת אנרגיה (1–10) |
| `pain right shoulder 3/10` / `כאב כתף ימין 3/10` | שמירת כאב |

---

## 6. פיצ'ר: Twilio Signature Verification

**מה:** כל בקשה נכנסת ל-`/webhooks/whatsapp` מאומתת מול Twilio באמצעות HMAC-SHA1.

**איך:**
- `src/lib/twilioSignature.ts` — `validateTwilioSignature(authToken, signature, url, params)`
- HMAC מחושב על ה-URL + params ממוינים לפי מפתח
- השוואה מבוצעת עם `crypto.timingSafeEqual` למניעת timing attacks
- אם `TWILIO_AUTH_TOKEN` לא מוגדר — הוורידקציה מדולגת עם warning (מצב dev/test)

**PR:** #2

---

## 7. פיצ'ר: MessageSid Idempotency

**מה:** Twilio שולח retry אם לא מקבל 200 בזמן. ללא הגנה, זה יכול ליצור workout כפול.

**איך:**
- לפני עיבוד: בדיקת `ProcessedMessage.findUnique({ messageSid })`
- אחרי עיבוד: `ProcessedMessage.create({ messageSid, replyText })`
- אם יש race condition (שני retries במקביל): UniqueConstraint error נתפס, הreply הנשמר מוחזר
- הודעות ללא `MessageSid` (לא מ-Twilio) מדלגות על הcache

**PR:** #4

---

## 8. פיצ'ר: Personal Record Detection

**מה:** כשהמשתמש רושם תרגיל, FitPing משווה את ה-e1RM הנוכחי לכל ההיסטוריה ומציין PR.

**אלגוריתם (Epley Formula):**
$$e1RM = weight \times \left(1 + \frac{reps}{30}\right)$$

**כללים:**
- נחשב רק אם יש לפחות log קודם אחד (log ראשון לעולם לא PR)
- מוצג רק כשה-e1RM החדש עולה על הטוב ביותר אי פעם
- `roundKg()` עגל ל-1 מקום עשרוני

**קוד:** `src/domain/pr.ts` — פונקציות טהורות בלבד.

**PR:** #5

---

## 9. פיצ'ר: Progressive Overload Suggestions

**מה:** אחרי כל רישום תרגיל (אם יש היסטוריה), FitPing מציע יעד לסשן הבא.

**Heuristic (src/domain/overload.ts):**

| מצב | כלל | דוגמה |
|---|---|---|
| Top set ≤ 5 חזרות | +2.5kg, אותן חזרות | 5→ Next: 62.5kg x 5 |
| כל הסטים ≥ 10 חזרות | +2.5kg, יורד ל-8 חזרות | 12,11,10 → Next: 42.5kg x 8 |
| אחרת (6–9 חזרות) | אותו משקל, +1 חזרה בטופ | 8,7,7 → Next: 60kg x 9 |

**PR:** #8

---

## 10. פיצ'ר: Weekly Auto-Summary

**מה:** כל שני בבוקר, FitPing שולח לכל משתמש סיכום השבוע שעבר.

**תוכן ההודעה:**
```
Last week: 3 workouts, 47 sets.
chest: 12
back: 10
quads: 9
New PR: bench press 60kg x 5 (e1RM 70kg)
(+1 more PR)
```

**מנגנון:**
- `POST /internal/jobs/weekly-summary` — מוגן ב-Bearer `INTERNAL_JOBS_TOKEN`
- `runWeeklySummaryJob(now?, sender?)` — ניתן להזרקה לטסטים
- Idempotent: `WeeklySummary` עם @@unique על `(userId, weekStart)`
- שבוע = שני 00:00 UTC עד ראשון 23:59 UTC
- PR detection: השוואה בין best e1RM שבועי לכל ה-history

**תזמון מומלץ (GitHub Actions):**
```yaml
on:
  schedule:
    - cron: '0 8 * * 1'   # כל שני 08:00 UTC
```

**PR:** #6

---

## 11. פיצ'ר: Hebrew Support

**מה:** משתמש שכותב בעברית מקבל תשובה בעברית. מי שכותב באנגלית — באנגלית.

**ארכיטקטורה (src/domain/i18n.ts):**
1. `detectLanguage(text)` — כל תו עברי (U+0590–U+05FF) מסמן `'he'`
2. `translateHebrewToCanonical(text)` — לקסיקון 30+ מילים, התאמה לפי ארוך-ראשון:
   - קומנדות: `סיימתי` → `done`, `התחל` → `start`, `סיכום שבוע` → `summary week`
   - תרגילים: `בנץ` → `bench`, `סקוואט` → `squat`, `לחיצת חזה` → `bench`
3. הפרסר האנגלי רץ על הטקסט המתורגם — לוגיקה אחת, שתי שפות

**src/domain/replies.ts** — תבניות תשובה נפרדות לכל שפה:
- `replies('he').exercise_saved('bench press', 60, [5,5])` → `"bench press נשמר: 60ק"ג — 2 סטים (5,5)."`

**כל Intent מסומן `language: 'en' | 'he'`** כדי שה-handler יבחר שפה נכונה.

**PR:** #9

---

## 12. פיצ'ר: LLM Fallback

**מה:** כשהפרסר לא מבין הודעה (`unknown`), FitPing שואל את OpenAI לתרגם אותה ל-Intent מובנה.

**עקרונות עיצוב:**
- **הLLM לא כותב תשובות למשתמש** — רק מסווג. הhandlers הקיימים מבצעים הכל.
- **fallback בלבד** — `invalid_*` intents לא מגיעים ל-LLM (הם כבר מובנים, רק args שגויים)
- **Graceful degradation** — אין API key / שגיאת רשת / JSON שגוי → `could not parse` הקיים

**src/lib/llm.ts:**
- `LLMIntentClassifier` interface (ניתן לhook mock בטסטים)
- `OpenAIIntentClassifier` — `fetch` ישיר, `response_format: { type: 'json_object' }`, `temperature: 0`
- `coerceToIntent()` — validator מחמיר שדוחה כל shape שגוי לפני שמגיע לroute
- `llmClassifierFromEnv()` — מחזיר `null` אם אין `OPENAI_API_KEY`

**הזרקה לטסטים:**
```ts
const app = await buildApp({ whatsapp: { llmClassifier: fakeLLM } });
```

**PR:** #10

---

## 13. פיצ'ר: Proactive Nudges

**מה:** אם משתמש לא אימן 5 ימים, FitPing שולח תזכורת עם נתון מהאימון האחרון.

**הודעה לדוגמה:**
```
Hey, you haven't trained in 6 days. Last time: bench press 60kg x 5. How about today?
```

**כללים (src/domain/nudge.ts):**
- סף: `NUDGE_THRESHOLD_DAYS = 5`
- Cooldown: לא נשלח שוב אם עברו פחות מ-24 שעות מהשליחה הקודמת (`User.lastNudgeSentAt`)
- מידע מהאימון: התרגיל הכבד ביותר מהסשן האחרון שהושלם

**Statuses מוחזרים:**
- `sent` — נשלח
- `skipped_no_workout` — אין אימון מושלם אי פעם
- `skipped_recent` — מתחת לסף הזמן
- `skipped_no_sender` — אין credentials לTwilio
- `failed` — שגיאת רשת

**תזמון מומלץ:**
```yaml
- cron: '0 9 * * *'   # כל יום 09:00 UTC
```

---

## 14. Internal Jobs API

שני endpoints מוגנים ב-Bearer token (`INTERNAL_JOBS_TOKEN`):

| Endpoint | Job | תגובה אם מצליח |
|---|---|---|
| `POST /internal/jobs/weekly-summary` | שולח סיכום שבועי לכל users | `{ weekStart, weekEnd, processed[] }` |
| `POST /internal/jobs/nudge` | שולח תזכורת למי שלא אימן | `{ thresholdDays, processed[] }` |

**קריאה מ-curl:**
```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $INTERNAL_JOBS_TOKEN" \
  https://your-app.onrender.com/internal/jobs/weekly-summary
```

**שגיאות:**
- `503` — `INTERNAL_JOBS_TOKEN` לא מוגדר בשרת
- `401` — token שגוי

---

## 15. ספריית התרגילים

16 תרגילים מובנים עם aliases לפרסור גמיש:

| תרגיל | שריר ראשי | Aliases עיקריים |
|---|---|---|
| bench press | chest | bench |
| incline bench press | upper chest | incline bench, incline |
| dumbbell fly | chest | flys, flies, fly |
| lateral raise | lateral delts | lateral raises, lat raise |
| shoulder press | delts | oh press |
| back extension | lower back | back extension |
| lat pulldown | lats | pulldown |
| row | upper back | seated row |
| squat | quads | squat |
| knee flexion (leg curl) | hamstrings | leg curl |
| knee extension (leg extension) | quads | leg extension |
| triceps pushdown | triceps | pushdown |
| overhead triceps extension | triceps | overhead triceps |
| biceps curl | biceps | curl |
| hammer curl | brachialis | hammer curl |
| hanging leg/knee raise | abs | hanging leg raise, knee raise |

**בעברית** (דרך `i18n.ts`): `בנץ`, `סקוואט`, `לחיצת חזה`, `פרפר`, `הרחקות` ועוד.

---

## 16. CI/CD ו-Branch Protection

**GitHub Actions (`.github/workflows/ci.yml`):**
- Ubuntu, Node 20
- `npm run typecheck` (`tsc -p tsconfig.test.json`)
- `npm run test:run` (Vitest)
- רץ על כל PR ל-`main`

**Branch protection על `main`:**
- PR חובה (אי אפשר push ישיר)
- Status check "Typecheck & Tests" חייב לעבור

**נוהל עבודה:**
```bash
git checkout -b feat/my-feature
# קוד + טסטים
npm run typecheck; npm run test:run
git commit -F .git/COMMIT_MSG.txt
git push -u origin feat/my-feature
# פתיחת PR → CI → merge
git checkout main; git pull; git branch -d feat/my-feature
```

**כלל ה-CI gotcha:** אסור לייבא `src/config.ts` ממודולי routes — הוא עושה `schema.parse(process.env)` בזמן import ודורש `DATABASE_URL` שלא קיים ב-CI. קוראים ישיר מ-`process.env.X`.

---

## 17. משתני סביבה

| משתנה | חובה? | תיאור |
|---|---|---|
| `DATABASE_URL` | כן | PostgreSQL connection string |
| `PORT` | לא | ברירת מחדל: 3000 |
| `TWILIO_AUTH_TOKEN` | prod | לאימות חתימת webhook |
| `TWILIO_ACCOUNT_SID` | prod | לשליחה יוצאת |
| `TWILIO_WHATSAPP_NUMBER` | prod | `whatsapp:+14155238886` |
| `INTERNAL_JOBS_TOKEN` | prod | Bearer token לendpoints פנימיים |
| `OPENAI_API_KEY` | לא | מפעיל את ה-LLM fallback |
| `OPENAI_MODEL` | לא | ברירת מחדל: `gpt-4o-mini` |

---

## 18. טסטים

146 טסטים ב-13 קבצים (כולם עוברים):

| קובץ | מה נבדק | כמות |
|---|---|---|
| `parser.test.ts` | פרסינג אנגלית: כל intent, גבולות, typos | 31 |
| `webhook.test.ts` | flow מלא, idempotency, PR, overload, עברית | 25 |
| `pr.test.ts` | Epley formula, bestE1RM | 9 |
| `overload.test.ts` | suggestNextTarget שלושת הכללים, formatSuggestion | 8 |
| `i18n.test.ts` | detectLanguage, translateHebrewToCanonical, parseIntent בעברית | 11 |
| `summary.test.ts` | buildWeeklySummary, weekStartUTC, weekEndUTC | 10 |
| `internalJobs.test.ts` | weekly-summary job + endpoint auth | 7 |
| `llm.test.ts` | coerceToIntent, OpenAIIntentClassifier (mock fetch) | 11 |
| `llm.webhook.test.ts` | webhook עם LLM מוזרק (6 scenarios) | 6 |
| `nudge.test.ts` | shouldNudge, buildNudgeMessage | 9 |
| `nudge.webhook.test.ts` | nudge job + endpoint auth | 7 |
| `twilioSignature.test.ts` | HMAC-SHA1, timingSafeEqual | 8 |
| `pr.test.ts` (overload) | נכלל למעלה | — |

**הרצה:**
```bash
npm run test:run     # one-shot
npm run test         # watch mode
npm run typecheck    # tsc בלבד
```

---

## 19. Roadmap עתידי

### ערך גבוה
- **Workout templates** — `load push A` טוען רשימת תרגילים שמורה
- **Volume trends** — גרף טקסטואלי של נפח שבועי לשריר ספציפי
- **Rate limiting** — `@fastify/rate-limit` (10 req/min per number)
- **Render deploy button** — `render.yaml` לonboarding מהיר

### ניתוח חכם
- **Plateau detection** — e1RM לא עלה 4 שבועות → מציע שינוי scheme
- **Muscle balance warning** — push:pull ratio מחוץ לטווח
- **Deload suggestion** — 3 ירידות ברצף → שבוע deload

### הרחבות
- **Goals** — יעד ("100kg bench") + pace עד היעד
- **CSV export** — endpoint שמייצא את כל ה-logs
- **Admin stats** — `GET /admin/stats` (users פעילים, PRs השבוע)
- **Rest timer** — `rest` → הודעה אחרי 90 שניות

---

*FitPing — built session by session, commit by commit.*
