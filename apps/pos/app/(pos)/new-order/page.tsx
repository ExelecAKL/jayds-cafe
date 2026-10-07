import { Register } from "../../../components/Register";
export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ park?: string }>;
}) {
  const params = await searchParams;
  return <Register parkedId={params.park} />;
}
