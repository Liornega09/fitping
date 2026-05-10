export const EXERCISE_SEEDS = [
  {
    canonicalName: 'bench press',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'front delts'],
    aliases: ['bench']
  },
  {
    canonicalName: 'incline bench press',
    primaryMuscle: 'upper chest',
    secondaryMuscles: ['triceps', 'front delts'],
    aliases: ['incline bench', 'incline']
  },
  {
    canonicalName: 'dumbbell fly',
    primaryMuscle: 'chest',
    secondaryMuscles: ['front delts'],
    aliases: ['flys', 'flies', 'fly']
  },
  {
    canonicalName: 'lateral raise',
    primaryMuscle: 'lateral delts',
    secondaryMuscles: ['upper traps'],
    aliases: ['lateral raises', 'lateral', 'lat raise']
  },
  {
    canonicalName: 'shoulder press',
    primaryMuscle: 'delts',
    secondaryMuscles: ['triceps'],
    aliases: ['shoulder press', 'oh press']
  },
  {
    canonicalName: 'back extension',
    primaryMuscle: 'lower back',
    secondaryMuscles: ['glutes', 'hamstrings'],
    aliases: ['back extension']
  },
  {
    canonicalName: 'lat pulldown',
    primaryMuscle: 'lats',
    secondaryMuscles: ['biceps', 'upper back'],
    aliases: ['pulldown', 'lat pulldown']
  },
  {
    canonicalName: 'row',
    primaryMuscle: 'upper back',
    secondaryMuscles: ['lats', 'biceps', 'rear delts'],
    aliases: ['row', 'seated row']
  },
  {
    canonicalName: 'squat',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes', 'adductors'],
    aliases: ['squat']
  },
  {
    canonicalName: 'knee flexion (leg curl)',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['calves'],
    aliases: ['knee flexion', 'leg curl']
  },
  {
    canonicalName: 'knee extension (leg extension)',
    primaryMuscle: 'quads',
    secondaryMuscles: [],
    aliases: ['knee extension', 'leg extension']
  },
  {
    canonicalName: 'triceps pushdown',
    primaryMuscle: 'triceps',
    secondaryMuscles: [],
    aliases: ['pushdown', 'triceps pushdown']
  },
  {
    canonicalName: 'overhead triceps extension',
    primaryMuscle: 'triceps',
    secondaryMuscles: [],
    aliases: ['overhead triceps', 'oh triceps']
  },
  {
    canonicalName: 'biceps curl',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    aliases: ['biceps curl', 'curl']
  },
  {
    canonicalName: 'hammer curl',
    primaryMuscle: 'brachialis',
    secondaryMuscles: ['biceps', 'brachioradialis'],
    aliases: ['hammer curl']
  },
  {
    canonicalName: 'hanging leg/knee raise',
    primaryMuscle: 'abs',
    secondaryMuscles: ['hip flexors', 'obliques'],
    aliases: ['hanging leg raise', 'hanging knee raise', 'knee raise']
  }
] as const;

export function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}
