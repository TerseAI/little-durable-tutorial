import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Sandbox, SandboxExecParams } from "modal";

export async function runCommand(command: string): Promise<RunCommandResult> {
  const child = spawn(command, { shell: true });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    process.stderr.write(chunk);
  });

  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) {
    throw new Error(`Command failed (exit ${code}): ${command}\n${stderr}`);
  }
  return { stdout, stderr };
}

export function git(args: string): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return `git ${args}`;
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return `git -c http.https://github.com/.extraheader="AUTHORIZATION: basic ${basic}" ${args}`;
}

export async function copyToSandbox(
  sandbox: Sandbox,
  root: string,
  files: string[],
): Promise<void> {
  await Promise.all(
    files.map((file) =>
      sandbox.filesystem.copyFromLocal(join(root, file), join("/app", file)),
    ),
  );
}

export async function runSandboxCommand(
  sandbox: Sandbox,
  command: string[],
  params?: SandboxExecParams & { mode?: "text" },
): Promise<void> {
  const proc = await sandbox.exec(command, params);
  let stderr = "";
  const [code] = await Promise.all([
    proc.wait(),
    drain(proc.stdout, (chunk) => process.stdout.write(chunk)),
    drain(proc.stderr, (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    }),
  ]);
  if (code !== 0) {
    throw new Error(
      stderr || `Command failed (exit ${code}): ${command.join(" ")}`,
    );
  }
}

async function drain(
  stream: ReadableStream<string>,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) onChunk(value);
    }
  } finally {
    reader.releaseLock();
  }
}

type RunCommandResult = {
  stdout: string;
  stderr: string;
};
