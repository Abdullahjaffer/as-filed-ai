import { messages, traces } from "@filing-desk/db";
import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import {
  compareFacts,
  diffSections,
  getFacts,
  readSection,
  resolveCompany,
  searchFilings,
  toolSchemas,
} from "./tools";

const SYSTEM = `You are Filing Desk, an SEC filing research assistant.
Rules:
- Every number must come from getFacts (XBRL) or appear inside a quoted passage from searchFilings / readSection.
- Cite form, filing date, accession number, and filingUrl when available.
- If the local filings do not support the answer, say the filing does not state it.
- Prefer getFacts for revenue, income, EPS, and similar metrics.
- Use compareFacts for peer metrics and diffSections for year-over-year narrative changes.
- Do not invent figures.`;

export async function chatHandler(req: Request, res: Response): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    return;
  }

  const body = req.body as {
    conversationId?: string;
    messages?: UIMessage[];
  };
  const conversationId = body.conversationId ?? randomUUID();
  const uiMessages = body.messages ?? [];

  let stepIndex = 0;

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM,
    messages: await convertToModelMessages(uiMessages),
    stopWhen: stepCountIs(8),
    tools: {
      resolveCompany: tool({
        description: "Resolve a ticker or company name to CIK and ticker",
        inputSchema: toolSchemas.resolveCompany,
        execute: async (input) => {
          const output = await resolveCompany(input);
          await db.insert(traces).values({
            conversationId,
            stepIndex: stepIndex++,
            toolName: "resolveCompany",
            input,
            output,
          });
          return output;
        },
      }),
      getFacts: tool({
        description: "Read consolidated us-gaap XBRL facts for a ticker",
        inputSchema: toolSchemas.getFacts,
        execute: async (input) => {
          const output = await getFacts(input);
          await db.insert(traces).values({
            conversationId,
            stepIndex: stepIndex++,
            toolName: "getFacts",
            input,
            output,
          });
          return output;
        },
      }),
      searchFilings: tool({
        description:
          "Hybrid search over filing chunks (vector + keywords) for a ticker",
        inputSchema: toolSchemas.searchFilings,
        execute: async (input) => {
          const output = await searchFilings(input);
          await db.insert(traces).values({
            conversationId,
            stepIndex: stepIndex++,
            toolName: "searchFilings",
            input,
            output,
          });
          return output;
        },
      }),
      readSection: tool({
        description: "Read a full section item (e.g. 1A Risk Factors, 7 MD&A)",
        inputSchema: toolSchemas.readSection,
        execute: async (input) => {
          const output = await readSection(input);
          await db.insert(traces).values({
            conversationId,
            stepIndex: stepIndex++,
            toolName: "readSection",
            input,
            output,
          });
          return output;
        },
      }),
      compareFacts: tool({
        description: "Compare one XBRL concept across up to four tickers",
        inputSchema: toolSchemas.compareFacts,
        execute: async (input) => {
          const output = await compareFacts(input);
          await db.insert(traces).values({
            conversationId,
            stepIndex: stepIndex++,
            toolName: "compareFacts",
            input,
            output,
          });
          return output;
        },
      }),
      diffSections: tool({
        description:
          "Diff one section item between two accessions; returns added/removed quotes",
        inputSchema: toolSchemas.diffSections,
        execute: async (input) => {
          const output = await diffSections(input);
          await db.insert(traces).values({
            conversationId,
            stepIndex: stepIndex++,
            toolName: "diffSections",
            input,
            output,
          });
          return output;
        },
      }),
    },
  });

  const lastUser = uiMessages.filter((m) => m.role === "user").at(-1);
  if (lastUser) {
    await db.insert(messages).values({
      conversationId,
      role: "user",
      parts: lastUser.parts ?? [{ type: "text", text: "" }],
    });
  }

  await result.pipeUIMessageStreamToResponse(res, {
    originalMessages: uiMessages,
    headers: {
      "X-Conversation-Id": conversationId,
    },
    onFinish: async ({ responseMessage }) => {
      await db.insert(messages).values({
        conversationId,
        role: "assistant",
        parts: responseMessage.parts ?? [],
      });
    },
  });
}
