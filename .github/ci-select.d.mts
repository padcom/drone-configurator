// Types of ci-select.mjs for the unit test (apps/frontend/e2e/ci-select.test.ts), which `tsc -p e2e` checks.
export interface E2eMap {
  smoke: string[]
  smokeSitl: string
  entries: { when: string[], specs: string[] }[]
}
export interface BackendTree {
  tests: string[]
  imports: Record<string, string[]>
}
export interface Selection {
  full: boolean
  backend: string[] | 'all'
  e2e: string[] | 'all'
  sitl: boolean
  reasons: string[]
}
export const SHARED_BACKEND: string[]
export const SITL_USE: RegExp
export const FULL: string[]
export const UNIT_ONLY: string[]
export function globToRegExp(glob: string): RegExp
export function matchesAny(file: string, globs: string[]): boolean
export function importsOf(text: string): string[]
export function dependents(module: string, imports: Record<string, string[]>, shared: Set<string>): Set<string>
export function backendTestsFor(file: string, backend: BackendTree): string[] | null
export function specsFor(file: string, map: E2eMap, specs: string[]): string[] | null
export function unmappedSpecs(specs: string[], map: E2eMap): string[]
export function select(input: {
  files: string[], specs: string[], sitlSpecs: string[], backend: BackendTree, map: E2eMap, full?: boolean
}): Selection
export function summaryOf(result: Selection, totals: { specs: number, tests: number, files: number, shadow: boolean }): string
export function readTree(root: string): { specs: string[], sitlSpecs: string[], backend: BackendTree, map: E2eMap }
export function run(argv: string[], input: string): string
