---
description: 
globs: 
alwaysApply: false
---
# Menu Translation Logic

## Retrieval Process (`getTranslation`)

1.  The `getTranslation` function ([src/core/supabase/getTranslation.ts](mdc:src/core/supabase/getTranslation.ts)) is used to fetch text, URLs, and buttons from the `translations` table in Supabase.
2.  It first attempts to find a translation matching the specific `key`, `language_code`, and `bot_name`.
3.  **Fallback Logic:** If no translation is found for the specific `bot_name`, `getTranslation` will **automatically attempt** to find a translation for the **default bot** (`DEFAULT_BOT_NAME`). This can lead to unexpected text if the specific bot's translation is missing. The function returns the default bot's translation if found, otherwise empty strings/arrays.
4.  The function returns an object `{ translation: string, url: string, buttons: TranslationButton[] }`. An empty string for `translation` indicates it wasn't found (neither specific nor default).

## `menuScene` Handling ([src/scenes/menuScene/index.ts](mdc:src/scenes/menuScene/index.ts))

1.  The scene determines the `translationKey` based on the user's subscription (`'menu'` for full access, `'digitalAvatar'` otherwise).
2.  It calls `getTranslation` with this key and the current bot's name.
3.  If `translation` returned from `getTranslation` is empty or invalid (doesn't pass `translation && typeof translation === 'string' && translation.trim() !== ''`), a hardcoded fallback message is used (defined within `menuScene`).
4.  **Formatting:**
    *   For the specific key `'menu'`, the message (whether from DB or fallback) has `\n` replaced with `
` and is sent **without** `parse_mode` to ensure correct newline rendering.
    *   For other keys fetched from the DB, the message is sent with `parse_mode: 'MarkdownV2'`. Fallback messages are sent without `parse_mode`.

**Key Takeaway:** If a bot shows the wrong menu text, first check the `translations` table for an entry matching the *specific* bot's name and `key='menu'`. If missing, add it. Also, ensure the text in the DB uses `
` for intended newlines.
