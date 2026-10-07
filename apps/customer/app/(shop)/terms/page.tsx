import AppShell from "../../../components/AppShell";
import { notFound } from "next/navigation";
import LegalDocumentView from "../../../components/LegalDocumentView";
import { getLegalDocument } from "../../../lib/legalDocuments";
export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string | string[] }>;
}) {
  const { version } = await searchParams;
  if (Array.isArray(version)) notFound();
  const document = getLegalDocument("terms", version);
  if (!document) notFound();
  return (
    <AppShell
      title="Terms and Conditions"
      mobileTitle="Terms & conditions"
      backHref="/account"
      description={"Jayds Café · Effective " + document.effectiveDate}
    >
      <LegalDocumentView document={document} />
    </AppShell>
  );
}
