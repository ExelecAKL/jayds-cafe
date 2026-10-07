# Pickup and delivery correction · 7 October 2026

Direct fix to the existing Jayds Cashier system, using Refero's direct-build workflow. References: the user's ORD-0055 Cashier card, its customer Delivery order timeline, and the pickup dialog; the approved Jayds brand lock; Refero's bundled form/focus guidance. Keep the established espresso/cream tokens, card density, rounded controls and 48 px actions.

Cash correction: the user's “Mobile app · Cash · paid” screenshot and explicit distinction from POS Register define the handover flow. Mobile ASAP cash remains unpaid through acceptance, preparation and ready status. Its ready QR opens cash tender; “Receive cash & confirm pickup” records both together. The badge says “Pay at pickup”. Register sales retain immediate cash payment; delivery and scheduled pickup retain Maya prepayment. No historical financial records are rewritten.

| Decision                                                            | Source                                        | Reason                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| Show Pickup / Delivery / Dine-in / Takeout on every card and detail | User's delivery timeline and ambiguous card   | Staff can identify fulfillment before acting.                                          |
| Ready delivery opens a rider booking/status dialog                  | Customer timeline: Ready for rider, Delivered | Delivery completes through confirmed courier events, not customer pickup QR.           |
| Scan pickup opens the camera on the first click                     | Explicit user request                         | Remove the redundant code-entry step before scanning.                                  |
| Enter code instead is an explicit fallback inside scanning          | Existing code entry + Refero form guidance    | Camera denial, no device and insecure LAN HTTP remain recoverable.                     |
| Separate camera requirement, permission and missing-device messages | Browser getUserMedia documentation            | Explain the actual cause and avoid pretending the webcam can run on insecure LAN HTTP. |

Validate separate ready pickup/delivery cards, direct camera startup on localhost, blocked camera on LAN HTTP, manual entry and retry, camera shutdown, provider dispatch/reuse/status, SQL pickup/collection guards, courier completion and unchanged pickup/counter behavior. Provider mutations stay isolated during browser QA; preserve ORD-0055 and all live financial records.

## Verification

The two fulfillment badges and distinct Ready actions are visible in the rendered Cashier desktop and phone screens. Rider booking/status and tracking were exercised in isolated browser fixtures. The fake webcam opened directly, closed its media tracks, and recovered to manual entry after denied permission. The guest fixture required QR collection. The connected database guard rollouts preserved all checked business records and function grants. The complete 4000/4001/4002 rehearsal passed 105 backend tests, 51 HTTP checks and all browser journeys; focused visual browser checks, builds, typecheck and lint passed.

The subsequent cash-at-pickup correction passed 106 backend tests, 51 HTTP checks and Cashier/Admin browser verification, including unpaid preparation and atomic guest cash handover. The connected database rollout preserved 14 business tables; native QR/cash/stock/loyalty checks rolled back their test rows. Customer visual verification checks the unpaid ready QR and suppresses the duplicate ready notice on its own order page. See the dedicated cash-at-pickup verification report for final browser/build evidence.
