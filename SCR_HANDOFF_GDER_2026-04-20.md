# GDER — SCR handoff notes
Date: 2026-04-20
Owner lane: Design → SCR
Scope: premium polish pass, mobile/responsive QA pass, implementation handoff

## Ship verdict
**Conditional ship from code review.**
The page is now materially stronger, less generic, and more structurally legible than the prior implementation. The main remaining requirement before publish is a real-device/browser pass by SCR because this environment could not produce a rendered browser screenshot for final visual confirmation.

## Findings first — ordered by severity

### 1. Major — mobile research ledger lost context when desktop columns collapsed
- **Reference:** `#records` → `.entity-row` / research ledger
- **Problem:** On smaller widths, the desktop ledger header disappeared but wrapper/jurisdiction/basis values remained as unlabeled stacked text. This weakened inspection clarity and made the mobile version feel like raw data rather than a designed public record surface.
- **Fix applied:**
  - added mobile-visible field labels: `Wrapper`, `Jurisdiction`, `Basis`
  - added mobile spacing + separators for stacked ledger fields
  - preserved cleaner desktop ledger appearance by hiding field labels above the mobile breakpoint
- **Files:** `script.js`, `styles.css`

### 2. Major — headline typography was slightly too compressed for tablet/mobile wraps
- **Reference:** hero headline, section heads, panel headings, process headings
- **Problem:** The global heading line-height was too uniformly tight. This risked hard wraps and a slightly cramped premium feel, especially as panels stacked.
- **Fix applied:**
  - differentiated line-height by heading type
  - added `text-wrap: balance` on major headings
  - added font smoothing / legibility settings
  - added `text-wrap: pretty` for longer text blocks
- **Files:** `styles.css`

### 3. Major — page rhythm was too even and still slightly “assembled” instead of paced
- **Reference:** section-to-section spacing, hero support note, mobile vertical rhythm
- **Problem:** The overall structure was good, but spacing rhythm was still too uniform, making the page feel flatter than the new direction deserved.
- **Fix applied:**
  - introduced section spacing tokens
  - tightened mobile section spacing
  - gave the hero support note a divider and more deliberate separation from CTA/actions
  - tightened hero spacing on mobile so the first screen holds together better
- **Files:** `styles.css`

### 4. Minor — artifact header transition became visually weak when stacked
- **Reference:** hero artifact header (`Public site` → `After structured review`)
- **Problem:** Once the artifact header shifted to a vertical stack, the old short divider was too weak to carry the transition cleanly.
- **Fix applied:**
  - made the divider full-width when the artifact header stacks
- **Files:** `styles.css`

### 5. Minor — small-width utility rows risked awkward wrapping
- **Reference:** stats band, browser results, search/filter controls
- **Problem:** Stats and browser-result text could feel cramped when space tightened.
- **Fix applied:**
  - normalized stats-band width at smaller breakpoints
  - allowed browser-results text to wrap
- **Files:** `styles.css`

## What changed in implementation

### HTML/CSS posture
- kept the new inspection-desk direction intact
- tightened typography and paragraph handling for a calmer institutional feel
- improved page pacing and mobile density
- preserved the hard split between research set and reviewed record

### Research ledger behavior
- desktop remains ledger-like
- mobile now retains semantic labels for key fields
- the ledger no longer depends on the desktop header row for comprehension

### Responsive behavior improved at
- `<= 1100px`
- `<= 820px`

## Files touched in this pass
- `index.html` (previous direction already implemented; no structural change required in this polish pass)
- `styles.css`
- `script.js`

## Guardrails for SCR
Do not regress these:
- keep `Request review` as the primary CTA
- keep `Browse research set` secondary
- keep counterparties-first framing visible on the first screen
- keep research set and reviewed record explicitly separated
- do not convert the research ledger back into equal-weight marketing cards
- do not introduce generic crypto / web3 campaign styling
- do not soften the boundary language into promotional startup copy

## Manual QA checklist for SCR
Run this in real browsers/devices before publish:

### Desktop
- confirm hero artifact reads as one dominant object, not three disconnected cards
- confirm section headings wrap cleanly at common widths
- confirm stats band stays visually aligned with the ledger intro
- confirm ledger rows scan left-to-right in one pass

### Tablet
- confirm artifact header divider works after stacking
- confirm the research ledger still feels ordered, not card-like
- confirm search + filter controls keep enough width and spacing

### Mobile
- confirm field labels (`Wrapper`, `Jurisdiction`, `Basis`) appear in each research row
- confirm CTA buttons stack cleanly and keep obvious priority
- confirm hero headline wraps without collisions or orphaned short lines
- confirm section spacing remains calm and not overlong
- confirm the artifact panels stack in a clear order: research → reviewed record → extract

### Interaction / accessibility
- tab through nav, hero CTAs, preview rows, and ledger rows
- confirm visible focus states remain intact
- confirm search input and filter select are comfortably tappable
- confirm contrast still feels strong on warm-paper backgrounds

## Remaining known limitation
**UNCERTAIN:** final rendered visual QA was done from code inspection and responsive-rule review, not screenshot-based confirmation, because the local headless browser in this environment is missing a required system library. SCR should treat real-device/browser inspection as required before final ship.
