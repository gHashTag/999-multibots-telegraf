// Types for scripts/t27-logic.mjs, so a TypeScript test can import it.
/** The fns of `t27c gen` Zig: name, params [[name, type]], return type. */
export function zigFns(
  zigSrc: string
): Array<{ name: string; params: string[][]; ret: string }>
/** The TypeScript door of one lowered fn. */
export function door(f: {
  name: string
  params: string[][]
  ret: string
}): string
/** The Zig export that forwards to one lowered fn (a str as ptr, len). */
export function zigExport(f: {
  name: string
  params: string[][]
  ret: string
}): string
/** A spec `str`, as `t27c gen` writes it in Zig. */
export const STR: string
