# Jayds discrepancy implementation progress

Updated 16 October 2026, Philippine time. This is an implementation checklist, not a defense sign-off. Publication remains after the combined audit.

## Implemented in the current working branch

- Whole Milk defaults and menu/recipe corrections; shared Customer/POS selection rules; optional Standard/+1 Extra Shot; Admin default validation and preview; required-phone copy.
- Shared VAT-inclusive calculations in centavos, immutable order financial snapshots, append-only sale/refund records, transactional invoice numbers and linked credit notes.
- Owner-reported RDO confirmation recorded as the invoice authority basis. Invoice generation is enabled in configuration. Actual taxpayer details are held in an ignored local configuration file, not in source control. Hosted configuration has not yet been changed for this release.
- Admin finance overview, daily chart and matching table, expenses with evidence-reference and input-VAT checks, expense reversal history, individual 40% OSD estimates and incomplete-setup notices.
- Customer invoice view; issued invoice through the existing expiring POS receipt token; print layout and PDF verification added to the browser audit.
- Show/Hide controls and eye icons across Customer, POS and Admin password fields, plus Manager PIN entry. Passwords start masked, preserve their value on toggle, support keyboard use and mask on leaving the field.

## Still required before the complete plan can be called implemented

- Profile SC/PWD front/back private uploads, verification/review/revocation/expiry workflow, safe retention and cleanup, authenticated private viewing, material-name-change handling.
- Shared server quote endpoint, verified personal-portion selection in Customer/POS and checkout integration, no invalid statutory/promotion stacking, revalidation and reconciliation for concurrent or revoked claims. Calculation tests alone do not implement these workflows.
- Supporting document uploads for expenses; input VAT for stock purchases and full reconciliation review. The current expense form records a document reference and reviewed operating-expense input VAT only.
- Clearer forecast table and detail drawer, separate refresh and reviewed purchase-draft creation, server aggregation for the existing Analytics page, removal of its 200-order best-seller limit and Philippine dates/hour corrections.
- Customer carousel swipe/interruption and return-state improvements, keyboard-safe fixed actions, consistent 120/180/220 ms motion and reduced-motion behavior across affected flows.
- Full API/browser/permission/failure-path tests for those remaining workflows, phase audits and the combined audit tied to the final release commit.
- GitHub and Vercel publication, main as the current release, preserved previous version and hosted post-deployment checks.

## Operator/direct-check gates

The confirmed hours are 1 PM–10 PM. Physical stock counts, slot capacities and closure dates remain operator inputs. Official registration/serial claims are not invented; the supplied document crop and owner-reported RDO confirmation are distinguished from independently verified invoice authorization. Delivery tax treatment and annual owner tax inputs require operator/accountant configuration. The disconnected phone, actual installation/background push, physical webcam QR and complete provider payment/delivery outcomes still need direct checks. No receipt printer is required by the operator.

ZUS inspection remains stopped while the phone is disconnected. No new phone order or Maya gateway navigation is implied by these implementation tests.
