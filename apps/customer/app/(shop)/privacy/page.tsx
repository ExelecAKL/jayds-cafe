import { notFound } from "next/navigation";
import AppShell from "../../../components/AppShell";
import LegalDocumentView from "../../../components/LegalDocumentView";
import { getLegalDocument } from "../../../lib/legalDocuments";
export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string | string[] }>;
}) {
  const { version } = await searchParams;
  if (Array.isArray(version)) notFound();
  const document = getLegalDocument("privacy", version);
  if (!document) notFound();
  return (
    <AppShell
      title="Privacy Policy and Notice"
      mobileTitle="Privacy notice"
      backHref="/account"
      description={"Jayds Café · Effective " + document.effectiveDate}
    >
      <LegalDocumentView document={document} />
    </AppShell>
  );
}
