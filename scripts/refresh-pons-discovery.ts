import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { refreshPonsMarketDiscovery } = await import("../lib/pons/discovery-refresh");
  process.stdout.write(`${JSON.stringify(await refreshPonsMarketDiscovery(), null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
