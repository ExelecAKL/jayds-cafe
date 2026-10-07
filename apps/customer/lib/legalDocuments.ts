import { LEGAL_VERSION, PRIVACY_CONTACT } from "./legal";
import {
  termsSections as oldTerms,
  privacySections as oldPrivacy,
} from "./legal-archive";

export interface LegalSection {
  id: string;
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  table?: { headings: readonly string[]; rows: readonly (readonly string[])[] };
}
export interface LegalDocument {
  kind: "terms" | "privacy";
  title: string;
  version: string;
  effectiveDate: string;
  introduction: string;
  sections: readonly LegalSection[];
  references: readonly { title: string; href: string }[];
}

export const termsDocument: LegalDocument = {
  kind: "terms",
  title: "Terms and Conditions",
  version: LEGAL_VERSION,
  effectiveDate: "7 October 2026",
  introduction:
    "These Terms and Conditions govern access to the Jayds Café ordering application, including its installed progressive web app, and purchases made through it. Please read them before creating an account or placing an order. The Privacy Policy and Notice explains personal-data processing separately.",
  sections: [
    {
      id: "scope",
      title: "Operator, scope and interpretation",
      paragraphs: [
        "In these Terms, ‘Jayds’, ‘we’, ‘us’ and ‘our’ refer to Jayds Café, the café operator offering the products identified in the application. ‘You’ and ‘customer’ refer to the person using the application or placing an order. ‘Application’ includes the website and its installed app experience. ‘Accepted order’ means an order for which the application has returned a confirmation and order number; its payment and fulfillment status remain separately identified.",
        "These Terms apply to app purchases and related account, rewards, pickup, delivery and support functions. The branch information displayed in the application identifies the fulfillment location. A service or feature described here is available only when enabled and offered for your particular order. These Terms do not represent that every optional feature is available at all times.",
        "A particular offer’s clearly disclosed eligibility rules supplement these Terms. Mandatory Philippine law prevails over any inconsistent provision. The Privacy Policy and Notice is a disclosure of processing practices and is not a blanket consent to unrelated processing.",
      ],
    },
    {
      id: "agreement",
      title: "Electronic agreement and legal capacity",
      paragraphs: [
        "The application requests an affirmative agreement to these Terms and acknowledgement that you have read the Privacy Policy and Notice when you sign up or review a new checkout. The version acknowledged is recorded with the relevant account or accepted order. Mere viewing of a menu does not authorize a charge, create a purchase, or constitute optional marketing consent.",
        "The person placing an order must have legal capacity to enter the transaction or act through a duly authorized representative. If a minor uses the application, a parent or legal guardian should participate in and authorize the transaction as required by law. These Terms do not override laws protecting minors or persons lacking contractual capacity.",
        "If you act for a business, another customer or a delivery recipient, you must have appropriate authority to provide the instructions and information involved. You remain responsible for the accuracy of the order you submit, subject to any rights and remedies provided by law.",
      ],
    },
    {
      id: "accounts",
      title: "Accounts, guest access and security",
      paragraphs: [
        "Provide accurate account and recipient information and update it when necessary. Email confirmation, password recovery and session verification may be required to protect your account. Use an individual password and do not disclose passwords, verification codes, pickup credentials or private receipt links to persons who are not authorized to use them.",
        "Guest orders use access credentials associated with the originating browser or device. An order number or identifier by itself does not establish ownership. Clearing browser storage, changing devices, allowing credentials to expire or losing a receipt link can prevent self-service access; contact Help for verified recovery. Jayds may request proportionate evidence of entitlement before providing private order information.",
        "Report suspected unauthorized access promptly. Jayds may restrict access necessary to contain a security incident or prevent fraud, with an explanation where reasonably possible and lawful. A security restriction does not automatically extinguish your rights concerning a paid order or personal data.",
      ],
    },
    {
      id: "catalog",
      title: "Products, descriptions, customization and allergens",
      paragraphs: [
        "Products, sizes, available modifiers and prices are those displayed for the selected branch and configuration. Photographs and illustrations assist identification; presentation, packaging and appearance may vary. A category illustration used where a product photograph is unavailable is not a photograph of the finished product. Material product information must remain accurate despite normal presentation differences.",
        "Select the required options before adding an item. Notes and special requests are requests for staff review, not guarantees of a recipe change or an accepted substitution. Jayds will seek your agreement where an unavailable item or a material change requires a different configuration or price. A reorder is a new, reviewable draft based on the current menu, rather than a guarantee that the historical product, price or option remains available.",
        "If you have an allergy, intolerance or other dietary requirement, contact the café before ordering and request the information needed to make an informed choice. Do not assume that removing a modifier prevents cross-contact. We do not promise an allergen-free preparation environment or verified nutritional values where these have not been specifically confirmed. This clause does not excuse inaccurate information, unsafe food, or a breach of obligations imposed by law.",
      ],
    },
    {
      id: "prices",
      title: "Prices, fees, offers and disclosed totals",
      paragraphs: [
        "Prices and payable totals are expressed in Philippine pesos (PHP). Review quantities, configuration charges, eligible discounts, any delivery charge and the displayed total before confirming. An offline or saved bag is a draft. Stock, prices, voucher eligibility and loyalty balances are checked again before a new order is accepted; a conflict requires your review rather than silently replacing your ticket.",
        "The accepted order records the agreed items, options and amounts. Later menu or courier price changes do not, by themselves, authorize an increase to that accepted customer total. A separately agreed change must be explained before you authorize it. An apparent error may require investigation, cancellation or another lawful remedy; it does not give Jayds an unrestricted right to debit additional amounts.",
        "A promotion applies only under its published rules, including any expiry, qualifying purchase, redemption limit or restriction on combinations. No promotional benefit is guaranteed solely because a code was entered or an advertisement was previously viewed. Applicable taxes and charges must be reflected in the disclosed price and transaction documentation in accordance with merchant obligations.",
      ],
    },
    {
      id: "acceptance",
      title: "Order submission, acceptance and uncertain responses",
      paragraphs: [
        "Adding to your bag or opening checkout does not submit an order. Review the ticket and use the explicit Place order action to submit it. A confirmation identifies the accepted order and its current payment status. An accepted but unpaid order is not proof of successful payment and may remain subject to a displayed reservation deadline.",
        "If your connection drops or a response is uncertain, retain the recovery screen and retry the existing submission or open the saved order. The application is designed to recover the same submission, but independently creating a new ticket may create another order. Contact Help if you believe there are duplicate accepted orders or payments; Jayds will investigate the recorded transactions.",
        "Jayds may decline a new order where stock, branch availability, delivery coverage, capacity, payment verification or security requirements cannot be met. If an accepted order cannot be fulfilled as agreed, we will communicate the issue and handle cancellation, an agreed alternative or an applicable refund. A decline or cancellation is not a waiver of remedies otherwise available to you.",
      ],
    },
    {
      id: "payment",
      title: "Payment authorization, verification and receipts",
      paragraphs: [
        "Use a payment method offered at checkout and for which you have authority. Cash, where offered for ASAP pickup, is paid at the counter. Delivery and scheduled pickup require verified Maya prepayment. Card or wallet information entered on a payment provider’s page is governed by that provider’s payment process and privacy disclosures in addition to your relationship with Jayds.",
        "A payment-screen redirect, screenshot, bank alert or provider reference alone does not conclusively establish that Jayds has received and matched a payment to the order. The order’s verified payment status governs preparation and paid-order recovery. Where a provider outcome is uncertain, use the existing payment recovery route or contact Help before initiating another payment.",
        "A payment confirmed after a reservation has expired, or an additional payment discovered for the same order, must be recorded and reviewed. It does not automatically reopen a cancelled order or reinstate released stock or a pickup slot. Where money must be returned, authorized staff arrange the applicable refund through the appropriate payment process. Confirmation and receipt information are based on accepted transaction records, without prejudice to any invoice or receipt required by law.",
      ],
    },
    {
      id: "pickup",
      title: "ASAP pickup, collection and pickup credentials",
      paragraphs: [
        "Pickup is available from the branch identified in your order, even if your device is outside the delivery area. ‘ASAP’ describes the selected fulfillment mode, not a guaranteed completion time. Preparation estimates may depend on the order and actual café workload; the current order status is the appropriate source for collection updates.",
        "Present the pickup credential or other verification requested by authorized staff. Share it only with a person you authorize to collect your order. Contact the café promptly if you cannot collect as arranged. The treatment of an uncollected prepared order depends on its condition, safety requirements, the circumstances and applicable law; these Terms do not impose an undisclosed automatic forfeiture or no-show charge.",
      ],
    },
    {
      id: "scheduled",
      title: "Scheduled pickup and reservation deadlines",
      paragraphs: [
        "Scheduled pickup is offered only when the café has enabled and configured available operating windows. The application uses Asia/Manila dates and times, ordinarily offers available windows for today and tomorrow, and displays selectable 15-minute windows subject to minimum notice, branch closures and capacity. A displayed slot is not reserved merely because you browse or select it.",
        "Order acceptance reserves the selected window subject to timely verified Maya payment. The accepted order records its pickup window and payment deadline. For an unpaid scheduled order, the deadline is the earlier of 30 minutes after creation or its preparation deadline; a shorter displayed deadline therefore takes precedence. Pay and verify the accepted order within that deadline to retain the booking.",
        "Later changes to operating settings do not automatically move an already accepted booking. If exceptional circumstances affect fulfillment, the café must communicate with you and arrange an agreed alternative or applicable remedy. Scheduling does not guarantee that preparation has begun, and a clock reaching a particular time does not establish that your order is ready.",
      ],
    },
    {
      id: "delivery",
      title: "Delivery destinations, coverage and courier services",
      paragraphs: [
        "Enter a complete destination, a correct map pin, recipient name and a usable contact number. The selected pin is checked against the café’s configured straight-line delivery radius, currently 8 km. It is a coverage measure, not a road-distance or arrival-time promise. Pickup remains an alternative where a destination is outside delivery coverage.",
        "Delivery availability and the courier quotation depend on the selected destination and service conditions. Changing an address or pin requires a fresh quotation before acceptance. The app uses the destination accepted with the order for dispatch. Request any later change through Help; a driver or courier may be unable to accommodate it without a reviewed arrangement.",
        "Delivery is arranged through the configured courier, presently Lalamove, and the details necessary for delivery are provided to that service. Tracking reflects actual reported milestones or an official tracking link. Weather, traffic, access restrictions and courier availability may affect fulfillment; Jayds does not represent an invented driver location or guaranteed arrival time.",
        "Be reachable and provide lawful access or clear instructions for the handover. If a delivery attempt fails, contact Help so the circumstances, accepted terms and any appropriate remedy can be reviewed. Use of a courier does not exclude Jayds’ own statutory responsibilities for the transaction or justify an undisclosed charge.",
      ],
    },
    {
      id: "cancellation",
      title: "Cancellation, changes and non-conforming orders",
      paragraphs: [
        "Use the cancellation function when available, or submit an order-linked Help request. A cancellation request is not complete until the recorded status or staff response confirms the outcome. Before preparation begins, eligible cancellations can release an unused reservation. Once preparation begins or dispatch has occurred, staff must review what remains practicable and any payment or remedy involved.",
        "For a wrong, missing, unsafe, defective or materially misdescribed item, report the issue promptly and provide the order reference and reasonable supporting information. Prompt reporting helps assess fresh food and delivery conditions; it is not a contractual restriction on a statutory filing period. Do not consume an item you reasonably believe is unsafe.",
        "A change-of-mind request for a conforming prepared item is assessed differently from a complaint about non-conformity. Preparation, perishability or a promotion does not by itself remove a legally required remedy for an unsafe, defective, undelivered or misdescribed product. Jayds will consider replacement, refund or another appropriate remedy under applicable law and the circumstances, without a blanket ‘no return, no exchange’ rule.",
      ],
    },
    {
      id: "refunds",
      title: "Refund review and payment reconciliation",
      paragraphs: [
        "Refund requests are reviewed by authorized personnel against the accepted order, verified payment, fulfillment history and the reason for the request. You may be asked for information proportionate to the issue. Do not submit complete card details, wallet PINs or one-time passwords as refund evidence. A refund request does not authorize a new purchase or payment.",
        "An approved refund is processed through the appropriate payment channel or another lawful, documented arrangement agreed with you. Provider settlement times may vary; staff should communicate the decision and any available reference rather than promising an unverified instant credit. The customer remains entitled to any mandatory remedy and may challenge an unresolved or incorrect decision.",
      ],
    },
    {
      id: "loyalty",
      title: "Loyalty points, tiers, favorites and vouchers",
      paragraphs: [
        "Favorites are a convenience and do not reserve products. Account rewards, tiers and vouchers follow the applicable rules displayed in the wallet or published offer. A displayed potential benefit is subject to the qualifying transaction and final eligibility check. Points are not represented as a cash deposit, transferable currency or guaranteed investment value.",
        "Redemptions require a valid account, sufficient eligible points or an applicable voucher, and a qualifying order. Jayds may correct a duplicate, mistaken or fraudulently obtained reward using a recorded review, and must explain a disputed adjustment through support. A cancellation or refund may require a corresponding review of benefits attributable to that order. Accepted orders are not silently repriced because a loyalty setting changes later.",
      ],
    },
    {
      id: "acceptable-use",
      title: "Permitted use and intellectual property",
      paragraphs: [
        "You may use the application for lawful browsing, personal account management and authorized café purchases. Do not impersonate another person, misuse pickup or guest credentials, bypass access controls, falsify payment evidence, disrupt the service, submit unlawful content, or exploit duplicate requests and offers to obtain an unauthorized benefit.",
        "Jayds branding and original application content, and any third-party material lawfully incorporated into the service, remain subject to their respective ownership and licence rights. Ordinary use grants the access needed for the service; it does not transfer ownership of the brand or software. Nothing here restricts lawful consumer feedback, access to your own data, permitted fair use, or rights that cannot be excluded by contract.",
      ],
    },
    {
      id: "availability",
      title: "Availability, maintenance and events outside reasonable control",
      paragraphs: [
        "Connectivity, browser permissions, service maintenance and provider outages may affect browsing, maps, payment verification or alerts. Offline browsing and draft editing do not create a sale, authorize a payment or reserve a scheduled window. Reconnect and confirm the current order status before relying on a transaction. Push alerts are optional conveniences; consult Orders where an alert is delayed or unavailable.",
        "Jayds will take reasonable steps to address a disruption affecting an accepted order and communicate an appropriate resolution. Events outside reasonable control may require revised fulfillment or cancellation, but do not automatically permit retention of payment for an unfulfilled order or exclusion of an obligation imposed by law.",
      ],
    },
    {
      id: "responsibility",
      title: "Responsibility and mandatory protections",
      paragraphs: [
        "Each party remains responsible for its own obligations under these Terms and Philippine law. Your duty to provide accurate information, protect credentials and cooperate with fulfillment does not make you automatically liable for every unauthorized transaction or technical failure. Responsibility must be assessed on the facts and the law.",
        "Nothing in these Terms excludes or limits liability, a consumer remedy, a data-subject right or an obligation where exclusion or limitation is prohibited by law. There is no general waiver of claims for fraud, unlawful processing, unsafe products, or other actionable conduct, and no contractual cap intended to displace mandatory protections.",
      ],
    },
    {
      id: "complaints",
      title: "Customer assistance and dispute resolution",
      paragraphs: [
        "Raise an order, account, payment or refund concern through Help, preferably linked to the relevant order, or seek assistance at the café. State the issue and requested resolution. Your request and staff response are recorded privately. Privacy concerns may also be directed to the contact in the Privacy Policy and Notice.",
        "Where the internal redress procedure under Republic Act No. 11967 applies, use that procedure as required by law; an unresolved complaint is deemed to have exhausted that mechanism after seven calendar days from filing. This is not a guarantee that a provider credit will complete within seven days and does not remove any applicable urgent remedy or lawful exception.",
        "You may pursue an available remedy through the Department of Trade and Industry, the National Privacy Commission, another competent authority or a court as applicable. These Terms do not require exclusive private arbitration, waive a regulator complaint, or prevent access to a forum permitted by law.",
      ],
    },
    {
      id: "changes",
      title: "Revisions, accepted orders and general provisions",
      paragraphs: [
        "These Terms are identified by the version and effective date above. Material changes are presented for review before a new checkout, rather than treating a previous acknowledgement as acceptance of an undisclosed revision. Earlier versions remain available through the document history. An accepted order retains its recorded agreement and transaction details, subject to mandatory law and any subsequent change expressly agreed with the customer.",
        "These Terms are governed by Philippine law. Jurisdiction and venue are determined by the applicable legal rules; no exclusive location is imposed that deprives a customer of a statutory right. If a provision is held invalid, the remaining provisions apply insofar as lawfully capable of operating. A delay in enforcing a provision is not an automatic waiver of a lawful right.",
        "Read these Terms together with the accepted order, the relevant published offer and the separate Privacy Policy and Notice. A staff assurance does not authorize an undisclosed debit or the surrender of mandatory rights. For service questions use Help; for privacy matters contact Jayds Café at " +
          PRIVACY_CONTACT +
          ".",
      ],
    },
  ],
  references: [
    {
      title: "DTI consumer guidance on defective products",
      href: "https://fairtrade.dti.gov.ph/faq/is-no-return-no-exchange-policy-allowed/",
    },
    {
      title: "Republic Act No. 11967 — Internet Transactions Act",
      href: "https://lawphil.net/statutes/repacts/ra2023/ra_11967_2023.html",
    },
    {
      title: "DTI consumer complaint service",
      href: "https://consumercare.dti.gov.ph/",
    },
  ],
};

