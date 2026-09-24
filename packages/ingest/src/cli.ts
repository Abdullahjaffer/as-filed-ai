import { ingestTickers, resolveTickers } from "./pipeline.ts";

async function main(): Promise<void> {
  const tickers = resolveTickers(process.argv.slice(2));
  console.log(`Ingesting: ${tickers.join(", ")}`);
  await ingestTickers(tickers);
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
