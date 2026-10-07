// apps/pos/app/page.tsx
// Root page — redirect to dashboard or login

import { redirect } from "next/navigation";

export default function PosHomePage() {
  redirect("/dashboard");
}
