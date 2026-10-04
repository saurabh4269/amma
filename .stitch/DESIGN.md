# Design System: AMMA Warm Cradle
**Project ID:** pending

## 1. Visual Theme & Atmosphere
AMMA is a weekly maternal check used on a shared family phone by a pregnant woman, a new mother, or the person helping her (family or a community health worker). Many users read slowly or not at all. The mood is warm, calm, and a little soft — a trusted aunt, not a hospital dashboard and not a toy. Generous whitespace, one job per screen, large tap targets, pictures beside words. Cute through roundness and warmth, never through clutter or baby-clipart that could hide a danger sign.

## 2. Color Palette & Roles
- Warm paper background (#F6EDE4) — the page, so the phone never feels clinical white.
- Cocoa ink (#3A2418) — all body text. High contrast on paper and on white cards.
- Clay primary (#C4513A) — the one main action on a screen (start the check, save, finish).
- Clay on-primary (#FFF8F3) — text on the primary button.
- Sage secondary (#2F6F56) — "no / all clear for this sign", safe confirmation.
- Honey tertiary (#E8A838) — "not sure", drafts, and gentle notes.
- Urgent rose (#9B2331) — danger outcome, delete, and "yes, this danger sign is present". Used rarely so it stays serious.
- White card (#FFFFFF) — every tappable card and spoken line.
- Muted cocoa (#7A6558) — helper text only, never the question itself.

## 3. Typography Rules
- Headlines: Plus Jakarta Sans, semibold, tight line height. Short. Never more than two lines.
- Body and questions: Noto Sans at a large size so Hindi and Marathi (Devanagari) stay clear. Questions are the biggest text on the check screen.
- Labels: Nunito Sans, medium, for small meta such as "last check" and distances.
- No text smaller than 14px. Questions at least 20px.

## 4. Component Stylings
* **Buttons:** Generously rounded (12px, primary actions fully pill-shaped). Minimum height 56px, full width on mobile. One filled primary button per screen. Secondary actions are white cards with a soft border. Ghost actions are text-only for Back and Skip.
* **Cards/Containers:** White, generously rounded, a whisper-soft warm shadow. Person cards are tall and show a phase (pregnant or baby born), a week if known, and a small lock if the record is private.
* **Inputs/Forms:** White fields, 2px warm border, large type, visible labels above the field. Never placeholder-only.
* **Spoken lines:** Left-aligned speech cards. The line being read aloud has a clay outline.
* **Answer row:** Three equal buttons — Yes (urgent rose outline), No (sage outline), Not sure (honey outline). Pictures sit above the word.
* **Picture tiles:** A two-column grid of large tiles, emoji or simple picture on top, short label under it.
* **Mic:** A single large circular clay button, thumb-reachable, labelled "Tap and speak".

## 5. Layout Principles
Mobile only, one column, max width about 28rem, padding 20px, safe-area aware. The primary action sits in the thumb zone at the bottom. No tab bar, no charts, no fake vitals. Language switch is always on the home header. Back is a text button at the top left, never a mystery icon alone.