export const privacyDocument: LegalDocument = {
  kind: "privacy",
  title: "Privacy Policy and Notice",
  version: LEGAL_VERSION,
  effectiveDate: "7 October 2026",
  introduction:
    "Jayds Café provides this Privacy Policy and Notice to explain how personal data are handled in its customer ordering application and related café fulfillment and support processes. It is intended to provide the information required by Republic Act No. 10173, its Implementing Rules and Regulations, and applicable National Privacy Commission issuances. Reading or acknowledging this Notice is distinct from giving consent for an optional purpose.",
  sections: [
    {
      id: "controller",
      title: "Personal information controller and privacy contact",
      paragraphs: [
        "Jayds Café is the personal information controller for the customer records it determines are needed to operate this ordering service. This Notice covers customers, guest users, recipients whose details are supplied for delivery, and persons contacting the café through the application. It does not replace the independent notices of a payment, courier or other service for processing that the provider determines in its own right.",
        "Direct privacy enquiries and requests to Jayds Café at " +
          PRIVACY_CONTACT +
          ", or use Help and choose a privacy request when that facility is available to you. The telephone contact remains available if you cannot access an account or guest order. Authorized café administration handles privacy enquiries, requests and complaints on behalf of Jayds.",
      ],
    },
    {
      id: "data",
      title: "Categories of personal data",
      paragraphs: [
        "The categories processed depend on whether you browse, create an account, order, request delivery, use rewards, or contact support. Jayds seeks information relevant to the selected service rather than requiring every category from every visitor.",
      ],
      table: {
        headings: ["Category", "Information and context"],
        rows: [
          [
            "Account and authentication",
            "Name, email, optional profile phone number, account identifier, credentials and session information handled through authentication, and confirmation or recovery records. The app does not ask for a national identification number to register.",
          ],
          [
            "Orders and fulfillment",
            "Product selections, quantities, modifiers, notes, accepted amounts, order identifiers, status changes, pickup windows and credentials, and the account or guest-access association.",
          ],
          [
            "Delivery and saved destinations",
            "Recipient name and phone, address, chosen coordinates, instructions, and labels and coordinates for addresses you choose to save.",
          ],
          [
            "Payments and rewards",
            "Payment method, provider references, verification status, amount and currency, relevant timestamps, refund/reconciliation information, points, tier and voucher use. Card and wallet credentials are entered with the payment provider rather than in Jayds’ order form.",
          ],
          [
            "Support and legal records",
            "Request category, subject, message, linked order, staff response and handling status; acknowledged document version, source and server-recorded time for account acknowledgements or the legal version associated with an accepted order.",
          ],
          [
            "Device and connection data",
            "Browser/device and network information associated with service requests and security logs, necessary session or guest-access identifiers, locally stored drafts and preferences, and push subscription endpoint and key material if you opt in.",
          ],
        ],
      },
    },
    {
      id: "sources",
      title: "Sources and method of collection",
      paragraphs: [
        "Information may be provided directly in registration, checkout, saved-address and Help forms; generated by an accepted transaction or account activity; reported by a payment or courier provider; or produced by the browser and service infrastructure when communicating with the application. A person ordering for someone else may supply recipient information.",
        "If you provide another person’s data, provide only what is needed, ensure you have a lawful basis to supply it, and make this Notice available where appropriate. A delivery recipient retains rights concerning their own information even if they did not create the ordering account. Jayds may verify who is entitled to obtain a particular record before disclosing it.",
      ],
    },
    {
      id: "purposes",
      title: "Purposes and lawful grounds",
      paragraphs: [
        "Jayds identifies a lawful ground for each purpose. Necessary account, ordering, fulfillment and requested loyalty functions ordinarily involve steps requested by you or performance of the customer transaction. Applicable legal obligations may require particular financial, security or complaint records. Proportionate security, fraud prevention and dispute handling may rely on legitimate interests only where those interests are properly assessed against your rights.",
        "Optional purposes relying on consent must be specific, informed and freely chosen. Consent is not presumed merely because you read this Notice, create an account, supply data for an order, or agree to the Terms. If a proposed use requires a different ground or fresh consent, that requirement must be addressed before the use occurs.",
      ],
      table: {
        headings: ["Purpose", "Information used and applicable ground"],
        rows: [
          [
            "Account access and recovery",
            "Account and authentication data to establish requested access, confirm identity and secure sessions; requested service/contract and proportionate security interests.",
          ],
          [
            "Accept and fulfill orders",
            "Ticket, recipient, selected destination, scheduling and payment verification data necessary for the requested transaction and delivery.",
          ],
          [
            "Requested rewards and support",
            "Qualifying purchases, balance and voucher records, and request/response information to administer requested benefits, answer enquiries and resolve issues.",
          ],
          [
            "Prevent misuse and reconcile transactions",
            "Limited account, guest-access, provider-reference and security records to protect lawful interests, investigate uncertain outcomes and establish or defend claims, subject to necessity and balancing.",
          ],
          [
            "Meet applicable obligations",
            "Transaction, invoice/receipt, complaint and relevant audit information where a financial, consumer-protection, privacy or other applicable obligation requires processing.",
          ],
          [
            "Optional location and device alerts",
            "Location access only after your action, and push subscription information after opt-in; the optional permission/choice is separate from necessary order processing. A manually chosen destination is used to fulfill the requested delivery.",
          ],
        ],
      },
    },
    {
      id: "sensitive",
      title: "Sensitive information and information not required",
      paragraphs: [
        "Registration and ordinary checkout do not require medical histories, government-issued identifiers, educational records or unrelated sensitive information. Avoid including these, full payment credentials, or another person’s unnecessary private information in notes, address labels or support messages.",
        "A dietary or support message may nevertheless disclose information about health or another protected category. Such information must be handled narrowly for the matter raised and under a condition permitted by Section 13 of the Data Privacy Act. Where specific consent is required, it must be obtained separately; a general agreement to the Terms does not supply an unrestricted consent to sensitive-data processing.",
      ],
    },
    {
      id: "location",
      title: "Location, maps and address search",
      paragraphs: [
        "GPS access is requested only when you choose Use my location. The application uses the result to help select a destination; it does not require continuous background location monitoring for an order. You may deny permission and use address search, a manual pin or another available manual entry method. Pickup does not depend on being within the delivery radius or enabling GPS.",
        "Once a delivery destination is accepted, its address and coordinates are needed for coverage verification, quotation and fulfillment. Removing browser location permission does not remove an address already recorded with an order. You may separately remove a saved address or request review of retained information.",
        "OpenFreeMap supplies map resources requested by your browser; those requests can reveal network information and the map area being displayed. The configured Photon address-search service receives a search query or reverse-search coordinates through Jayds’ server adapter. Enter only the address details needed for search and delivery, rather than unrelated sensitive material.",
      ],
    },
    {
      id: "device-storage",
      title: "Cookies, browser storage and offline drafts",
      paragraphs: [
        "Necessary browser storage supports authentication, session continuity, secure guest-order access, favorites and saved public-menu browsing. A guest-access cookie and corresponding restricted server grant ordinarily expire 90 days after issuance or renewal; clearing cookies or losing the device may end access earlier. Expiry of access is not a statement that the underlying transaction has been erased.",
        "Public app assets and eligible public catalog pages can be cached for offline use. Private account pages, order/payment responses and private operational traffic are treated as network-only by the app’s offline worker. Nevertheless, device drafts, authentication storage, browser history, downloads or copies you save may contain private information; a shared device therefore requires appropriate care.",
        "Drafts are scoped to the current account or guest browser. Signing out or changing account removes the outgoing account’s private draft from active application access. This is not a remote deletion of your café order history, every browser-managed copy, or information retained under a lawful purpose. You may clear device storage separately, accepting that doing so can remove local drafts and guest access.",
      ],
    },
    {
      id: "notifications",
      title: "Optional notifications and marketing choices",
      paragraphs: [
        "Order-ready and delivery milestone push alerts require an affirmative user action and supported browser or installed-app permission. If enabled, the subscription endpoint and associated keys are stored privately and a browser push service delivers messages to that device. Alerts may appear on a lock screen or a shared device, so choose a device and permission setting appropriate to your circumstances.",
        "You may disable background alerts through app settings when available or revoke permission in your browser or device. Disabling alerts affects future delivery of that channel, not an accepted order or information that still has a lawful retention purpose. In-app order tracking remains an alternative where push is unavailable. Expired or revoked subscriptions may be disabled; this does not imply that every related historical record is instantly deleted.",
        "Acknowledging this Notice does not subscribe you to promotional messages, profiling for advertising, or sale of your data. Any optional marketing use must be disclosed and offered separately with a means to decline or withdraw the choice. Jayds does not treat transactional notices, password recovery and payment assistance as consent to unrelated marketing.",
      ],
    },
    {
      id: "recipients",
      title: "Authorized access and external service recipients",
      paragraphs: [
        "Café personnel receive access appropriate to their approved role and the task involved, including preparing orders, verifying collection, reconciling payments and addressing support. Privacy and refund requests are restricted to authorized administration. Access to a necessary order detail is not authority to use it for an unrelated purpose.",
        "External services receive information relevant to their role. A service may act as a processor for Jayds, an independent controller for its regulated service, or both in different contexts. Where processing is undertaken on Jayds’ behalf, Jayds remains responsible for the arrangements and safeguards required by applicable law, including limiting use to authorized purposes and protecting the information entrusted to the service.",
      ],
      table: {
        headings: ["Recipient or service", "Role and relevant information"],
        rows: [
          [
            "Supabase",
            "Database, authentication and related hosted infrastructure for account, order, access-control and other application records.",
          ],
          [
            "Configured application host and email delivery service",
            "Serve app requests and necessary infrastructure/security information; deliver confirmation and recovery messages containing the relevant address and verification link.",
          ],
          [
            "Maya",
            "Set up and verify an authorized payment, using necessary transaction and checkout information. Maya processes payment credentials and provider-side records under its own applicable terms and notice.",
          ],
          [
            "Lalamove and delivery personnel",
            "Quote, dispatch and fulfill delivery using necessary recipient contact, destination, instructions, accepted delivery details and provider association.",
          ],
          [
            "OpenFreeMap and configured Photon service",
            "Display map resources and resolve address searches as explained in the location section.",
          ],
          [
            "Browser push service",
            "Route opted-in device messages using the subscription endpoint and notification payload, subject to browser/device support.",
          ],
          [
            "Competent authorities or necessary professional advisers",
            "Information proportionate to a binding lawful request, applicable obligation or the establishment, exercise or defence of a legitimate claim; disclosure must have a lawful ground.",
          ],
        ],
      },
    },
    {
      id: "transfers",
      title: "Cross-border processing and accountability",
      paragraphs: [
        "Hosted infrastructure, email, maps, payment, courier or push services may process information in locations outside the Philippines. Processing locations depend on the service and its configured infrastructure. Information may therefore be transferred or accessed across borders in connection with the purposes described in this Notice.",
        "Jayds must maintain appropriate accountability and protection for transfers undertaken on its behalf, including applicable contractual and organizational measures. Use of an overseas service does not waive your Philippine privacy rights. You may request information about the relevant recipient, purpose and applicable safeguards through the privacy contact, subject to lawful confidentiality and security limits.",
      ],
    },
    {
      id: "retention",
      title: "Retention periods and review of continued necessity",
      paragraphs: [
        "Personal data shall be retained only as necessary for the declared service purpose, an applicable legal requirement, or the establishment, exercise or defence of a claim. The relevant category and continuing justification must be reviewed. Information shall not be retained indefinitely in identifiable form merely for an unspecified possible future use.",
        "The retention criteria below distinguish expiry of an access credential from deletion of the underlying record. Applicable record-keeping obligations and a particular live dispute may require continued retention of some information after an account or address is no longer used. In responding to a retention or deletion request, Jayds will explain the information retained, its applicable purpose or obligation, and any corresponding restriction. Closing an account does not necessarily erase the associated financial records.",
      ],
      table: {
        headings: ["Record category", "Duration or retention criterion"],
        rows: [
          [
            "Account, profile, favorites and saved addresses",
            "Maintained for the active requested account/service. Saved addresses can be removed through the account. Closure or deletion requests require review of which records can be erased, anonymized or restricted and which remain necessary for a separate lawful purpose.",
          ],
          [
            "Orders, payments, refunds and financial records",
            "Retained for fulfillment, reconciliation, applicable accounting/tax or consumer obligations, and actual claim or dispute periods. The applicable duration is determined by the category of record, the specific obligation or claim, and the continued need for identifiable information.",
          ],
          [
            "Acknowledgements and security/audit records",
            "Retained as necessary to establish the version presented, accountability, a relevant transaction or a legitimate security/claim purpose. Their integrity does not justify unrelated reuse or indefinite retention without a continuing basis.",
          ],
          [
            "Support and privacy requests",
            "Maintained while the request is handled and thereafter only as needed for related complaint, accountability or claim purposes. Unnecessary message content and verification material should be minimized.",
          ],
          [
            "Guest access",
            "Cookie and access grant ordinarily expire 90 days after issuance or renewal. Expiry ends that credential’s access and does not itself purge retained order or support records.",
          ],
          [
            "Device drafts and push records",
            "Device drafts persist until changed or cleared; outgoing private-account drafts are removed from active access on logout/account change. Push access can be disabled or become expired; necessary operational delivery records are subject to a purpose-based retention review.",
          ],
        ],
      },
    },
    {
      id: "security",
      title: "Safeguards, account security and incidents",
      paragraphs: [
        "The application uses account and role checks, scoped guest credentials, restricted private records and checked operational actions to limit access. Production communications should use HTTPS. Private payment and customer operations are not queued for offline background replay. These measures support protection of confidentiality and integrity, without representing that any network or service is free of risk.",
        "Protect the device, password, pickup credentials and private links you control; avoid putting payment secrets in messages. Report suspected unauthorized access or a disclosure through Help or the privacy contact. Where a personal-data breach requires notification, Jayds must assess and notify the NPC and affected individuals in accordance with the applicable requirements, rather than treating this Notice as a waiver of incident obligations.",
      ],
    },
    {
      id: "automation",
      title: "Routine automated processing and human review",
      paragraphs: [
        "The service performs routine checks and calculations concerning prices, stock, delivery coverage, eligible loyalty benefits, time windows, reservation expiry and access. These support the purchase and its protection; an automatic result may prevent a configuration or an unavailable slot from being accepted.",
        "If a result appears incorrect or you need an explanation affecting your order or personal information, request staff review through Help. This Notice does not authorize a new advertising profile, credit decision or another materially different use solely because ordinary ordering calculations already occur. A new use requiring additional information, notification or consent must be addressed separately.",
      ],
    },
    {
      id: "rights",
      title: "Rights of data subjects",
      paragraphs: [
        "Subject to the conditions and lawful limitations applicable to each right, you may exercise the rights below concerning your personal data. The same safeguards apply to a person whose recipient information was supplied by another customer. Agreement to the Terms or acknowledgement of this Notice does not waive these rights.",
      ],
      bullets: [
        "Be informed about the identity of the controller, the data processed, purposes, grounds, recipients, retention and available rights.",
        "Request reasonable access to your data and relevant information about the processing.",
        "Dispute an inaccuracy and request appropriate correction, rectification or supplementation.",
        "Object to processing or withdraw consent for a consent-based purpose, subject to a separate lawful ground or applicable limitation.",
        "Request erasure or blocking where the legal conditions are met; require an explanation of a necessary retained record or lawful restriction.",
        "Request data portability where its statutory conditions apply, in a usable electronic format for eligible records.",
        "Lodge a complaint with the NPC or another competent authority and seek damages or another remedy where provided by law.",
      ],
    },
    {
      id: "requests",
      title: "Request procedure, verification and explanations",
      paragraphs: [
        "Contact " +
          PRIVACY_CONTACT +
          " or submit a private privacy request through Help. Identify the right or concern, the relevant account or order if known, and a means to contact you. Do not provide a complete payment credential or unnecessary sensitive record. If another person acts for you, Jayds may need proportionate evidence of their authority.",
        "Before disclosure, correction or removal of private records, the café must establish that the requester is entitled to the information or action. Verification should be proportionate and use existing account/order evidence where sufficient; it does not automatically require a government-ID copy. Any necessary additional verification information must be handled only for that purpose and minimized.",
        "Jayds should communicate the outcome, any relevant limitation and the reason for continued retention or refusal, within the period required by applicable law and with reasonable diligence. This Notice does not invent a universal response period for every request. A request remains entitled to proper handling even if an automated deletion button is unavailable. Where necessary, correction may be reflected by a documented adjustment without rewriting an immutable historical transaction.",
      ],
    },
    {
      id: "choices",
      title: "Refusal, withdrawal and consequences for the service",
      paragraphs: [
        "You can decline GPS and optional push alerts and still use the applicable manual location and in-app tracking alternatives. Necessary account or transaction information may be required to establish secure access, verify payment or complete the requested delivery; if it is withheld or materially inaccurate, the affected service may not be possible. The café must distinguish that necessity from an unrelated optional purpose.",
        "Withdrawal of a consent-based choice affects future processing for that purpose and does not automatically invalidate processing lawfully completed earlier. It also does not require erasure of records that must be retained under another valid ground. Jayds should identify that ground and any limit rather than treating consent as permanently irrevocable or bundling every possible use into account creation.",
      ],
    },
    {
      id: "minors",
      title: "Minors and authorized representatives",
      paragraphs: [
        "The application does not require a birth date for ordinary registration. Where a minor’s information is involved, the café must consider appropriate safeguards and any authority or consent required for the particular processing; this Notice does not make an unverified claim that every user is an adult.",
        "A parent, legal guardian, duly authorized representative or lawful heir may exercise rights where Philippine law permits and the relevant relationship or authority is established. Only proportionate evidence should be requested, and a representative does not obtain unrestricted access to another person’s records merely by knowing an order number.",
      ],
    },
    {
      id: "revisions",
      title: "Revisions, independent notices and complaints",
      paragraphs: [
        "This Notice takes effect on the date above and is identified by its version. Material changes are presented before a new checkout, and earlier versions remain accessible in document history. A new acknowledgement records review of the new Notice; it does not retroactively manufacture an earlier acceptance or supply consent for a different optional purpose.",
        "If a material change requires fresh specific consent or another lawful ground, displaying a revised Notice alone does not satisfy that separate requirement. A provider’s independent privacy notice applies to processing it controls; Jayds remains accountable for its own processing and obligations.",
        "Raise a privacy concern with Jayds through the stated contact. You may also file a complaint or exercise another remedy with the National Privacy Commission in accordance with its applicable procedures. Contacting the café does not waive that right. Official NPC information and the underlying privacy legislation are linked below.",
      ],
    },
  ],
  references: [
    {
      title: "Republic Act No. 10173 — Data Privacy Act of 2012",
      href: "https://privacy.gov.ph/data-privacy-act/",
    },
    {
      title: "Implementing Rules and Regulations of the Data Privacy Act",
      href: "https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/",
    },
    {
      title: "NPC guidance on the right to be informed",
      href: "https://privacy.gov.ph/the-right-to-be-informed/",
    },
    {
      title: "NPC data-subject rights and complaint information",
      href: "https://privacy.gov.ph/data-subject-rights/",
    },
    {
      title: "NPC Circular No. 2023-04 — Guidelines on Consent",
      href: "https://privacy.gov.ph/wp-content/uploads/2023/11/NPC-Circular-No.-2023-04_Guidelines-on-Consent_07Nov2023.pdf",
    },
  ],
};

export function getLegalDocument(
  kind: "terms" | "privacy",
  version?: string,
): LegalDocument | null {
  const current = kind === "terms" ? termsDocument : privacyDocument;
  if (!version || version === LEGAL_VERSION) return current;
  if (version !== "2026-10-03") return null;
  const old = kind === "terms" ? oldTerms : oldPrivacy;
  return {
    kind,
    title: kind === "terms" ? "Terms of Use" : "Privacy Notice",
    version,
    effectiveDate: "3 October 2026",
    introduction:
      "Archived version. The text below is preserved from the document published for this version; it is not the current notice for a new checkout.",
    sections: old.map(([title, paragraph], index) => ({
      id: `archived-${index + 1}`,
      title,
      paragraphs: [paragraph],
    })),
    references: [],
  };
}
