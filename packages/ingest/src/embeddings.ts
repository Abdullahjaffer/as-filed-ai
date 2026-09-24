import OpenAI from "openai";

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
