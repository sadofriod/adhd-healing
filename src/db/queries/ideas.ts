import { getPool } from '../client.js';
import type { IdeaRow } from '../../types.js';

export async function insertIdea(
  vectorStr: string,
  rawText: string,
  distilledText: string
): Promise<void> {
  await getPool().query(
    `INSERT INTO my_ideas (vector, raw_text, distilled_text) VALUES ($1, $2, $3)`,
    [vectorStr, rawText, distilledText]
  );
}

export async function findSimilarIdeas(vectorStr: string, limit: number): Promise<IdeaRow[]> {
  const result = await getPool().query<IdeaRow>(
    `SELECT id, raw_text, distilled_text, created_at
     FROM my_ideas ORDER BY vector <=> $1 LIMIT $2`,
    [vectorStr, limit]
  );
  return result.rows;
}
