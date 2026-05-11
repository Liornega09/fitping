# FitPing — Next Steps

מסמך המשך עבודה. מעודכן: 2026-05-11.

## איפה אנחנו (main = עדכני)

מוטמע ועובד ב-prod:
- Twilio signature verification (PR #2)
- MessageSid idempotency (PR #4)
- Personal Record detection on log (PR #5)
- Weekly auto-summary cron endpoint (PR #6)
- Progressive overload suggestions (PR #8)
- Hebrew / i18n support (PR #9)
- LLM fallback — OpenAI gpt-4o-mini (PR #10)
- Proactive nudges cron endpoint (PR #11)
- `help` / `עזרה` command (PR #11)
- Smart workout suggestion `suggest` / `הצע` (PR #12)

153/153 טסטים עוברים. CI ירוק. Branch protection על `main` (PR + Typecheck & Tests required).

## תזכורות תפעוליות

לפני שמריצים את ה-cron בפרודקשן צריך להגדיר env:
- `INTERNAL_JOBS_TOKEN` — סוד ל-Bearer auth של `/internal/jobs/weekly-summary` ו-`/internal/jobs/nudge`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` — לשליחה בפועל
- `OPENAI_API_KEY` (אופציונלי) — לאת LLM fallback
- לתזמן GitHub Action / Render Cron:
  - כל יום שני 08:00 UTC: `POST /internal/jobs/weekly-summary`
  - כל יום 09:00 UTC: `POST /internal/jobs/nudge`

## הצעדים הבאים

### I — Plateau Detection (אוטומטי)
**מטרה:** לזהות שאין התקדמות בתרגיל 3+ שבועות ולהוסיף הערה בסיכום שבועי / ב-`progress`.

**תכנון:**
1. `src/domain/plateau.ts` — `detectPlateau(logs: { weight, reps, date }[]): PlateauResult | null`
   - בודק 3 שבועות אחרונים; אם e1RM לא עלה → `{ staleWeeks: 3, lastBest: ... }`
2. שילוב ב-`progress` intent: להוסיף שורת אזהרה "Plateau detected — consider a deload week."
3. שילוב ב-`suggest`: לסמן תרגיל ב-plateau עם הערה מיוחדת
4. טסטים: 6 unit ל-`plateau.ts`

### J — Volume Trends
**מטרה:** `volume <muscle>` (עברית: `נפח <שריר>`) — מציג נפח שבועי ל-4 שבועות אחרונים.

**תכנון:**
1. `src/domain/volume.ts` — `buildVolumeHistory(logs, muscle, now)` → שורות של `week: שבוע X — N sets`
2. intent חדש `volume` ב-parser + i18n + replies
3. handler ב-whatsapp.ts
4. טסטים

### K — Rate Limiting
**מטרה:** הגנה על ה-webhook — מקסימום 20 הודעות לדקה למשתמש.

**תכנון:**
1. in-memory `Map<userId, { count, windowStart }>` — reset כל 60 שניות
2. middleware ב-`src/routes/whatsapp.ts` לפני הלוגיקה
3. תשובה: `t.rate_limited()` — "Too many requests. Please wait a minute."
4. טסטים

### L — Goals
**מטרה:** `goal bench 100kg` — שומר יעד ומציג התקדמות.

**תכנון:**
1. מודל Prisma חדש `Goal { id, userId, exerciseId, targetWeight, targetReps, createdAt, achievedAt? }`
2. migration חדש
3. intents: `set_goal` + `goals` (הצגת כל היעדים עם % התקדמות)
4. אחרי כל PR חדש — בדיקה אם יעד הושג
5. טסטים

### M — Render Deploy Button
**מטרה:** להוסיף ל-README כפתור "Deploy to Render" + קובץ `render.yaml`.

**תכנון:**
1. `render.yaml` בשורש — web service + postgres + cron jobs
2. env vars מוגדרים כ-`sync: false` (סודות)
3. badge ב-README

## סדר עדיפויות מומלץ
1. K — Rate Limiting (קצר, חשוב לאבטחה)
2. I — Plateau Detection (שיפור ל-suggest + progress)
3. J — Volume Trends (UX)
4. L — Goals (DB migration נדרש)
5. M — Render Deploy (תשתית)

## נוהל פיתוח (תזכורת)

1. `git checkout -b feat/<name>`
2. קוד + טסטים
3. `npm run typecheck; npm run test:run`
4. `git add -A; git commit -m "..."`
5. **אתה** מריץ `git push -u origin feat/<name>`
6. PR → ממתין ל-CI ירוק → merge
7. `git checkout main; git pull; git branch -d feat/<name>`

## גוצ'יות לזכור

- `src/config.ts` עושה `schema.parse(process.env)` ב-import → דורש `DATABASE_URL`. ב-CI אין. **אסור ל-route modules לייבא `config`** — תקרא `process.env.X` ישירות.
- PowerShell: `&&` לא עובד, השתמש ב-`;`.
- אסור emojis (system instructions).
- `git push` רק אתה. אני מכין commit, אתה דוחף.
