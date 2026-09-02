# Timed captions contract

## Purpose

The editor must render the words that were actually spoken, at the time they
were actually spoken. Script suggestions and social captions are not timing
sources.

## Wire contract

- `captions` remains the backwards-compatible list of social/overlay copy
  returned by script generation.
- `timed_captions` is optional and may be returned only with generated media.
- Every timed item has `text`, `startMs`, `endMs`, `timestampMs`, and
  `confidence`.
- Times are finite, non-negative, monotonic, and `endMs > startMs`.
- The initial TTS implementation derives word ranges from ElevenLabs' actual
  character alignment returned with the same audio bytes. It never estimates
  time from word count or requested duration.
- A provider fallback that does not return alignment must omit
  `timed_captions`. The UI must keep the media usable without inventing
  subtitles.

## Editor handoff

- Generated results may persist validated `timedCaptions` metadata alongside
  the asset URL.
- AI assembly imports captions only for audio placements that it actually adds
  to the timeline and offsets each caption by the placement start.
- Existing editor captions are never overwritten. A non-empty caption track is
  left unchanged so assembly remains non-destructive.
- Validation happens before atom mutation. Malformed timing leaves the editor
  unchanged.

## Security and ownership

Timing metadata travels in the authenticated audio-generation response and in
the owner-scoped project document. No client-supplied Telegram/user id is part
of the contract. No additional generation, publishing, or charge is triggered
by assembly.
