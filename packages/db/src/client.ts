import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Opens a Drizzle client for the Filing Desk Postgres database. */
/** Open a Drizzle client. The caller owns the URL, usually `DATABASE_URL`. */
export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  return drizzle(client, { schema });
}
