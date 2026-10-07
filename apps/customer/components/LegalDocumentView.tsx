import Link from "next/link";
import type { LegalDocument } from "../lib/legalDocuments";
import {
  LEGAL_VERSION,
  PRIVACY_CONTACT,
  PRIVACY_PHONE_URI,
} from "../lib/legal";
import "./legal-document.css";

export default function LegalDocumentView({
  document,
}: {
  document: LegalDocument;
}) {
  const archived = document.version !== LEGAL_VERSION;
  const other = document.kind === "terms" ? "privacy" : "terms";
  return (
    <article
      className="legal-document surface-card"
      aria-label={document.title}
    >
      <header className="legal-document-intro">
        <p className="eyebrow">
          {archived ? "Document history" : "Jayds Café"}
        </p>
        <h2>{document.title}</h2>
        <p className="legal-document-version">
          Effective {document.effectiveDate} · Version {document.version}
        </p>
        <p>{document.introduction}</p>
        <Link
          href={`/${other}${archived ? `?version=${document.version}` : ""}`}
        >
          {other === "privacy"
            ? "Read the Privacy Policy and Notice"
            : "Read the Terms and Conditions"}
        </Link>
        {archived && (
          <p className="legal-archive-notice">
            This is an earlier version.{" "}
            <Link href={`/${document.kind}`}>Read the current document</Link>.
          </p>
        )}
      </header>
      <nav className="legal-contents" aria-label="Document contents">
        <details>
          <summary>Contents · {document.sections.length} sections</summary>
          <ol>
            {document.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </details>
      </nav>
      {document.sections.map((section, index) => (
        <section
          id={section.id}
          key={section.id}
          className="legal-section"
          aria-labelledby={`${section.id}-heading`}
        >
          <h3 id={`${section.id}-heading`}>
            {index + 1}. {section.title}
          </h3>
          {section.paragraphs.map((paragraph, clause) => (
            <p key={clause}>
              <span className="legal-clause">
                {index + 1}.{clause + 1}
              </span>
              {paragraph}
            </p>
          ))}
          {section.bullets && (
            <ul>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
          {section.table && (
            <div className="legal-table">
              {section.table.rows.map((row) => (
                <dl key={row[0]}>
                  {section.table!.headings.map((heading, cell) => (
                    <div key={heading}>
                      <dt>{heading}</dt>
                      <dd>{row[cell]}</dd>
                    </div>
                  ))}
                </dl>
              ))}
            </div>
          )}
        </section>
      ))}
      <footer className="legal-document-footer">
        <h3>Contact Jayds Café</h3>
        <p>
          Privacy enquiries and requests:{" "}
          <a href={PRIVACY_PHONE_URI}>{PRIVACY_CONTACT}</a>.
        </p>
        <Link
          className="btn-secondary"
          href={document.kind === "privacy" ? "/help?kind=privacy" : "/help"}
        >
          {document.kind === "privacy"
            ? "Submit a privacy request"
            : "Get order assistance"}
        </Link>
        {document.references.length > 0 && (
          <>
            <h3>Official information and legal references</h3>
            <ul>
              {document.references.map((reference) => (
                <li key={reference.href}>
                  <a
                    href={reference.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {reference.title}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
        <h3>Document history</h3>
        <p>
          <Link href={`/${document.kind}`}>
            7 October 2026 · Current version
          </Link>
        </p>
        <p>
          <Link href={`/${document.kind}?version=2026-10-03`}>
            3 October 2026 · Earlier version
          </Link>
        </p>
        <a href="#main-content">Back to top</a>
      </footer>
    </article>
  );
}
