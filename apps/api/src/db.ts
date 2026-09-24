import { createDb } from "@filing-desk/db";
import { getDatabaseUrl } from "./env";

export const db = createDb(getDatabaseUrl());
