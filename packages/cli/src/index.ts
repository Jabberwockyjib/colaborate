import { Command } from "commander";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { syncCommand } from "./commands/sync.js";
import { uploadSourcemapsCommand } from "./commands/upload-sourcemaps.js";

const program = new Command()
  .name("colaborate")
  .description("CLI to configure @colaborate/* in your project")
  .version("0.4.3"); // x-release-please-version

program
  .command("init")
  .description("Set up the Prisma schema and API route in your project")
  .action(initCommand)
  .addHelpText("after", "\n  Examples:\n    $ colaborate init");

program
  .command("sync")
  .description("Sync the Prisma schema (non-interactive, CI-friendly)")
  .option("--schema <path>", "Path to the schema.prisma file")
  .action(syncCommand)
  .addHelpText("after", "\n  Examples:\n    $ colaborate sync\n    $ colaborate sync --schema prisma/schema.prisma");

program
  .command("status")
  .description("Full diagnostic of the Colaborate integration")
  .option("--schema <path>", "Path to the schema.prisma file")
  .action(statusCommand)
  .addHelpText(
    "after",
    "\n  Examples:\n    $ colaborate status\n    $ colaborate status --schema prisma/schema.prisma",
  );

program
  .command("doctor")
  .description("Test the connection to the Colaborate API")
  .option("--url <url>", "Server URL (default: http://localhost:3000)")
  .option("--endpoint <path>", "Endpoint path (default: /api/colaborate)")
  .action(doctorCommand)
  .addHelpText(
    "after",
    "\n  Examples:\n    $ colaborate doctor\n    $ colaborate doctor --url https://staging.example.com --endpoint /api/feedback",
  );

program
  .command("upload-sourcemaps")
  .description("Upload compiled .map files to the Colaborate backend for source resolution")
  .requiredOption("--project <name>", "Colaborate project name (scopes the upload)")
  .requiredOption("--env <env>", "Deployment env label (staging, production, preview, ...)")
  .requiredOption("--dir <dir>", "Directory to glob for .map files (walked recursively)")
  .requiredOption("--url <url>", "Colaborate backend base URL (e.g. https://colaborate.example.com)")
  .option("--api-key <key>", "Bearer API key (falls back to COLABORATE_API_KEY env)")
  .option("--endpoint <path>", "Endpoint path (default: /api/colaborate/sourcemaps)")
  .action(uploadSourcemapsCommand)
  .addHelpText(
    "after",
    "\n  Examples:\n    $ colaborate upload-sourcemaps --project parkland --env staging --dir .next --url https://app.example.com",
  );

program.parse();
