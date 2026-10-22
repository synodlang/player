// Minimal Node typings. The project has exactly four dev dependencies, so
// @types/node is not installed; this declares the few Node APIs scripts and
// tests use. Extend it when a script needs more.

declare module "node:test" {
  type Fn = () => void | Promise<void>;
  interface Ctx {
    test(name: string, fn: Fn): Promise<void>;
  }
  export function test(name: string, fn: (t: Ctx) => void | Promise<void>): Promise<void>;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: Fn): void;
  export function before(fn: Fn): void;
  export function after(fn: Fn): void;
}

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(fn: () => unknown, expected?: unknown, message?: string): void;
    match(value: string, re: RegExp, message?: string): void;
    fail(message?: string): never;
  }
  const assert: Assert;
  export default assert;
}

declare module "node:fs" {
  export function readFileSync(path: string): Uint8Array & { toString(enc?: string): string };
  export function readFileSync(path: string, enc: "utf8"): string;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
  export function readdirSync(path: string): string[];
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function rmSync(path: string, opts?: { force?: boolean }): void;
  export function existsSync(path: string): boolean;
}

declare module "node:path" {
  export function join(...p: string[]): string;
  export function resolve(...p: string[]): string;
  export function basename(p: string, ext?: string): string;
  export function dirname(p: string): string;
}

declare module "node:*";

declare const process: {
  argv: string[];
  exit(code?: number): never;
  env: Record<string, string | undefined>;
  stdout: { write(s: string): void };
  stderr: { write(s: string): void };
  memoryUsage(): { heapUsed: number };
};

interface ImportMeta {
  dirname: string;
  filename: string;
}

interface ImportMeta {
  main: boolean;
}
