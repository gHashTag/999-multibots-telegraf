# The App Store page, checked offline before anyone sends it.
#
# The texts live in fastlane/metadata/<locale>/*.txt - deliver's own layout,
# so `fastlane metadata` uploads exactly the files a reviewer of this
# repository read. App Store Connect enforces the limits below only on
# upload, one field at a time, after the request; `preflight` names every
# overrun at once instead.
#
# Plain Ruby, no fastlane: scripts/tri-iphone-store.test.ts runs it with
# `ruby` directly, so the limits are tested where they are defined.
module StoreMetadata
  # Characters, as App Store Connect counts them (Apple's "App information"
  # and "Platform version information" reference). The name is absent on
  # purpose: it is chosen when the app record is created, and a name.txt here
  # would overwrite that choice on every upload. release_notes ("What's New")
  # is checked when present; a first version has none.
  LIMITS = {
    "subtitle" => 30,
    "keywords" => 100,
    "promotional_text" => 170,
    "description" => 4000,
    "release_notes" => 4000
  }.freeze

  # Without these a version cannot be submitted; with an empty one deliver
  # uploads an empty field and App Store Connect keeps the old text silently.
  REQUIRED = %w[description keywords support_url privacy_url].freeze

  URLS = %w[support_url privacy_url marketing_url].freeze

  LOCALES = %w[en-US ru].freeze

  def self.read(dir, locale, field)
    path = File.join(dir, locale, "#{field}.txt")
    File.exist?(path) ? File.read(path, encoding: "UTF-8").strip : nil
  end

  # Every problem in every locale, as sentences. Empty means ready.
  def self.problems(dir)
    out = []
    LOCALES.each do |locale|
      unless Dir.exist?(File.join(dir, locale))
        out << "#{locale}: no metadata folder #{File.join(dir, locale)}"
        next
      end
      REQUIRED.each do |field|
        text = read(dir, locale, field)
        out << "#{locale}/#{field}.txt is missing or empty" if text.nil? || text.empty?
      end
      LIMITS.each do |field, limit|
        text = read(dir, locale, field)
        next if text.nil?
        out << "#{locale}/#{field}.txt is #{text.length} characters; the limit is #{limit}" if text.length > limit
      end
      URLS.each do |field|
        text = read(dir, locale, field)
        next if text.nil? || text.empty?
        out << "#{locale}/#{field}.txt is not an https URL: #{text}" unless text.match?(%r{\Ahttps://\S+\z})
      end
      keywords = read(dir, locale, "keywords")
      if keywords && keywords.include?(", ")
        # Spaces after commas count against the 100 characters and buy nothing.
        out << "#{locale}/keywords.txt has spaces after commas; they count against the limit"
      end
      # The subtitle is already searched; a keyword made only of its words
      # spends the 100 characters on nothing (CapCut, Captions and HeyGen
      # keep the two disjoint for the same reason).
      subtitle = read(dir, locale, "subtitle")
      if keywords && subtitle
        said = subtitle.downcase.scan(/[[:alnum:]]+/)
        keywords.split(",").map(&:strip).reject(&:empty?).each do |k|
          words = k.downcase.scan(/[[:alnum:]]+/)
          next if words.empty? || !(words - said).empty?
          out << "#{locale}/keywords.txt repeats the subtitle: #{k}"
        end
      end
    end
    out
  end
end
