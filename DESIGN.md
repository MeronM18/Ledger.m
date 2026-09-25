---
name: Ledger.m
description: A dark, private ledger for one person's money, where every tone and typeface keeps one meaning on every page.
colors:
  onyx: "#0a0a0b"
  smoke: "#141416"
  charcoal: "#1c1c1f"
  slate-ash: "#2a2a2e"
  bone: "#edebe6"
  ash-grey: "#9a9690"
  champagne: "#c9bfa8"
  moss: "#8c9b7a"
  oxblood: "#9b5548"
  oxblood-text: "#c47a6b"
  cat-food: "#d6955e"
  cat-shopping: "#8fa6dc"
  cat-transport: "#6fb3a4"
  cat-travel: "#7fbcd6"
  cat-entertainment: "#ab93d6"
  cat-personal-care: "#d196bf"
  cat-medical: "#db8a8f"
  cat-services: "#93a1b3"
  cat-government: "#a7ab8c"
  cat-home: "#d2b36c"
  cat-home-improvement: "#b39a78"
  cat-income: "#9dbb7f"
typography:
  display:
    fontFamily: "Bodoni Moda, serif"
    fontSize: "2.5rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Bodoni Moda, serif"
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Bodoni Moda, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.333
  body:
    fontFamily: "Switzer, ui-sans-serif, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  caption:
    fontFamily: "Switzer, ui-sans-serif, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.333
  label:
    fontFamily: "Switzer, ui-sans-serif, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.45
  table-head:
    fontFamily: "Switzer, ui-sans-serif, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.08em"
  amount:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "\"tnum\" 1"
rounded:
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  "2xl": "24px"
components:
  card:
    backgroundColor: "{colors.smoke}"
    textColor: "{colors.bone}"
    rounded: "{rounded.xl}"
    padding: "16px 20px 20px"
  stat-tile:
    backgroundColor: "{colors.smoke}"
    textColor: "{colors.bone}"
    typography: "{typography.headline}"
    rounded: "{rounded.xl}"
    padding: "16px 20px 20px"
  pill-track:
    backgroundColor: "color-mix(in oklab, #edebe6 6%, transparent)"
    rounded: "{rounded.full}"
    width: "10px"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.champagne}"
    textColor: "{colors.onyx}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  segmented-option:
    backgroundColor: "transparent"
    textColor: "{colors.ash-grey}"
    typography: "{typography.caption}"
    padding: "4px 10px"
  segmented-option-on:
    backgroundColor: "color-mix(in oklab, #edebe6 12%, transparent)"
    textColor: "{colors.bone}"
  chip-spending:
    backgroundColor: "color-mix(in oklab, #edebe6 7%, transparent)"
    textColor: "color-mix(in oklab, #edebe6 80%, transparent)"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  chip-income:
    backgroundColor: "color-mix(in oklab, #8c9b7a 12%, transparent)"
    textColor: "{colors.moss}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  chip-moving:
    backgroundColor: "color-mix(in oklab, #edebe6 4%, transparent)"
    textColor: "{colors.ash-grey}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ash-grey}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 8px 8px 10px"
  nav-item-active:
    backgroundColor: "color-mix(in oklab, #c9bfa8 10%, transparent)"
    textColor: "{colors.champagne}"
  tooltip:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.bone}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
---

# Design System: Ledger.m

## Overview

**Creative North Star: "The Lamplit Ledger"**

Ledger.m is a private book kept at night: an onyx ground, smoke pages ruled with hairlines, bone ink, and one warm champagne light that marks what matters. It is dark only, with no light variant and no toggle. The world's signature is the thin champagne rule on onyx that opens the app and the login, and the same restraint carries into every page: surfaces stay flat, color is spent on meaning, and nothing moves unless it is settling into place.

Density is a working ledger's, not a dashboard's: enough on each screen and no more, figures first, context in a quiet line beneath them, detail one click away. Every tone and every typeface holds a single meaning across the whole app, so a green, a serif or a grey amount says the same thing on Overview, Budgets, Spending and Transactions. Accuracy is the aesthetic; decoration that doesn't carry a figure or a state is absent.

