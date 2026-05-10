# FitPing — Next Steps

מסמך המשך עבודה. מעודכן: 2026-05-10.

## איפה אנחנו (main = 60ad9ce)

מוטמע ועובד ב-prod:
- Twilio signature verification (PR #2)
- MessageSid idempotency (PR #4)
- Personal Record detection on log (PR #5)
- Weekly auto-summary cron endpoint (PR #6)

84/84 טסטים עוברים. CI ירוק. Branch protection על `main` (PR + Typecheck & Tests required).

## תזכורות תפעוליות

לפני שמריצים את ה-cron בפרודקשן צריך להגדיר env:
- `INTERNAL_JOBS_TOKEN` — סוד ל-Bearer auth של `/internal/jobs/weekly-summary`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` — לשליחה בפועל
- לתזמן GitHub Action / Render Cron שיעשה `curl -X POST -H "Authorization: Bearer $TOKEN" $HOST/internal/jobs/weekly-summary` כל יום שני 08:00 UTC

## הצעד הבא: B — Progressive Overload Suggestions

**מטרה:** אחרי כל `exercise_log`, להוסיף שורת המלצה לפעם הבאה ("Next: 62.5kg x 5").

**תכנון:**
1. `src/domain/overload.ts` (טהור):
   - `suggestNextTarget(history: { weight, reps[] }[]): { weight, reps, rationale } | null`
   - חוקים ראשוניים:
     - אין היסטוריה → `null`
     - last set ≤5 reps והשלים את היעד → `+2.5kg, same reps`
     - 6-9 reps → `same weight, +1 rep`
     - ≥10 reps → `+2.5kg, target 8 reps`
     - השבוע חלש מהקודם → `deload: same weight, focus on form`
2. שילוב ב-[src/routes/whatsapp.ts](src/routes/whatsapp.ts) intent `exercise_log`: אחרי "Logged…" ואחרי הודעת PR (אם יש), להוסיף `Next: …`
3. טסטים: 5-6 unit ל-`overload.ts` + 2 integration ב-webhook.test.ts

**נקודה לאישור לפני הקידוד:** האם להציג את ההצעה בכל `exercise_log` או רק ב-`done`? ברירת מחדל מומלצת: כל log (תחושת מומנטום מיידית).

## אחרי B

לפי הסדר שאישרת קודם:
- **G** — תמיכה בעברית בפרסר (alias תרגילים, מספרים בעברית)
- **H** — LLM fallback כשהפרסר לא מבין (OpenAI / Anthropic)
- **C** — proactive nudges (לא רשמת אימון 3 ימים → "מה נשמע?")

## נוהל פיתוח (תזכורת)

1. `git checkout -b feat/<name>`
2. קוד + טסטים
3. `npm run typecheck; npm run test:run`
4. `git add -A; git commit -F .git\COMMIT_MSG.txt` (multiline בעברית/עם \n דורש קובץ)
5. **אתה** מריץ `git push -u origin feat/<name>`
6. PR → ממתין ל-CI ירוק → merge
7. `git checkout main; git pull; git branch -d feat/<name>`

## גוצ'יות לזכור

- `src/config.ts` עושה `schema.parse(process.env)` ב-import → דורש `DATABASE_URL`. ב-CI אין. **אסור ל-route modules לייבא `config`** — תקרא `process.env.X` ישירות.
- PowerShell: `&&` לא עובד, השתמש ב-`;`. multiline commit message → קובץ עם `Out-File -Encoding utf8`.
- אסור emojis (system instructions).
- `git push` רק אתה. אני מכין commit, אתה דוחף.
