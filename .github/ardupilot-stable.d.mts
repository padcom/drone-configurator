// The types of .github/ardupilot-stable.mjs, for its test (apps/frontend/e2e/ardupilot-stable.test.ts).

/** A stable release tag's family and version; null for anything else. */
export function releaseOf(tag: string): { family: string, version: number[] } | null

/** Below 0 when `a` is older, above 0 when it is newer, 0 when they are the same. */
export function compareVersions(a: number[], b: number[]): number

/** The newest stable release of a family among some tags, or null. */
export function newestStable(tags: string[], family: string): string | null

/** The pin, the newest stable of its family (the pin itself when it is not a release), and whether that is newer. */
export function nextStable(pinned: string, tags: string[]): { pinned: string, ref: string, newer: boolean }
