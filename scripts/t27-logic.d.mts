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
