import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { gzipSync } from "node:zlib";
import { hashSourcemapContent } from "@colaborate/adapter-prisma";
import fg from "fast-glob";
import { p } from "../prompts.js";

export interface RunUploadSourcemapsOptions {
  project: string;
  env: string;
  dir: string;
  url: string;
  apiKey?: string | undefined;
  /** Path under the server root for the upload endpoint. Defaults to "/api/colaborate/sourcemaps". */
  endpoint?: string;
}

/**
 * Pure callable for unit testing. `uploadSourcemapsCommand` below is the
 * commander-facing wrapper that adds Clack prompts + process.exit on failure.
 */
export async function runUploadSourcemaps(options: RunUploadSourcemapsOptions): Promise<void> {
  const { project, env, dir, url, apiKey } = options;
  const endpoint = options.endpoint ?? "/api/colaborate/sourcemaps";

  const matches = await fg("**/*.map", { cwd: dir, absolute: true, onlyFiles: true });
  if (matches.length === 0) {
    throw new Error(`No .map files found under ${dir}`);
  }

  for (const mapPath of matches) {
    const content = await readFile(mapPath, "utf8");
    const hash = hashSourcemapContent(content);
    const filename = basename(mapPath);
    const body = JSON.stringify({ projectName: project, env, hash, filename, content });
    const gzipped = gzipSync(Buffer.from(body, "utf8"));

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "content-encoding": "gzip",
    };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    const response = await fetch(new URL(endpoint, url).toString(), {
      method: "POST",
      headers,
      body: gzipped,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Upload of ${filename} failed with ${response.status}: ${text.slice(0, 200)}`);
    }
  }
}

/** Commander action wrapper. */
export async function uploadSourcemapsCommand(options: {
  project?: string;
  env?: string;
  dir?: string;
  url?: string;
  apiKey?: string;
  endpoint?: string;
}): Promise<void> {
  p.intro("colaborate — upload sourcemaps");

  if (!options.project || !options.env || !options.dir || !options.url) {
    p.log.error("--project, --env, --dir, and --url are all required");
    process.exit(1);
  }

  const apiKey = options.apiKey ?? process.env.COLABORATE_API_KEY ?? undefined;

  const spinner = p.spinner();
  spinner.start(`Uploading .map files from ${options.dir}`);
  try {
    await runUploadSourcemaps({
      project: options.project,
      env: options.env,
      dir: options.dir,
      url: options.url,
      apiKey,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    });
    spinner.stop("Upload complete");
    p.outro("Done");
  } catch (error) {
    spinner.stop("Upload failed");
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
