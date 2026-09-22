/*
 * THE APP IN THE GAME'S FRAME WEARS THE GAME'S CLOTHES.
 *
 * Owner, 2026-09-22, looking at the PROFILE screen of the board at
 * app.t27.ai/queen/: "make the profile in the site's style". The board frames
 * the real app pages (lib/embed.ts, trinity QueenTri), and they arrived in the
 * app's own dress -- grey rounded cards, an orange accent, system fonts --
 * between the board's black HUD panels, thin green lines and mono caps.
 *
 * The dress is chosen once, at boot, as an attribute on <html>:
 * `data-shell="board"`. Every rule of styles/board-shell.css is scoped under
 * it (boardShellScope.test.ts holds that), so the app outside the frame --
 * a browser tab, the Telegram Mini App -- keeps its own look untouched.
 */

export const BOARD_SHELL = 'board'

export type Shell = typeof BOARD_SHELL | null

/**
 * The shell for this document: the board's inside the game's frame. In a
 * development build `?shell=board` shows it without a frame, which is how the
 * look is checked locally; a production build ignores the address.
 */
export function shellOf(isEmbed: boolean, search: string, dev: boolean): Shell {
  if (isEmbed) return BOARD_SHELL
  if (dev && new URLSearchParams(search).get('shell') === BOARD_SHELL) {
    return BOARD_SHELL
  }
  return null
}

/** Put the shell on <html>, where the stylesheet looks for it. */
export function applyShell(root: HTMLElement, shell: Shell): void {
  if (shell) root.dataset.shell = shell
  else delete root.dataset.shell
}
