# What a TestFlight tester reads under "What to Test".
#
# The notes used to be the last commit of the whole repository. In this
# monorepo that is rarely about the app: on 2026-10-03 the first upload would
# have told the owner "docs(skills): a stamped picture is a draft" - a CRM
# change - plus the squash separator and the Co-authored-by trailer, because
# a squash merge's body carries every commit of the pull request.
#
# So the notes are the SUBJECTS of the recent commits that touched
# apps/vibee-ios, newest first, one per line. Merge commits say nothing a
# tester can check, and are dropped.
#
# Plain Ruby, no fastlane: scripts/tri-iphone-store.test.ts runs it with
# `ruby` directly.
module TestNotes
  # App Store Connect's limit for "What to Test".
  LIMIT = 4000
  # Enough to cover the builds between two uploads; more is a wall of text.
  COUNT = 12

  def self.from_subjects(subjects)
    lines = subjects.map { |s| s.to_s.strip }
                    .reject { |s| s.empty? || s.start_with?("Merge ") }
                    .uniq
                    .first(COUNT)
    notes = []
    lines.each do |s|
      line = "- #{s}"
      break if (notes + [line]).join("\n").length > LIMIT
      notes << line
    end
    notes.join("\n")
  end

  # Any text cut to LIMIT characters (not bytes: Cyrillic counts once).
  def self.cap(text)
    text.to_s[0, LIMIT]
  end

  # The notes for the app in ios_dir; "" when there is no git history (an
  # exported tree, a check-runner without .git) - the caller supplies a
  # fallback instead of dying after a full archive.
  def self.collect(ios_dir)
    out = IO.popen(
      ["git", "-C", ios_dir, "log", "--no-merges", "-n", (COUNT * 3).to_s, "--format=%s", "--", "."],
      err: File::NULL, &:read
    )
    return "" unless $?.success?
    from_subjects(out.to_s.dup.force_encoding("UTF-8").split("\n"))
  rescue SystemCallError
    ""
  end
end
