import chalk from "chalk";
import type { RuntimeEvent } from "little-durable";

const LABEL_WIDTH = 12;
export const OUTPUT_INDENT = " ".repeat(LABEL_WIDTH);

const tones = {
  sandbox: chalk.cyan,
  run: chalk.magenta,
  step: chalk.blueBright,
  command: chalk.dim,
  done: chalk.green,
  waiting: chalk.yellow,
  failed: chalk.red,
};

export function printTutorialHeader(options: {
  repository: string;
  runId: string;
}): void {
  console.log();
  console.log(chalk.bold("little-durable + Modal"));
  console.log(chalk.dim("Run a coding agent as a durable workflow"));
  console.log();
  printMetadata("Repository", sanitizeUrl(options.repository));
  printMetadata("Run ID", options.runId);
  console.log(chalk.dim(rule()));
}

export function printSection(title: string, description?: string): void {
  console.log();
  console.log(chalk.bold(title));
  if (description) console.log(chalk.dim(description));
  console.log(chalk.dim(rule()));
}

export function printSandboxStep(message: string, detail?: string): void {
  printTagged("sandbox", tones.sandbox, message, detail);
}

export function printSandboxDone(message: string, detail?: string): void {
  printTagged("done", tones.done, message, detail);
}

export function printCommand(command: string): void {
  const [firstLine, ...continuation] = wrapLine(`$ ${command}`);
  printTagged("command", tones.command, firstLine);
  for (const line of continuation) printDetail(line);
}

export function printProblem(
  message: string,
  error: unknown,
  recovery?: string,
): void {
  printTagged("failed", tones.failed, message, errorMessage(error));
  if (recovery) printDetail(recovery);
}

export function printUsage(options: {
  message: string;
  command: string;
}): void {
  console.error();
  console.error(chalk.red.bold(options.message));
  console.error(chalk.dim("Try:"));
  console.error(`  ${chalk.cyan(options.command)}`);
  console.error();
}

export function printWorkflowEvent(event: RuntimeEvent): void {
  switch (event.type) {
    case "runtime.started":
      printTagged(
        "run",
        tones.run,
        `Started ${chalk.bold(event.workflowName)}`,
        `Run ID: ${event.runId}`,
      );
      return;

    case "runtime.resumed":
      printTagged(
        "run",
        tones.waiting,
        `Resumed ${chalk.bold(event.workflowName)}`,
        `Run ID: ${event.runId} · completed steps will not run again`,
      );
      return;

    case "step.started":
      console.log();
      printTagged("step", tones.step, event.name);
      return;

    case "step.completed":
      printTagged(
        "done",
        tones.done,
        `${event.name} ${chalk.dim(`· ${formatDuration(event.durationMs)}`)}`,
      );
      return;

    case "step.failed":
      printTagged(
        "failed",
        tones.failed,
        `${event.name} ${chalk.dim(`· ${formatDuration(event.durationMs)}`)}`,
        event.error.message,
      );
      return;

    case "hook.requested":
      printTagged(
        "waiting",
        tones.waiting,
        `Requested ${event.name}`,
        formatValue(event.request),
      );
      return;

    case "hook.resolved":
      printTagged(
        "run",
        tones.run,
        `Resolved ${event.name}`,
        formatValue(event.resolution),
      );
      return;

    case "runtime.suspended":
      printTagged(
        "waiting",
        tones.waiting,
        "Workflow suspended",
        `Waiting for ${event.suspension.request.name}. The journal is saved and this run can resume.`,
      );
      return;

    case "runtime.failed":
      console.log();
      printTagged(
        "failed",
        tones.failed,
        `Workflow stopped after ${formatDuration(event.durationMs)}`,
        event.error.message,
      );
      printDetail(
        `Fix the error, then run the command again with RUN_ID=${event.runId} to continue from the failed step.`,
      );
      return;

    case "runtime.completed":
      console.log();
      printTagged(
        "done",
        tones.done,
        `Workflow completed in ${formatDuration(event.durationMs)}`,
        `Run ${event.runId} is fully complete.`,
      );
      return;
  }
}

export async function printWorkflowEvents(
  events: AsyncIterable<RuntimeEvent>,
): Promise<void> {
  for await (const event of events) {
    printWorkflowEvent(event);
    if (event.type === "runtime.failed") process.exitCode = 1;
  }
}

function printTagged(
  label: string,
  tone: (value: string) => string,
  message: string,
  detail?: string,
): void {
  const tag = `[${label}]`.padEnd(LABEL_WIDTH);
  console.log(`${tone(tag)}${message}`);
  if (detail) printDetail(detail);
}

function printMetadata(label: string, value: string): void {
  console.log(`${chalk.dim(label.padEnd(LABEL_WIDTH))}${value}`);
}

function printDetail(value: string): void {
  for (const line of value.split("\n")) {
    for (const wrappedLine of wrapLine(line)) {
      console.log(`${OUTPUT_INDENT}${chalk.dim(wrappedLine)}`);
    }
  }
}

function wrapLine(value: string): string[] {
  const width = Math.max(
    24,
    Math.min((process.stdout.columns ?? 72) - LABEL_WIDTH, 88),
  );
  if (value.length <= width) return [value];

  const lines: string[] = [];
  let pending = value;
  while (pending.length > width) {
    const boundary = pending.lastIndexOf(" ", width);
    const splitAt = boundary > 0 ? boundary : width;
    lines.push(pending.slice(0, splitAt));
    pending = pending.slice(splitAt).trimStart();
  }
  if (pending) lines.push(pending);
  return lines;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) {
    const precision = durationMs < 10_000 ? 1 : 0;
    return `${(durationMs / 1_000).toFixed(precision)} s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

function formatValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/\/[^@\s]+@/, "//***@");
  }
}

function rule(): string {
  const width = process.stdout.columns ?? 72;
  return "─".repeat(Math.max(32, Math.min(width, 72)));
}
