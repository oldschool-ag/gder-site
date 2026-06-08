# GDER UI/UX Direction — 2026-04-20

## 1. Objective
Create a new homepage direction for GDER.NET that reads as a public record system for governed digital entities, with clear counterparties-first framing, an explicit split between the research set and reviewed records, and a calmer evidence-led trust posture.

## 2. Assumptions
- Primary user: counterparties / relying parties
- Secondary users: entity representatives, researchers
- Surface type: homepage + public inspection layer
- Trust sensitivity: high
- Device bias: desktop-first inspection, responsive mobile access
- Primary CTA: `Request review`
- Secondary CTA: `Browse research set`
- Constraint: use only the approved source bundle and current implementation root

## 3. Three concise directions

### Direction A — Public Register Ledger
- Design intent: make GDER feel like a serious institutional register
- Dominant artifact: a structured ledger/table specimen
- Section rhythm: hero → ledger → boundary → CTA
- Typography posture: restrained, document-led, high-contrast
- Color posture: warm paper, dark ink, subtle green trust accents
- Refuses to do: lifestyle marketing, decorative crypto visuals, loud startup polish

### Direction B — Inspection Desk (recommended)
- Design intent: show the public inspection model directly on the homepage
- Dominant artifact: one inspection desk artifact showing research set, reviewed record, and portable extract together
- Section rhythm: hero artifact → model split → research ledger → verification chain → boundary → CTA
- Typography posture: large but restrained; document hierarchy over ad-style display
- Color posture: institutional neutrals, warm substrate, dark verification panel
- Refuses to do: equal-weight card stacks, web3 campaign aesthetics, vague trust claims

### Direction C — Evidence Rail
- Design intent: emphasize evidence resolution and review path as the core product truth
- Dominant artifact: a horizontal evidence-to-record resolution rail
- Section rhythm: trust statement → verification rail → reviewed specimen → research set → CTA
- Typography posture: denser and more technical
- Color posture: darker shell, more operational feel
- Refuses to do: airy SaaS landing-page tropes, promotional framing, abstract gradients as identity

## 4. Recommended direction
Use **Direction B — Inspection Desk**.

Why:
- It creates one dominant object instead of a stack of sections.
- It makes the research set vs reviewed record split visible immediately.
- It expresses GDER as a public inspection system, not a token directory.
- It lets the verification path appear as product truth rather than a secondary note.

## 5. Page hierarchy
1. Header with calm institutional navigation and `Request review`
2. Hero with one dominant inspection artifact
3. Research set vs reviewed record model section
4. Public research-set browsing ledger
5. Review and verification path
6. Boundary / trust section
7. CTA section for review requests
8. Footer

## 6. Section-by-section plan

### Header
- Keep brand left, navigation right
- Navigation should describe the model, not generic marketing topics
- CTA always visible

### Hero
- Use approved headline and core description
- Pair copy with one artifact that shows:
  - clearly labeled research set
  - reviewed record specimen
  - portable extract / verification state
- Add counterparties-first audience emphasis

### Model section
- Explicitly state that research is collected and records are reviewed
- Left lane: current public state
- Right lane: post-review target state
- Use real example entries from the research set on the left

### Research-set ledger
- Replace card-grid feel with row-based inspection layout
- Put wrapper, jurisdiction, and basis in visible columns
- Keep search and entity-type filter
- Preserve public-research labeling

### Verification section
- Show request → review → publish → verify
- Make the resolution chain concrete:
  - portable extract
  - reviewed record
  - source evidence

### Boundary section
- Say what GDER does and what it does not do
- Reinforce non-directory, non-ranking, non-sovereign-registry posture
- Re-state audience priority

### CTA section
- Keep it serious and evidence-led
- Frame the request as a review submission, not a listing application
- Surface minimum submission expectations

## 7. Hero artifact definition
A three-part inspection artifact:
- left: research set lane with real research entries
- center: reviewed record specimen with key fields
- right: portable extract / verification lane

This is the dominant object for the page.

## 8. Trust / proof artifact definition
Trust comes from product truth, not badges:
- explicit research vs reviewed separation
- visible wrapper / jurisdiction / governance / evidence fields
- verification resolution model
- strong boundary language
- non-promotional tone

## 9. Component rules
- Buttons: one primary (`Request review`), one secondary (`Browse research set`)
- Navigation: quiet, low-chrome, support-only
- Ledger rows: row-based with obvious columns, not equal-weight cards
- Pills: used only for categorical metadata, not decoration
- Panels: large, document-like containers with limited elevation
- Labels: uppercase small caps for system states and section roles

## 10. Visual token guidance
- Background: warm paper with minimal grid texture
- Main ink: near-black for document seriousness
- Accent: restrained green for trust / reviewed-state cues
- Blue allowed only for focus states, not as the main identity driver
- Radii: medium-large but not bubbly
- Shadows: subtle, sparse, structural only
- Motion: minimal hover lift, no theatrical transitions

## 11. Asset needs
- No new hero illustration required for v1 because the hero artifact is built in live HTML/CSS
- Existing lockup remains sufficient
- Future need: reviewed-record specimen imagery or actual portable-extract examples once product truth is available

## 12. Implementation notes
Implemented in:
- `index.html`
- `styles.css`
- `script.js`

Key implementation changes:
- replaced the previous card-heavy layout with one dominant inspection artifact
- converted the research browser from card grid toward ledger rows
- tightened navigation and CTA hierarchy
- made verification a first-class section
- strengthened boundary language visually and structurally

## 13. Cut list
Removed or reduced:
- generic card-stack feel
- decorative airy gradients as the main expression
- equal-weight section treatment
- startup-style marketing rhythm
- over-reliance on illustration-only proof

## 14. Acceptance checklist
- [x] Counterparties-first framing appears early
- [x] Research set and reviewed record are clearly separated
- [x] Main CTA is `Request review`
- [x] GDER reads as a public record system, not a crypto directory
- [x] Page has one dominant visual object
- [x] Verification path is visible and concrete
- [x] Boundary language rejects pay-to-rank and sovereign-registry claims
- [x] Research browsing remains available
- [x] Visual system is calmer, more institutional, and less generic
