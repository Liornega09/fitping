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
- Rate limiting — 20 msg/min/user (PR #14)
- Plateau detection — אזהרה ב-`progress` ו-`suggest` (PR #15)
- Volume trends — `volume <muscle>` / `נפח <שריר>` (PR #16)
- Goals — `goal <ex> <kg> x <reps>` + achievement detection (PR #17)
- Render deploy blueprint + README button (PR #18)
- UX polish round 1+2 — bug fixes, units, gender, compressed `exercise_saved` (PR #19)
- Parser flexibility round 3 — `weight 92kg`, `sleep 6.5h`, `progress` overview, `invalid_goal_format`, `volume <exercise>` hint (PR #20)

190/190 טסטים עוברים. CI ירוק. Branch protection על `main` (PR + Typecheck & Tests required).

## תזכורות תפעוליות

לפני שמריצים את ה-cron בפרודקשן צריך להגדיר env:
- `INTERNAL_JOBS_TOKEN` — סוד ל-Bearer auth של `/internal/jobs/weekly-summary` ו-`/internal/jobs/nudge`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` — לשליחה בפועל
- `OPENAI_API_KEY` (אופציונלי) — לאת LLM fallback
- לתזמן GitHub Action / Render Cron:
  - כל יום שני 08:00 UTC: `POST /internal/jobs/weekly-summary`
  - כל יום 09:00 UTC: `POST /internal/jobs/nudge`

## הצעדים הבאים

המשך UX audit (3 rounds מתוך 5 בוצעו). PR #19 כיסה בעיקר baseline bugs + units, PR #20 כיסה גמישות parser. נשארו:

### Round 4 — New Commands
**מטרה:** להרחיב את אוצר הפקודות עם דברים שיוצא לבקש בשטח.

**תכנון:**
1. `delete goal <exercise>` (HE: `מחק יעד <תרגיל>`)
   - parser intent חדש `delete_goal`
   - handler: `prisma.goal.delete(...)` + `t.goal_deleted(name)` / `t.goal_not_found(alias)` (replies קיימים)
2. `history` (HE: `היסטוריה`)
   - intent חדש `history`
   - handler: `prisma.workout.findMany({ orderBy: { startedAt: 'desc' }, take: 5 })`
   - reply: 5 אימונים אחרונים — תאריך, שם, summary קצר
   - replies קיימים: `history_header`, `history_empty`
3. `summary month` (HE: `סיכום חודש`)
   - parser: להרחיב את ה-regex של `summary` כדי לתפוס `month`
   - handler: כמו summary week אבל 4 שבועות אחורה
4. `undo 2` — מחיקה של N רישומים אחרונים
   - parser: `^undo\s+(\d+)$` → `{ type: 'undo', count: N }`
   - handler: לעדכן את הקיים שיתמוך ב-loop של count
5. טסטים: parser + webhook לכל פקודה

### Round 5 — Display Polish
**מטרה:** החזרות יראו יפה גם במסכי טלפון צרים.

**תכנון:**
1. **suggest בפורמט 2 שורות לכל תרגיל:**
   ```
   1. bench press [plateau]
      last 80kg x 5 → try 82.5kg x 5
   ```
   במקום שורה אחת ארוכה
2. **progress עם חיצי טרנד:** לחשב הפרש e1RM בין רישומים עוקבים, להוסיף ↑/→/↓ לפני כל שורה
3. (`progress` ללא שם → overview כבר בוצע ב-PR #20)

## דחיינו (architectural / decisions)

- **#21 LLM rate cap** — כרגע אין הגבלה על קריאות OpenAI. צריך counter יומי per-user ולהפסיק להשתמש ב-LLM אחרי N קריאות. דורש החלטה: מי משלם, מה הסף.
- **#22 Timezone respect** — כל החישובים ב-UTC. weekly summary יורד יום שני 08:00 UTC = 11:00 בישראל. דורש שדה `timezone` במשתמש + UI לבחירה.
- **#23 Redis rate limiter** — הגבלה הנוכחית in-memory; לא שורדת restart, לא משתפת בין instances. דורש החלטה על infra (Render Redis? Upstash?).
- **#24 Arabic-Indic numerals** — משתמשים בעברית עלולים להקליד `٥` במקום `5`. נדיר. אם יוטמע — `normalizeText` יתרגם לפני parser.
- **#25 render.yaml dynamic URL** — ה-cron jobs מקושרים ל-`https://fitping.onrender.com` hardcoded. דורש להבין אם Render תומך ב-template variable.
- **PROJECT_BOOK update** — `docs/PROJECT_BOOK.md` לא עודכן מאז PR #11. צריך סשן יעודי לעדכון עם כל מה שנעשה (PRs #12-#20).

## סדר עדיפויות מומלץ
1. Round 4 — פקודות חדשות (ערך משתמש מיידי)
2. Round 5 — display polish (קוסמטי, אבל זול)
3. PROJECT_BOOK update
4. דחויים — לפי החלטה תפעולית

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
