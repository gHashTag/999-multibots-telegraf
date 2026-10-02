# The internal TestFlight group, decided as plain data.
#
# An upload alone is invisible on the phone: internal testers see a build only
# through an internal group, and a first app has none. The step used to be a
# line telling the owner to open App Store Connect and click twice more. The
# API key can do it (Spaceship's create_beta_group and POST /v1/betaTesters),
# so the `testers` lane does - and this module is what it decides, kept apart
# from Spaceship so the tests run without Apple.
#
# Who goes in: the account holder, nobody else. Every person added gets an
# invitation e-mail from Apple, and the team behind this key has other admins,
# a developer and finance (measured 2026-10-03: four users) - inviting them is
# the owner's call, not a loop's. They are counted, not added.
module TeamGroup
  NAME  = "Trinity S³AI team".freeze
  ROLES = %w[ACCOUNT_HOLDER].freeze

  # The group new builds reach by themselves: internal, with access to all
  # builds. Ours by name first, then any the owner made by hand - a second
  # group beside theirs would be a duplicate, not a fix. nil = create ours.
  def self.target(groups)
    usable = groups.select { |g| g[:internal] && g[:all_builds] }
    usable.find { |g| g[:name] == NAME } || usable.first
  end

  # groups:  [{id:, name:, internal:, all_builds:}]
  # users:   [{email:, first:, last:, roles: [...]}]   App Store Connect users
  # testers: [email]                                    already in the target
  # => {create: bool, target: group or nil, add: [user], left: Integer,
  #     notes: [String]}   left = team members not in ROLES, never added
  def self.plan(groups:, users:, testers:)
    target = target(groups)
    notes = groups
      .select { |g| g[:internal] && !g[:all_builds] }
      .map { |g| "internal group \"#{g[:name]}\" does not get new builds by itself (left as it is)" }
    have = testers.map { |e| e.to_s.downcase }
    chosen = users.select { |u| (Array(u[:roles]) & ROLES).any? && !u[:email].to_s.strip.empty? }
    add = chosen
      .uniq { |u| u[:email].downcase }
      .reject { |u| have.include?(u[:email].downcase) }
    { create: target.nil?, target: target, add: add, left: users.size - chosen.size, notes: notes }
  end

  # Logs are read by loops and pasted into chats: an address is shown as its
  # first letter and its domain, enough to recognise, not to harvest.
  def self.mask(email)
    local, domain = email.to_s.split("@", 2)
    return "?" if local.to_s.empty? || domain.to_s.empty?
    "#{local[0]}***@#{domain}"
  end

  # Apple's error text is not ours to trust: an error about a tester may
  # repeat the address. Every address in it is masked before the log sees it.
  def self.scrub(text)
    text.to_s.gsub(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+\.[A-Za-z]{2,}/) { |m| mask(m) }
  end
end
