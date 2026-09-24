import OpenAI from "openai";

/** OpenAI text-embedding-3-small. Matches chunks.embedding vector(1536). */
export const EMBEDDING_DIMENSIONS = 1536;

/** Passage embeddings for stored filing chunks. */
export async function embedTexts(
  apiKey: string,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  const client = new OpenAI({ apiKey });
  const embeddings: number[][] = [];
  const batchSize = 64;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });
    const ordered = response.data.sort((a, b) => a.index - b.index);
    for (const row of ordered) {
      embeddings.push(row.embedding);
    }
  }
  return embeddings;
}
