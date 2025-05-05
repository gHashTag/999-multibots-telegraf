import { MyContext } from '@/interfaces'

export const determineVideoMode = (ctx: MyContext): 'standard' | 'morphing' => {
  const session = ctx.session
  if (session.is_morphing) {
    return 'morphing'
  }
  return 'standard'
}
