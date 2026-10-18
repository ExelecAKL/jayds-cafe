# Motorcycle delivery recovery — 18 October 2026

The previous sandbox credential pair authenticated and returned PHP Motorcycle quotes, but a simulated booking failed with HTTP 402, `ERR_INSUFFICIENT_CREDIT`. The owner supplied a replacement sandbox pair. It was saved in private local configuration and encrypted Vercel environment settings; Maya remains sandbox. No credentials or private backups are published.

The replacement pair returned a Motorcycle quotation and accepted one simulated booking (HTTP 201). That booking was immediately cancelled (HTTP 204). No café orders, payment records, physical stock, production bookings or wallet funds were changed by this check.

Both customer and dispatch quotations now require the returned vehicle to be `MOTORCYCLE`. A different or missing vehicle prevents token issuance or rider booking. Dispatch uses the accepted quotation ID, so it inherits that vehicle. The POS delivery dialog identifies Motorcycle and retains explicit staff confirmation before booking.

Provider responses are mapped to safe, useful messages. Insufficient sandbox test credit and production wallet funds have different messages; raw provider bodies are never shown. Definitive booking failures record their safe reason and can be retried after correction. Network errors, timeouts, rate limits and ambiguous responses retain reconciliation requirements to prevent duplicate riders.

| Check | Result |
| --- | --- |
| Supplied sandbox configuration read back from Vercel; Maya unchanged | PASS |
| Provider PH cities and Motorcycle support | PASS |
| Provider Motorcycle quote, simulated booking, immediate cancellation | PASS |
| Ten focused regression checks: vehicle enforcement, credit errors, privacy, permissions, duplicate prevention, changed fees, uncertain responses | PASS |
| Workspace type checks | PASS |
| Full backend suite, lint and hosted release verification | Recorded in release evidence |
| Physical rider dispatch, delivery completion and production wallet charging | NOT TESTED |

Private diagnostic files are kept under ignored `.codex-logs/`. The first parallel backend/lint run exhausted the local process memory limit; the full suite was rerun sequentially. The rollback tag and final implementation/deployment identifiers are recorded in the release evidence. Reverting application code does not restore prior provider credentials; their private backup is separate.

Provider contract: [Lalamove API reference](https://developers.lalamove.com/#place-order), including insufficient-credit responses and vehicle inheritance from quotations.
