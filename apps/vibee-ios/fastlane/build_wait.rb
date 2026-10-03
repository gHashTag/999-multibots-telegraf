# Has Apple finished with an upload? Decided as plain data.
#
# `beta` uploads with skip_waiting_for_build_processing: processing takes
# minutes to an hour, and holding the build machine for it bought nothing.
# The cost was that nobody learned when the build reached the phone - the
# owner would open TestFlight to an empty list, or the loop would read
# `fastlane state` by hand every tick. Codemagic and Xcode Cloud both say
# "build ready" by themselves; the `processed` lane asks the same question
# and `tri iphone processed --wait N` waits for the answer. This module is
# what the lane decides, kept apart from Spaceship so the tests run without
# Apple.
module BuildWait
  # App Store Connect's processingState -> what it means for a tester.
  # An expired build is VALID to Apple and still uninstallable on the phone.
  def self.verdict(state, expired = false)
    case state.to_s
    when "VALID" then expired ? :expired : :ready
    when "INVALID", "FAILED" then :failed
    when "PROCESSING" then :processing
    else :unknown
    end
  end

  # builds: [{version:, app_version:, state:, expired:}], newest first.
  # want:   a build number, or nil/"" for the newest upload.
  def self.pick(builds, want = nil)
    return builds.first if want.to_s.strip.empty?
    builds.find { |b| b[:version].to_s == want.to_s.strip }
  end

  # Keep polling? A build still PROCESSING - and, when we know which number
  # went up, one App Store Connect does not list yet: an upload appears there
  # minutes after it, so right after the first upload "nothing uploaded" was
  # the answer and --wait gave up before Apple had looked.
  def self.keep_waiting?(verdict, want = nil)
    verdict == :processing || (verdict == :none && !want.to_s.strip.empty?)
  end

  # The build number `beta` last uploaded from this checkout (build/ is not
  # tracked), or nil. Without it "the newest build" right after an upload is
  # the PREVIOUS one - VALID, so it read as "your build is ready".
  def self.recorded(path)
    n = File.read(path).strip
    n.match?(/\A\d+\z/) ? n : nil
  rescue Errno::ENOENT
    nil
  end

  # The one line tri reads: "processed  <verdict>  <what>". The verdict word
  # comes first and alone, so the caller never parses Apple's states.
  def self.line(build, verdict, want = nil)
    if build.nil?
      return "processed  none  no build uploaded yet" if want.to_s.strip.empty?
      return "processed  none  build #{want.to_s.strip} is not among the recent uploads"
    end
    "processed  #{verdict}  build #{build[:version]} (#{build[:app_version]}) " \
      "#{build[:state]}#{build[:expired] ? ' expired' : ''}"
  end
end
