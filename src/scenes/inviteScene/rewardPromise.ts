/**
 * The text of the referral promise -- a pure function, on purpose.
 *
 * WHY IT LIVES APART FROM THE SCENE. The property worth guarding is "nothing
 * is promised that is not switched on", and it used to be guarded by reading
 * the scene's SOURCE and matching `bonus > 0 ?` with a regular expression.
 * That test breaks when prettier moves a line break and passes when the code
 * is rewritten into something wrong but similar-looking; it broke on the very
 * change that added the second side. A function that takes the two amounts and
 * returns the text can be checked for what it actually produces.
 *
 * THE TWO SIDES FIRE AT DIFFERENT MOMENTS, and the wording says so. The
 * inviter is paid when the friend REGISTERS (createUserScene); the invited
 * person is paid on their FIRST TOP-UP (rewardOnFirstTopUp) -- registering is
 * free to fake, so paying for that alone would fund fake accounts.
 *
 * The text is what a live person reads in Telegram, so it stays bilingual
 * Russian/English.
 */
export function buildRewardPromise(params: {
  isRu: boolean
  inviterStars: number
  invitedStars: number
}): string {
  const { isRu, inviterStars, invitedStars } = params
  const lines: string[] = []

  if (inviterStars > 0) {
    lines.push(
      isRu
        ? `🎁 За каждого друга, который запустит бота по вашей ссылке, вы получаете ${inviterStars} звёзд.`
        : `🎁 For every friend who starts the bot via your link you get ${inviterStars} stars.`
    )
  }

  if (invitedStars > 0) {
    lines.push(
      isRu
        ? `🎁 А друг получит ${invitedStars} звёзд при первом пополнении.`
        : `🎁 And your friend gets ${invitedStars} stars on their first top-up.`
    )
  }

  // Assembled from the list rather than by gluing strings together: with two
  // independent switches, a hard-coded "\n\n" in front of the second line
  // leaves a stray blank line whenever only the second one is on.
  return lines.length ? `\n\n${lines.join('\n')}` : ''
}
