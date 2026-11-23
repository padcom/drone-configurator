// Types of shard.mjs for its unit test (apps/frontend/e2e/shard.test.ts), which `tsc -p e2e` checks.
export function split(files: string[], times: Record<string, number>, fallback: number, count: number): string[][]
export function shardOf(options: { root: string, kind: 'backend' | 'e2e' | 'sitl', shard: number, of: number, only?: string }): string[]
