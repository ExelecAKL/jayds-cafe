# Jayds vector artwork

All SVG files use real vector paths and transparent backgrounds. The full signature, stacked wordmark and full mascot preserve the approved original artwork. The horizontal lettering repairs the originally joined S/E into complete contours. The small symbol simplifies the coffee-sipping mascot with a tilted handled mug and holding hand.

| Asset                  | Use                                                    |
| ---------------------- | ------------------------------------------------------ |
| `jayds-full.svg`       | Welcome and startup artwork at larger sizes            |
| `jayds-wordmark.svg`   | Narrow spaces that suit the original stacked lettering |
| `jayds-horizontal.svg` | Compact one-line name                                  |
| `jayds-lockup.svg`     | Small mascot plus horizontal name                      |
| `jayds-mascot.svg`     | Original full-body mascot illustration                 |
| `jayds-symbol.svg`     | Small mascot head for navigation and app icons         |
| `jayds-pin.svg`        | Branded map destination marker                         |
| `icon-*.svg`           | Rounded 32-unit functional icon family                 |

Each brand variant has an ink version for light surfaces and a `-cream.svg` version for dark surfaces. Functional icons inherit `currentColor` when used inline through `BrandIcon` from `@cafeos/shared/brand`. Keep natural proportions; do not stretch or clip the artwork. The sheet `jayds-brand-sheet.png` is a visual overview, not a source asset.

Run `node scripts/prepare-brand-assets.mjs` from the workspace root to regenerate the files, intrinsic dimensions, public copies and platform PNG icons. The generator runs automatically before development and builds in all three apps. Source icon paths live in `packages/shared/src/brand/shapes.json`; the unchanged full signature is `assets/jayds-logo-transparent.svg`.
