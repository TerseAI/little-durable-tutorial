import chalk from "chalk";
import type { Sandbox, SandboxExecParams } from "modal";
import { spawn } from "node:child_process";
import { join } from "node:path";

export async function runCommand(command: string): Promise<RunCommandResult> {
  console.log(chalk.dim(`$ ${redact(command)}`));
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
    throw new Error(
      `Command failed (exit ${code}): ${redact(command)}\n${stderr}`,
    );
  }
  return { stdout, stderr };
}

function redact(command: string): string {
  return command.replace(/basic [\w+/=]+/gi, "basic ***");
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
  options?: SandboxExecParams & { mode?: "text"; prefix?: string },
): Promise<void> {
  const { prefix, ...params } = options ?? {};
  const proc = await sandbox.exec(command, params);
  const out = prefixWriter(process.stdout, prefix);
  const err = prefixWriter(process.stderr, prefix);
  let stderr = "";
  const [code] = await Promise.all([
    proc.wait(),
    drain(proc.stdout, out.write).finally(out.flush),
    drain(proc.stderr, (chunk) => {
      stderr += chunk;
      err.write(chunk);
    }).finally(err.flush),
  ]);
  if (code !== 0) {
    throw new Error(
      stderr || `Command failed (exit ${code}): ${command.join(" ")}`,
    );
  }
}

// Tags each line of sandbox output so it is obvious what modal printed and
// what came from the workflow running inside the sandbox.
function prefixWriter(target: NodeJS.WriteStream, prefix?: string) {
  if (!prefix) {
    return { write: (chunk: string) => void target.write(chunk), flush: () => {} };
  }
  let pending = "";
  return {
    write: (chunk: string) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) target.write(`${prefix}${line}\n`);
    },
    flush: () => {
      if (pending) target.write(`${prefix}${pending}\n`);
      pending = "";
    },
  };
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
