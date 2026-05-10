import { PrismaClient } from '@prisma/client';
import { EXERCISE_SEEDS } from '../src/domain/catalog.js';

const prisma = new PrismaClient();

async function main() {
  for (const exercise of EXERCISE_SEEDS) {
    await prisma.exercise.upsert({
      where: { canonicalName: exercise.canonicalName },
      update: {
        primaryMuscle: exercise.primaryMuscle,
        secondaryMuscles: exercise.secondaryMuscles,
        aliases: exercise.aliases,
        isActive: true
      },
      create: {
        canonicalName: exercise.canonicalName,
        primaryMuscle: exercise.primaryMuscle,
        secondaryMuscles: exercise.secondaryMuscles,
        aliases: exercise.aliases,
        isActive: true
      }
    });
  }

  console.log(`Seeded ${EXERCISE_SEEDS.length} exercises.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
