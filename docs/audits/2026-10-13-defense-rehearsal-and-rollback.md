# Defense rehearsal and version recovery — 13 October 2026

The automated post-fix results are recorded in [the audit report](2026-10-13-post-fix-audit.md). The checks below still require the operator, defense hardware or merchant/provider workflow. Record PASS, FAIL or BLOCKED and a screenshot/reference for each; an isolated simulation does not complete a direct check.

## Direct defense checks

1. Confirm fresh counts and units for Bread Flour, Butter, Eggs, French Fries (frozen) and Frying Oil. Enter actual slot limits, operating weekdays and closures. Opening hours are confirmed as **1 pm–10 pm**. Complete Admin production verification before enabling scheduled pickup; never copy audit fixture counts into stock.
2. Install/open the Customer app on every intended phone. Sign in, background/resume, navigate back/forward, deny then grant location and notification permissions, edit the menu/bag offline and reconnect, and verify logout removes private drafts.
3. Register or update a designated customer with a valid phone. Confirm missing/malformed contacts cannot save; review a delivery order with the recipient's reachable phone and correct address. Confirm that the booked courier receives the intended contact in the approved sandbox workflow.
4. Display an account QR on the phone and scan it with the laptop webcam in Staff Register. Confirm the correct customer and points. Scan a ready order's private pickup QR, test manual entry, then close the scanner and verify the camera stops. Repeat with realistic glare, lighting and camera placement.
5. Complete guest/member pickup orders in the approved test or staging channel. Review explicitly, prepare/ready/collect the same order, and compare Customer tracking, POS tender/change, Admin history, stock and rewards. Check audible ready alerts and actual background phone push. No physical receipt printer is expected.
6. Complete Maya's human sandbox CAPTCHA using published sandbox data. Check success, decline, cancellation and expiry, hosted verification/callback, POS/Admin payment state and duplicate/late events. Exercise refund/void through the authorized merchant workflow and retain provider references; never use real payment data for these probes.
7. Exercise supported Lalamove sandbox rider/status and webhook scenarios. Compare the same booking in Customer, Staff and Admin; verify cancellation/recovery and duplicate-booking prevention. API quotation, booking, lookup and cancellation are covered by the automated probes.
8. Verify customer/staff verification and password-recovery messages in designated inboxes. Exercise expired links, successful reset, old-password rejection and unchanged role/approval boundaries.
9. Run a staging load/soak check and staging backup/restore verification, recording timing and outcomes. Scheduled push configuration and a completed worker HTTP 200 are already evidenced; device delivery still needs step 5.

Dedicated tax/VAT, profit after expenses/tax and business net worth are absent. Sales, stock value and product gross margins must not be presented as full accounting. Full build-tool advisories also remain documented in the audit.

## GitHub references

- Audited application source: `c70b2157d157c75a1075fb9e5e78f27a30035af0`.
- Latest audited source is published to `main` through [pull request #1](https://github.com/ExelecAKL/jayds-cafe/pull/1); repair branch `codex/defense-audit-2026-10-13` remains available.
- Old `main` is also preserved as [branch `codex/pre-defense-main-2026-10-13`](https://github.com/ExelecAKL/jayds-cafe/tree/codex/pre-defense-main-2026-10-13).
- Previous source: [tag `defense-pre-fixes-2026-10-13`](https://github.com/ExelecAKL/jayds-cafe/tree/defense-pre-fixes-2026-10-13), commit `b4d402f9c18b57b540f5245576c9b608460d3e4b`.
- [Compare the previous version with the fixes](https://github.com/ExelecAKL/jayds-cafe/compare/defense-pre-fixes-2026-10-13...codex/defense-audit-2026-10-13).

Use the tag to browse or check out the old source in a separate directory; do not overwrite unsaved work. For an application rollback, build/deploy the selected source through the existing Customer, POS and Admin Vercel configurations, then verify all three mounted entry points together. Keep the saved release deployment identifiers for comparison.

**Retain the protective forward database migrations during an application rollback.** Do not replay legacy schema, reset the hosted database, remove immutable legal acknowledgements or restore an old database over current café history. A source tag restores source code; it does not undo database or provider transactions. Reverting the application would also restore the earlier UI defects, so use it as a reference or controlled recovery step and re-audit the resulting release.
