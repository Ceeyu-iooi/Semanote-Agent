/** Shared Node-only process and file helpers for this checkout's maintenance tools. */
import { spawn } from "node:child_process";
import { access, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve, isAbsolute, delimiter } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const runtimeRoot = resolve(projectRoot, "profile/runtime");
export const toolRoot = resolve(projectRoot, "profile/tools");
export const delay = (milliseconds) =>
  new Promise((done) => setTimeout(done, milliseconds));
export async function readJson(path, fallback) {
  try {
    return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error.code === "ENOENT" && arguments.length > 1) return fallback;
    throw error;
  }
}
export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(temporary, path);
}
export async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

/** Command arguments are separate; .cmd launch is limited to known npm/Maven build commands. */
export function run(command, args = [], options = {}) {
  const {
    check = true,
    input,
    cwd = projectRoot,
    env = process.env,
    echo = false,
  } = options;
  const isBatch = process.platform === "win32" && command.endsWith(".cmd");
  if (
    isBatch &&
    [command, ...args].some((value) => /[\r\n&|<>^%"]/.test(value))
  )
    throw new Error("Unsupported build command argument");
  if (isBatch && !isAbsolute(command)) {
    const pathValue =
      Object.entries(env).find(
        ([name]) => name.toLowerCase() === "path",
      )?.[1] || "";
    const found = pathValue
      .split(delimiter)
      .map((directory) => resolve(directory, command))
      .find((path) => existsSync(path));
    if (!found) throw new Error("Build command is not installed: " + command);
    command = found;
  }
  return new Promise((done, fail) => {
    const executable = isBatch ? process.env.ComSpec || "cmd.exe" : command;
    const launchArgs = isBatch
      ? [
          "/d",
          "/s",
          "/c",
          `"${[command, ...args].map((value) => `"${value}"`).join(" ")}"`,
        ]
      : args;
    const child = spawn(executable, launchArgs, {
      cwd,
      env,
      windowsHide: true,
      windowsVerbatimArguments: isBatch,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [],
      stderr = [];
    let size = 0;
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 128 * 1024 * 1024) {
        child.kill();
        fail(new Error("Tool output limit exceeded"));
        return;
      }
      stdout.push(chunk);
      if (echo) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      size += chunk.length;
      if (size > 128 * 1024 * 1024) {
        child.kill();
        fail(new Error("Tool output limit exceeded"));
        return;
      }
      stderr.push(chunk);
      if (echo) process.stderr.write(chunk);
    });
    child.on("error", fail);
    child.on("close", (code) => {
      const result = {
        code,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      };
      if (check && code !== 0)
        fail(
          Object.assign(
            new Error(
              `Tool failed: ${command.split(/[\\/]/).at(-1)} (${code})`,
            ),
            { result },
          ),
        );
      else done(result);
    });
    child.stdin.end(input);
  });
}

export async function powershell(script, options = {}) {
  return run(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); ${script}`,
    ],
    options,
  );
}

export async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
