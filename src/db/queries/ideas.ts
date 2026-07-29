import { prisma } from '../client.js';
import type { IdeaRow } from '../../types.js';

export async function insertIdea(
  vectorStr: string,
  rawText: string,
  distilledText: string
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO my_ideas (vector, raw_text, distilled_text)
    VALUES (CAST(${vectorStr} AS vector), ${rawText}, ${distilledText})
  `;
}

export async function findSimilarIdeas(vectorStr: string, limit: number): Promise<IdeaRow[]> {
  return prisma.$queryRaw<IdeaRow[]>`
    SELECT id, raw_text, distilled_text, created_at
    FROM my_ideas
    ORDER BY vector <=> CAST(${vectorStr} AS vector)
    LIMIT ${limit}
  `;
}
