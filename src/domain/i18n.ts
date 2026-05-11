/**
 * Lightweight Hebrew → canonical-English translation for the WhatsApp parser.
 *
 * We do NOT try to parse Hebrew grammar. Instead, we tokenize the input,
 * translate each known token to its English canonical equivalent, and let
 * the existing English parser do the rest. This keeps the parser code in
 * one place and makes adding more languages later cheap.
 *
 * Detection is intentionally simple: any Hebrew letter (U+0590..U+05FF)
 * marks the message as Hebrew.
 */

export type Language = 'en' | 'he';

const HEBREW_RANGE = /[\u0590-\u05FF]/;

export function detectLanguage(text: string): Language {
  return HEBREW_RANGE.test(text) ? 'he' : 'en';
}

/**
 * Hebrew tokens → canonical English. Keys are normalized (lowercased &
 * single-spaced); values must match what the English parser already
 * accepts (commands or exercise aliases from src/domain/catalog.ts).
 *
 * Order matters when phrases overlap — we apply longest-first below.
 */
const HEBREW_LEXICON: Record<string, string> = {
  // commands
  'עזרה': 'help',
  'הצע': 'suggest',
  'המלצה': 'suggest',
  'התחל': 'start',
  'התחלה': 'start',
  'תתחיל': 'start',
  'סיים': 'done',
  'סיימתי': 'done',
  'גמרתי': 'done',
  'גמור': 'done',
  'בוטל': 'undo',
  'בטל': 'undo',
  'ביטול': 'undo',
  'אחורה': 'undo',
  'סיכום': 'summary',
  'היום': 'today',
  'שבוע': 'week',
  'התקדמות': 'progress',
  'מעקב': 'progress',
  'משקל': 'weight',
  'שינה': 'sleep',
  'אנרגיה': 'energy',
  'כאב': 'pain',

  // exercises (canonical aliases that already exist in catalog.ts)
  'בנץ': 'bench',
  'לחיצת חזה': 'bench',
  'חזה': 'bench',
  'לחיצה משופעת': 'incline bench',
  'משופע': 'incline',
  'פרפר': 'fly',
  'פרפרים': 'flys',
  'הרחקות': 'lateral raises',
  'הרחקה': 'lateral raise',
  'לטרל': 'lateral',
  'לחיצת כתפיים': 'shoulder press',
  'כתפיים': 'shoulder press',
  'מתח': 'pulldown',
  'פולי': 'pulldown',
  'חתירה': 'row',
  'סקוואט': 'squat',
  'סקווט': 'squat',
  'שכיבת רגליים': 'leg curl',
  'יישור רגליים': 'leg extension',
  'פושדאון': 'pushdown',
  'יד אחורית': 'pushdown',
  'יד קדמית': 'curl',
  'בייספס': 'curl',
  'האמר': 'hammer curl',
  'בטן': 'knee raise'
};

// Pre-sort lexicon keys by length desc so multi-word phrases match before
// their constituent words ("לחיצת חזה" before "חזה").
const SORTED_KEYS = Object.keys(HEBREW_LEXICON).sort(
  (a, b) => b.length - a.length
);

/**
 * Translate any Hebrew tokens / phrases in `text` to their canonical English
 * equivalents. Numeric tokens, punctuation, and unknown words are left
 * untouched, which lets the existing English parser handle weight/reps and
 * fall back to "unknown" cleanly if the message is incoherent.
 */
export function translateHebrewToCanonical(text: string): string {
  let out = text;

  // Common Hebrew punctuation/decoration that the parser will choke on.
  out = out.replace(/[׳״]/g, '');

  // Multi-word & single-word substitutions, longest first.
  for (const key of SORTED_KEYS) {
    if (!out.includes(key)) continue;
    // Replace as a whole unit; word boundaries are unreliable for Hebrew so
    // we use a global string replace. Phrases are distinctive enough that
    // false positives are unlikely.
    out = out.split(key).join(HEBREW_LEXICON[key]);
  }

  // Collapse any double spaces introduced by replacements.
  return out.replace(/\s+/g, ' ').trim();
}
