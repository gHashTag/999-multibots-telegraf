import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { showClubCard } from '@/navigation/helpers/clubCard'

/**
 * THE SUBSCRIPTION SCENE IS THE CLUB CARD.
 *
 * Owner, 2026-09-22: the one subscription is the club -- 10 000 Stars every
 * 30 days, thirty percent back in tokens -- and BASIC / PRO / STUDIO and the
 * NEURO* tiers do not exist. This scene listed those tiers, with rouble prices,
 * and wrote the sale into payments_v2 (the archive nobody may write to any
 * more). It was the door behind "💫 Оформить подписку" after the free portrait,
 * on the old main keyboard, on the digital-avatar screen, in the paywall links
 * from the Mini App and in a dozen older paths that enter
 * `ModeEnum.SubscriptionScene`.
 *
 * The id stays, so every one of those paths still arrives somewhere; what it
 * shows is the club card, and the scene leaves at once -- the card's buttons
 * are handled at bot level (clubCard.ts), not by a step of this scene.
 */
export const subscriptionScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.SubscriptionScene,
  async ctx => {
    await ctx.scene.leave()
    await showClubCard(ctx, 'button')
  }
)
