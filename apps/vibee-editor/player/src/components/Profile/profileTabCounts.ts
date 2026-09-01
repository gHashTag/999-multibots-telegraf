type CountedProfile = Partial<{
  templates_count: number
  followers_count: number
  following_count: number
  plan_count: number
  files_count: number
  skills_count: number
}>

export type CountedProfileTab =
  | 'templates'
  | 'plan'
  | 'files'
  | 'skills'
  | 'blog'
  | 'followers'
  | 'following'

const countFields: Partial<Record<CountedProfileTab, keyof CountedProfile>> = {
  templates: 'templates_count',
  plan: 'plan_count',
  files: 'files_count',
  skills: 'skills_count',
  followers: 'followers_count',
  following: 'following_count',
}

export function profileTabCount(
  profile: CountedProfile,
  tab: CountedProfileTab
): number | null {
  const field = countFields[tab]
  if (!field) return null
  const value = profile[field]
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null
}
