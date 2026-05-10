# Contributing to FitPing

מסמך זה מסביר את ה-Git workflow בפרויקט ואיך להעביר שינוי מקצה לקצה — מ-branch מקומי ועד merge ל-`main`.

---

## רקע: למה צריך branch + PR?

ה-branch `main` מוגן ב-GitHub עם **branch protection rules**:

- `Changes must be made through a pull request` — אסור לדחוף ישירות ל-`main`.
- `Required status check "Typecheck & Tests"` — ה-CI חייב לעבור לפני merge.

לכן כל שינוי, ולו הקטן ביותר, חייב לעבור דרך branch ייעודי ו-PR.

---

## ה-Flow המלא לכל פיצ'ר

### 1. התחל מ-`main` מעודכן

```powershell
git checkout main
git pull
```

### 2. צור branch חדש לפיצ'ר

קונבנציה לשמות branches:

| סוג | תחילית | דוגמה |
|---|---|---|
| פיצ'ר חדש | `feat/` | `feat/idempotency-message-sid` |
| תיקון באג | `fix/` | `fix/parser-hebrew-digits` |
| תשתית/CI | `chore/` או `ci/` | `ci/add-coverage-report` |
| תיעוד | `docs/` | `docs/contributing-guide` |

```powershell
git checkout -b feat/your-feature-name
```

### 3. עבוד וקומיט כרגיל

```powershell
git add -A
git commit -m "feat(scope): short description"
```

עיין ב-[Conventional Commits](https://www.conventionalcommits.org/) לפורמט הודעות הקומיט.

### 4. דחוף ל-GitHub

**דחיפה ראשונה** של branch חדש (יוצרת tracking):

```powershell
git push -u origin feat/your-feature-name
```

**דחיפות נוספות** באותו branch:

```powershell
git push
```

### 5. פתח Pull Request

אחרי `push -u` git מדפיס קישור כזה:

```
https://github.com/Liornega09/fitping/pull/new/feat/your-feature-name
```

פתח אותו בדפדפן ולחץ **"Create pull request"**.

### 6. חכה ל-CI

ב-PR יופיע בלוק checks:

- 🟡 **בכתום/מסתובב** — ה-CI עדיין רץ.
- ✅ **ירוק** — ה-CI עבר. כפתור ה-merge נפתח.
- ❌ **אדום** — משהו נכשל. לחץ על "Details" כדי לראות את הלוג, תקן, קומט ודחוף שוב — ה-CI ירוץ אוטומטית מחדש.

### 7. Merge

לחץ **"Merge pull request"** → **"Confirm merge"**.
מומלץ למחוק את ה-branch ב-GitHub אחרי merge (יש כפתור "Delete branch").

### 8. סנכרן את הסביבה המקומית

```powershell
git checkout main
git pull
git branch -d feat/your-feature-name
```

`git branch -d` מוחק את ה-branch המקומי שכבר מומג'ר (בטוח — git יסרב למחוק branch לא ממורג').

---

## קיצורי דרך מומלצים

### א. GitHub CLI (`gh`) — חוסך מעבר לדפדפן

התקנה חד-פעמית:

```powershell
winget install GitHub.cli
gh auth login   # בחר GitHub.com → HTTPS → Login with a web browser
```

מעכשיו, במקום הצעדים 5-7 לעיל:

```powershell
gh pr create --fill                    # יוצר PR אוטומטית מה-commits
gh pr checks --watch                   # עוקב אחרי ה-CI בזמן אמת
gh pr merge --squash --delete-branch   # ממרג' ומוחק branch (גם מקומי וגם ברימוט)
```

### ב. שמירת credentials — לא להזין PAT כל פעם

```powershell
git config --global credential.helper manager
```

מעכשיו Windows Credential Manager יזכור את ה-PAT.

### ג. Alias ל-`git sync`

```powershell
git config --global alias.sync '!git checkout main && git pull && git remote prune origin'
```

ואז `git sync` עושה checkout+pull+ניקוי refs מתים בפעם אחת.

---

## טיפול במקרים חריגים

### בטעות קומיטתי על `main`

```powershell
# יוצר branch מהקומיט הנוכחי
git checkout -b feat/rescue-branch
git push -u origin feat/rescue-branch

# מחזיר את main לאחור
git checkout main
git reset --hard origin/main
```

### ה-CI נכשל ואני צריך לתקן

```powershell
# על ה-branch של ה-PR
# ערוך קוד...
git add -A
git commit -m "fix(ci): ..."
git push
```

ה-PR יתעדכן אוטומטית וה-CI ירוץ מחדש.

### יש קונפליקט עם `main`

```powershell
git checkout feat/your-feature-name
git fetch origin
git rebase origin/main
# פתור קונפליקטים, אז:
git add <files>
git rebase --continue
git push --force-with-lease   # חובה אחרי rebase
```

---

## בדיקות לפני push

לפני כל push מומלץ להריץ מקומית את אותם הצ'קים שה-CI מריץ:

```powershell
npm run typecheck
npm run test:run
```

או בקיצור:

```powershell
npm run ci
```

אם זה עובר אצלך — זה יעבור גם ב-CI (סביבה זהה: Node 20, אותו `package-lock.json`).