The Overview is the freshest expression of the world: four headline tiles, each a serif figure with a quiet chip and a strip of rounded pills; a wide chart beside two stacked cards; and a full-width transactions table, all in cards the owner can lift and reorder.

**Key Characteristics:**
- Dark only: onyx ground, smoke cards, charcoal overlays, 1px slate-ash hairlines.
- Tones with fixed meanings: moss for money in and on budget, champagne for spending and net worth lines and near-limit states, oxblood for being over.
- Three typefaces, three jobs: Bodoni Moda for titles and headline figures, IBM Plex Mono for amounts, Switzer for everything else.
- Category colors belong to their category and nothing else.
- Flat at rest; a card casts a shadow only while it is being carried.
- Rounded pills and full-round chips as the recurring data mark.

## Colors

A near-black neutral ramp with warm bone ink, one warm metallic light (champagne), a muted green and a muted red, and a muted category palette tuned to sit beside them.

### Primary
- **Champagne** (#c9bfa8): The one light in the room. Spending lines and bars, the net worth line, near-limit and ahead-of-pace states, links and in-text actions, the active navigation item, pending marks, focus rings, the caret and text selection. The primary button fills with it and sets onyx text on it.

### Secondary
- **Moss** (#8c9b7a): Money in and being on budget. Income figures and pills, "+" amounts on incoming transactions, refund and income chips, on-track budget bars, "under an even pace", and the even-pace line on the month chart.

### Tertiary
- **Oxblood** (#9b5548): Being over. Fills only: over-budget bars and pills, error and destructive tints, borders at low opacity.
- **Oxblood Text** (#c47a6b): The same hue lifted for legibility (about 5.5:1 on a card, where oxblood is 3.3:1). Every oxblood word or number uses this tone: "over your budget", over-budget amounts, errors. It also draws the Fees category.

### Neutral
- **Onyx** (#0a0a0b): The page ground, the sidebar, and the text on a champagne fill. The phone's browser bar matches it.
- **Smoke** (#141416): Every card and tile surface.
- **Charcoal** (#1c1c1f): Raised overlays (tooltips, popovers) and muted fills; at 30% it tints a table's header row and inner groupings inside a card.
- **Slate Ash** (#2a2a2e): The 1px hairline on every card, input and divider.
- **Bone** (#edebe6): Primary text and headline figures. At low opacity it forms the system's tints: 6% for empty pill tracks and hover washes, 7% for the spending chip, 12% for the selected segment, 20% for a hovered card's hairline, 60% for the small cents of a headline figure.
- **Ash Grey** (#9a9690): Secondary text: card titles, notes under figures, dates, account names, axis labels, quiet comparison chips, and every amount that only moves money between the owner's own accounts. Also draws the "Other" category.

### Category palette
Twelve muted hues, one per spending category, each drawn as an icon over an 18% tint of itself and as that category's slot in every chart (the `--viz-N` slots alias these): Food (#d6955e), Shopping (#8fa6dc), Transport (#6fb3a4), Travel (#7fbcd6), Entertainment (#ab93d6), Personal care (#d196bf), Medical (#db8a8f), Services (#93a1b3), Government (#a7ab8c), Home (#d2b36c), Home improvement (#b39a78), Income (#9dbb7f). Fees takes Oxblood Text, Other takes Ash Grey, and money movement takes Champagne for its icon.

### Named Rules
**The Fixed Meaning Rule.** A tone means the same thing on every page. Moss is money in or on budget; champagne is a spending line, the net worth line, or near the limit; oxblood is over. Bone is primary text, ash grey is secondary. A new surface borrows these meanings; it never assigns a tone a new one.

**The Comparison Is Not an Alarm Rule.** A month-over-month or 30-day change is shown as a quiet ash-grey chip with an arrow and a percentage, never in moss or oxblood. Pay varies; being over budget is the only thing that turns red.

**The Money Moving Is Grey Rule.** Card payments, transfers and loan payments between the owner's own accounts are neither spending nor income: their amounts are ash grey and their kind chip is a bone 4% wash with ash-grey text. Never green, never red.

**The Category Owns Its Color Rule.** A `--cat-*` or `--viz-*` color only ever means its category, in the same slot on the donut, trends, budgets, year in review and transaction icons. It is never a status, an accent or a decoration.

**The Legible Red Rule.** Oxblood (#9b5548) is for fills; any oxblood text uses Oxblood Text (#c47a6b).

## Typography

**Display Font:** Bodoni Moda (with serif fallback), weights 500, 600, 700
**Body Font:** Switzer (with ui-sans-serif, sans-serif), weights 400, 500, 600
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, monospace), weights 400, 500

**Character:** A high-contrast Didone for the few words and figures that head a page, set against a neutral, slightly technical grotesque that does all the work, with a plain monospace keeping every column of dollars aligned. The serif is ceremony; the sans is the ledger; the mono is the arithmetic.

### Hierarchy
- **Display** (Bodoni Moda 500, 2.5rem, line-height 1, -0.01em): The one headline reading on a chart card, such as the Overview's "$557 under an even pace", followed by a 1rem Switzer phrase in the state's tone.
- **Headline** (Bodoni Moda 500, 1.625rem on phones to 2rem, line-height 1, -0.01em): Headline figures on stat tiles; 1.75rem for a panel's lead figure. Whole dollars at full size, cents at 0.55em in bone at 60%.
- **Title** (Bodoni Moda 600, 1.5rem): Page titles ("Budgets", "Transactions") and the Overview greeting, with the date beneath in 14px ash-grey Switzer. The sidebar wordmark is Bodoni 600 with ".m" in champagne.
- **Body** (Switzer 400, 0.875rem, line-height 1.43): Row names, card titles (in ash grey), sentences and notes.
- **Caption** (Switzer 400, 0.75rem): The context line under a figure, secondary lines under a row name, segmented controls, "see all" links.
- **Label** (Switzer 400 to 500, 0.6875rem): Kind chips, pending marks, chart legends, axis ticks.
- **Table head** (Switzer 500, 0.6875rem, 0.08em tracking, uppercase): Column headers in a table only.
- **Amount** (IBM Plex Mono 400, 0.875rem, tabular numerals): Every amount in a row, table, tooltip, input or chip, and the spent figure under a chart headline.

### Named Rules
**The Three Voices Rule.** Bodoni Moda sets page titles and headline figures only. IBM Plex Mono with tabular numerals sets every amount that sits in a row, column, tooltip or field. Switzer sets everything else, including chips, labels, buttons and navigation.

**The Small Cents Rule.** A headline figure shows whole dollars at full size and its cents at 0.55em in bone at 60%, so the dollars read at a glance and the cents stay honest.

## Layout

Pages sit in a centered column up to 1280px wide with 16px of padding on phones and 24px from 768px up, beside a sticky sidebar rail on 768px and wider (a compact nav replaces it below). A page is a vertical stack with 24px between its title block and its content. A title block is the serif title and, where it applies, one ash-grey line beneath it.

Card pages use a grid of two columns up to 1280px and twelve columns from 1280px, with 12px gaps (16px from 640px) and dense packing so shorter cards fill beside a tall one. Spans are fixed by role: a quarter (three columns at 1280px, half a row below), a wide chart (eight columns, two rows tall), a side card (four columns, stacked beside the wide chart), a half and a full row. Quarter tiles pair two to a row even on a phone, where they swap in short labels and short notes so all four keep the same shape.

Inside a card, content stacks with 12px to 20px gaps (tiles 12px, panels 16px, the chart 20px). A table inside a card bleeds to the card's edges, with 20px of inset on its first and last columns. Columns that won't fit on a phone fold into one secondary line under the row name ("Card payment · Sep 12").

On touch screens every button, field and select is at least 40px tall and text fields use 16px text, so nothing is too small for a thumb and iOS never zooms.

## Elevation & Depth

The system is flat and tonal. Depth is a step in lightness, not a shadow: onyx ground, smoke cards, charcoal overlays, each edged with a 1px slate-ash hairline. A card that links somewhere answers hover by brightening its hairline to bone at 20%, not by rising. The single lifted state is a card being carried: it scales to 101.2%, takes a champagne ring at 35% and a long, soft shadow, while its empty place shows as a dashed champagne outline over a 4% champagne wash.

### Shadow Vocabulary
- **Carried** (`box-shadow: 0 22px 45px -18px rgb(0 0 0 / 0.75)`): Only on a card lifted by its grip in a reorderable grid.

### Named Rules
**The Lift Only When Carried Rule.** Surfaces are flat at rest and on hover. A shadow appears only on something the owner is physically moving.

## Shapes

Corners come from one 10px base: cards and tiles round at 14px, buttons and inputs at 10px, tooltips, segmented controls and navigation items at 8px (a segment inside at 5px). Anything that marks data or a label is fully round: pill strips, progress lines, category bars, kind chips and icon avatars. Month bars round at 6px. Borders are always 1px hairlines; a dashed hairline means "a place" (where a card will land, an empty slot to add something).

The recurring data mark is the pill strip: a row of rounded tracks at bone 6%, each no wider than 10px and 36px tall (44px from 640px), filled from the bottom in the tile's tone to its level. An empty track is something that hasn't happened yet.

## Components

### Buttons
Compact and quiet; the fill is reserved for the one action that matters.
- **Shape:** Gently rounded (10px), 32px tall (28px small, 24px extra-small), 10px side padding, Switzer 500 at 14px, icons at 16px.
- **Primary:** Champagne fill with onyx text; hover drops the fill to 80%.
- **Hover / Focus:** Presses down 1px when active. Focus shows the champagne border with a 3px champagne ring at 50%.
- **Outline / Ghost:** Outline carries the slate-ash hairline on a transparent ground; ghost has none. Both wash to charcoal on hover. A ghost button whose action is the page's positive path may take champagne text (Export on Transactions).
- **Link:** Champagne text, underline on hover, often with a trailing 12px arrow ("Set a monthly budget to see your pace").

### Chips
- **Style:** Fully round, 2px by 8px, Switzer 11px, a 1px inset ring. The background is the tone at 4% to 12%, the ring the tone at 10% to 25%, the text the tone itself.
- **Kinds:** Spending is a bone 7% wash with bone 80% text; income and refunds are moss 12% with moss text; card payments, transfers and loan payments are bone 4% with ash-grey text. Savings goals take champagne 10% with champagne text.
- **Change chips:** No fill. A 12px (14px from 640px) Switzer 500 tabular reading with a 14px arrow icon, ash grey for a comparison, oxblood text only for "Over".
- **Amount chips** (Budgets) keep IBM Plex Mono inside the round shape, moss or oxblood by the sign.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** Smoke, on the onyx ground.
- **Shadow Strategy:** None at rest (see Elevation & Depth).
- **Border:** 1px slate-ash hairline; bone at 20% on hover when the whole card is a link.
- **Internal Padding:** 20px sides, 16px top, 20px bottom (tiles on phones: 16px sides, 14px top, 16px bottom).
- **Header:** The card's title in 14px ash-grey Switzer on the left; on the right, a "see all" link in 12px ash grey that turns champagne on hover, then the grip.
- **Grip:** On pointer devices the grip is hidden until the card is hovered or the grip is focused; on touch it is always visible.
- **Inner grouping:** Hairline dividers between rows, or a charcoal 30% tint block with 10px corners; never another card.

### Inputs / Fields
- **Style:** 32px tall, transparent ground, 1px slate-ash hairline, 10px corners, 14px text (16px on touch). Money fields right-align IBM Plex Mono with a muted "$" inset and no spinner arrows.
- **Focus:** The hairline turns champagne with a 3px champagne ring at 50%; the caret is champagne.
- **Error / Disabled:** Invalid fields take the destructive border and a faint destructive ring; disabled fields drop to 50% opacity.

### Navigation
- **Sidebar rail:** Sticky, full height, on onyx, collapsible to icons (the name shows on hover when collapsed). Items are Switzer 500 at 14px with a 16px icon, ash grey, brightening to bone on a bone 6% wash on hover.
- **Active:** Champagne text on a champagne 10% wash, brightening to 15% on hover.
- **Mobile:** A compact nav replaces the rail below 768px.

### Stat Tile (signature)
The Overview's headline figure: an ash-grey title linked to its detail page (the whole tile is the link target), a Bodoni headline figure with small cents, an optional change chip beside it (under it on phones), one caption line of context, and a pill strip pinned to the bottom in the tile's tone. Minimum 160px tall (176px from 640px). Left to spend lights its pills for what's left, all of them in oxblood when over; spending, income and net worth draw their series in champagne, moss and champagne.

### Month Chart (signature)
A wide card led by a Display reading of the month against an even pace ("$557 under an even pace" in moss, "ahead of an even pace" in champagne, "over your budget" in oxblood text), the mono spent figure beneath, then a running total drawn as a champagne step line over a champagne gradient (32% to 0), a dashed moss even-pace line at 70%, last month as an ash-grey step line at 55%, a dotted bone budget line at 30%, and dashed hairline gridlines. A segmented control switches to month bars: champagne for this month, champagne at 38% for the rest. Hovering or arrowing reads out the day in a charcoal tooltip with swatch rows and mono amounts.

### Segmented Control
A hairline-bordered group with 8px corners and 2px inset; options are 12px Switzer, ash grey, washing to bone 6% on hover. The selected option is bone text on a bone 12% wash with a bone 10% inset ring.

### Tooltip
Charcoal, 1px hairline, 8px corners, 8px by 10px padding, 12px text, at least 190px wide. A bone first line names the point; each row is an ash-grey label with a short line swatch and a mono amount on the right.

### Reorderable Card Grid
Cards lift by their grip with a pointer, a finger or the keyboard (Space to lift, arrows to move, Space to drop, Escape to cancel), with every move announced. The rest of the grid reflows live around the carried card so the layout shown mid-drag is the one saved. Moves animate over 380ms and the drop over 260ms on a cubic-bezier(0.16, 1, 0.3, 1) settle curve.

## Do's and Don'ts

### Do:
- **Do** give every card the smoke surface, a 1px slate-ash hairline and 14px corners, and brighten the hairline to bone at 20% on hover when the whole card is a link.
- **Do** set every amount in a row, table, tooltip or field in IBM Plex Mono with tabular numerals.
- **Do** set page titles and headline figures in Bodoni Moda, with a headline figure's cents at 0.55em in bone at 60%.
- **Do** keep each tone's one meaning: moss for money in and on budget, champagne for spending lines, the net worth line and near-limit states, oxblood for being over.
- **Do** grey money that only moves between the owner's own accounts: ash-grey amounts and a bone 4% chip.
- **Do** draw a category only in its own `--cat-*` / `--viz-*` color, in the same slot everywhere.
- **Do** hide a card's grip until hover or focus on pointer devices, and always show it on touch.
- **Do** give buttons, fields and selects a 40px minimum and 16px field text on touch screens.
- **Do** keep keyboard focus visible: a 2px champagne outline with a 2px offset on links and buttons.
- **Do** honor reduced motion: page crossfades and entrances collapse to instant, and transitions lose their eased ramp.

### Don't:
- **Don't** place a card inside a card; group inside a card with hairline dividers or a charcoal 30% tint.
- **Don't** color a comparison chip moss or oxblood; a change against last month is quiet ash grey.
- **Don't** paint card payments, transfers or loan payments green or red.
- **Don't** use a category color as a status, an accent or decoration.
- **Don't** set Bodoni Moda on labels, chips, buttons, table text or body copy.
- **Don't** set oxblood (#9b5548) as text; use Oxblood Text (#c47a6b).
- **Don't** give a resting or hovered card a shadow; only a carried card lifts.
- **Don't** add a light theme or a light surface; Ledger.m is dark only.
