# DILAIT-007 — Normalize everyday UI localization

## Status
Ready for implementation

## Version target
DILAIT v0.1.1 — i18n cleanup before packaging

## Workstream
Frontend / Localization

## Recommended branch
feature/dilait-007-i18n-normalization

## Purpose
Before packaging DILAIT as a macOS app/DMG, normalize everyday UI localization so the main app supports RU / EN / KK consistently and no longer relies on scattered hardcoded strings.

## Scope

### In scope
- Add a central i18n dictionary for the everyday UI.
- Support:
  - Russian
  - English
  - Kazakh
- Replace hardcoded user-facing strings in `/` with translation keys.
- Keep selected language in localStorage.
- Ensure language switching updates the currently visible screen and nested content.
- Cover:
  - home
  - rooms
  - devices
  - groups
  - scenes
  - schedules
  - links
  - discovery
  - empty states
  - toasts
  - confirm dialogs
  - computed labels and summaries
- Keep `/advanced` English-only.
- Fix obviously awkward Russian translations while moving strings into the dictionary.

### Out of scope
- Do not redesign UI.
- Do not change BLE logic.
- Do not change scheduler behavior.
- Do not package DMG in this ticket.
- Do not add new product features.
- Do not localize `/advanced` into RU/KK.

## Technical requirements
- Introduce a single translation access function, for example `t(key, params)`.
- Avoid hardcoded visible strings inside render functions where practical.
- Support simple interpolation, for example:
  - `{count} devices`
  - `через {minutes} мин`
  - `{count} құрылғы`
- If pluralization is too heavy for this pass, use safe neutral wording instead of broken grammar.
- Missing keys should be visible during development, not silently empty.

## UI / UX requirements
- RU mode: no obvious English leftovers in `/`.
- EN mode: no Russian leftovers in `/`.
- KK mode: no RU/EN leftovers except accepted technical names if explicitly documented.
- Language buttons should remain compact and styled.
- `/advanced` stays English-only.

## Tests / checks
- `python -m pytest`
- Manual UI smoke:
  1. Open `/`.
  2. Switch RU / EN / KK.
  3. Visit each section.
  4. Confirm visible strings change consistently.
  5. Confirm `/advanced` remains English-only.

## Acceptance criteria
- [ ] Central i18n dictionary exists.
- [ ] RU / EN / KK are available.
- [ ] Main everyday UI uses translation keys instead of scattered hardcoded strings.
- [ ] No obvious mixed-language screens in `/`.
- [ ] `/advanced` remains English-only.
- [ ] Tests pass.
- [ ] No BLE/backend/product behavior changed.
- [ ] No packaging work done in this ticket.

## Implementation guard
Implement only localization normalization.
Do not redesign UI.
Do not change BLE drivers.
Do not package the app.
Do not add new features.
Keep `/advanced` English-only.