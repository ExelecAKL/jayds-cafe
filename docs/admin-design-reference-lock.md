# Jayds Admin design reference and verification

## Direction locked by the owner

The owner approved the October 18 dashboard and asked to extend that language to all of Admin while preserving existing features and workflows. The primary source is that approved Jayds interface: warm cream canvas, espresso navigation, Founders Grotesk typography, caramel actions, fine borders, and restrained motion. This is an extension of an existing product design system.

The owner's semantic-color reference is authoritative for status: red means danger/error; amber means caution; green means success; blue means information; neutral gray means inactive/secondary. Color always accompanies a label or icon. Brand caramel is reserved for navigation emphasis and affirmative actions.

## Supporting research

- Installed UX/UI kit: `output/AGENTS.md`, `output/taste/design-taste.md`, tokens and component guidance.
- Refero skill craft references: `references/color.md`, `references/craft-details.md`, and `references/visual-workflow.md`. These support restrained brand accents, distinct semantic status roles, visible keyboard focus, form recovery, and screenshot comparison against the existing approved product.
- Live Refero style searches were attempted on October 18 for warm hospitality/editorial, restrained Attio SaaS, and restaurant management directions. All returned `NO_SUBSCRIPTION`. No live Refero screen or style is claimed as evidence. The approved Jayds dashboard and the user's semantic-color image remain the visual sources.
- Existing operational constraints in `docs/admin-improvements-design-decisions.md`: retain menu, category, order, recipe, reporting, stock, purchasing, and authorization flows. Data details belong behind deliberate disclosures when appropriate.

## Decision ledger

| Decision | Source and bounded role | Reason |
| --- | --- | --- |
| Preserve cream/espresso/caramel and existing local typeface | Approved dashboard; owns canvas, type and brand actions | Keep the owner's identity across pages |
| Distinct red, amber, green, blue and gray | Owner's semantic-color reference; status and feedback only | Meaning remains recognizable in either theme |
| Shared headers, toolbars, tables and neutral surfaces | Approved dashboard and installed component guidance | Make all workspaces feel like one product |
| Themed listbox controls with keyboard parity | Installed kit's native-select rule and focus guidance | Preserve filter and form value behavior with consistent appearance |
| Keep confirmations and canceled drafts | Existing operational workflows | Visual improvements must not weaken safeguards or discard work |
| Retain all tables and recent-order pagination | Existing regression tests | Preserve established navigation and record access |
| Retain charts with accessible tables | Existing reporting implementation | Visuals supplement inspectable values |
| Code-native icons and existing brand artwork | Existing product assets | Operational UI does not require generated bitmap media |

## Verification scope

Use `npm run check:dashboard`, `npm run check:admin-ui`, and `npm run check:admin-pagination` against the built local Admin app. The browser suites intercept authentication, database and provider traffic with isolated fixtures. They do not write to live business records. The visual sweep measures all 17 Admin routes at desktop/mobile widths and both themes; recorded results are under `.codex-logs/admin-ui/`. Passing automated gates measures objective accessibility and layout properties, not aesthetic quality or every possible workflow.
