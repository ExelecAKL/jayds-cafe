import type { InvoiceRecord } from "../finance/types";

export const EMAIL_ORIGIN = "https://jaydscafe.vercel.app";
export const escapeEmail = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
const ink = "#432814",
  muted = "#78583d";

export function emailFrame(input: {
  title: string;
  preheader: string;
  body: string;
  action: string;
  url: string;
  category: string;
}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeEmail(input.title)}</title><style>@media(max-width:600px){.email-body{padding:28px 20px!important}.email-shell{border-radius:20px!important}}</style></head>
<body style="margin:0;padding:0;background:#fbf5ee;color:${ink};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeEmail(input.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:100%;max-width:600px;background:#fffdfa;border:1px solid #e8daca;border-radius:28px;overflow:hidden"><tr><td class="email-body" style="padding:36px 40px">
<img src="${EMAIL_ORIGIN}/email/jayds-logo.png" width="208" alt="Jayds Café" style="display:block;width:208px;max-width:100%;height:auto;border:0;margin:0 0 32px">
<p style="margin:0 0 12px;font-size:11px;font-weight:bold;letter-spacing:2px;color:#a76b3b">${escapeEmail(input.category.toUpperCase())}</p>
<h1 style="margin:0 0 20px;font-size:28px;line-height:1.2;letter-spacing:-.5px;color:${ink}">${escapeEmail(input.title)}</h1>
<div style="font-size:15px;line-height:1.65;color:${muted}">${input.body}</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 0"><tr><td bgcolor="${ink}" style="border-radius:14px"><a href="${escapeEmail(input.url)}" style="display:inline-block;padding:16px 24px;color:#fff7ee;font-size:15px;font-weight:bold;line-height:20px;text-decoration:none;border:1px solid ${ink};border-radius:14px">${escapeEmail(input.action)}</a></td></tr></table>
</td></tr><tr><td style="padding:20px 40px;border-top:1px solid #e8daca;background:#f5ecdf;color:${muted};font-size:12px;line-height:1.6">Jayds Café<br>This message relates to your account or purchase.</td></tr></table>
</td></tr></table></body></html>`;
}

export const authEmailContent = {
  confirmation: {
    subject: "Confirm your Jayds Café account",
    title: "You're almost here.",
    body: "Confirm your email address to finish setting up your Jayds Café account.",
    action: "Confirm my email",
  },
  recovery: {
    subject: "Reset your Jayds Café password",
    title: "A fresh start.",
    body: "We received a request to reset your password. Use the button below to choose a new one.",
    action: "Reset my password",
  },
  magic_link: {
    subject: "Your Jayds Café sign-in link",
    title: "Welcome back.",
    body: "Use this secure link to sign in to your Jayds Café account.",
    action: "Sign in to Jayds",
  },
  invite: {
    subject: "You're invited to Jayds Café",
    title: "You're invited.",
    body: "You've been invited to create a Jayds Café account. Accept your invitation below.",
    action: "Accept invitation",
  },
  email_change: {
    subject: "Confirm your Jayds Café email change",
    title: "Confirm your new email.",
    body: "Confirm the requested email change for your Jayds Café account.",
    action: "Confirm email change",
  },
  reauthentication: {
    subject: "Your Jayds Café verification code",
    title: "Confirm it's you.",
    body: "Enter this verification code in the app to continue:",
    action: "",
  },
} as const;

export function authEmailTemplate(kind: keyof typeof authEmailContent) {
  const content = authEmailContent[kind];
  const html = emailFrame({
    title: content.title,
    preheader: content.subject,
    category: "Your account",
    body: `<p style="margin:0 0 20px">${content.body}</p>${kind === "reauthentication" ? '<p style="font-size:30px;font-weight:bold;letter-spacing:6px;color:#432814">{{ .Token }}</p>' : ""}<p style="margin:0;font-size:13px">If you didn't request this, you can ignore this email. Never share your password or verification code.</p>`,
    action: content.action || "Open Jayds",
    url:
      kind === "reauthentication"
        ? EMAIL_ORIGIN + "/account"
        : "{{ .ConfirmationURL }}",
  });
  return { subject: content.subject, html };
}

const money = (cents: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    cents / 100,
  );
export function invoiceEmail(invoice: InvoiceRecord) {
  const f = invoice.breakdown,
    b = invoice.business;
  if (
    !/^[0-9a-f-]{36}$/i.test(invoice.order_id) ||
    f.version !== 1 ||
    f.currency !== "PHP" ||
    !f.lines.length ||
    !Number.isSafeInteger(f.total) ||
    f.total < 0
  )
    throw new Error("Invalid issued invoice snapshot");
  for (const line of f.lines)
    if (
      !Number.isSafeInteger(line.total) ||
      line.total < 0 ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1
    )
      throw new Error("Invalid issued invoice line");
  const credit = invoice.kind === "credit_note",
    label = credit ? "Credit note" : "Invoice";
  const subject = `${label} ${invoice.number} · Jayds Café`;
  const url = EMAIL_ORIGIN + `/orders/${invoice.order_id}/invoice`;
  const date = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(invoice.issued_at));
  const totals: [string, number][] = [
    ["Menu amount, VAT included", f.gross],
    ["Discount", f.discount],
    ["VATable sales", f.taxable_sales],
    ["VAT-exempt sales", f.exempt_sales],
    ["VAT (12%, included)", f.vat],
    ["Delivery charge", f.delivery],
    [`Total ${credit ? "credited" : "paid"}`, f.total],
  ];
  if (totals.some(([, value]) => !Number.isSafeInteger(value) || value < 0))
    throw new Error("Invalid issued invoice totals");
  const lines = f.lines
    .map(
      (line) =>
        `<tr><td style="padding:12px 0;border-bottom:1px solid #e8daca">${escapeEmail(line.name)}<br><span style="font-size:12px">Qty ${line.quantity}</span></td><td align="right" style="padding:12px 0;border-bottom:1px solid #e8daca;white-space:nowrap">${money(line.total)}</td></tr>`,
    )
    .join("");
  const rows = totals
    .map(
      ([name, value], i) =>
        `<tr><td style="padding:5px 0;${i === totals.length - 1 ? "font-weight:bold;color:#432814" : ""}">${name}</td><td align="right" style="padding:5px 0;white-space:nowrap;${i === totals.length - 1 ? "font-weight:bold;color:#432814" : ""}">${money(value)}</td></tr>`,
    )
    .join("");
  const body = `<p style="margin:0 0 20px">${credit ? "Your credit note is ready." : "Your payment is confirmed. Here's your invoice."}</p><div style="padding:18px;background:#f5ecdf;border-radius:14px"><strong style="color:#432814">${escapeEmail(invoice.number)}</strong><br>${escapeEmail(date)}<br>Buyer: ${escapeEmail(invoice.buyer.name)}${invoice.original_number ? "<br>Credits invoice: " + escapeEmail(invoice.original_number) : ""}</div><table width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:16px 0"><thead><tr><th align="left" style="font-size:12px;padding:8px 0">Item</th><th align="right" style="font-size:12px;padding:8px 0">Amount</th></tr></thead><tbody>${lines}</tbody></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;margin:16px 0">${rows}</table><p style="font-size:12px;margin:24px 0 0">${escapeEmail(b.registered_name)}<br>${escapeEmail(b.address)}<br>TIN ${escapeEmail(b.tin)} · Branch ${escapeEmail(b.branch_code)}</p><p style="font-size:12px">Open your invoice in Jayds to view the complete document or save a PDF. Sign in with the account used for this order.</p>`;
  const text = [
    subject,
    date,
    `Buyer: ${invoice.buyer.name}`,
    invoice.original_number
      ? `Credits invoice: ${invoice.original_number}`
      : "",
    ...f.lines.map(
      (line) => `${line.quantity} × ${line.name}: ${money(line.total)}`,
    ),
    ...totals.map(([name, value]) => `${name}: ${money(value)}`),
    b.registered_name,
    b.address,
    `TIN ${b.tin} · Branch ${b.branch_code}`,
    `View invoice / Save PDF: ${url}`,
    "Sign in with the account used for this order.",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    subject,
    html: emailFrame({
      title: credit ? "Your credit note is ready." : "Thanks for your order.",
      preheader: `${label} ${invoice.number} · ${money(f.total)}`,
      category: label,
      body,
      action: "View invoice / Save PDF",
      url,
    }),
    text,
  };
}
