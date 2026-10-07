// apps/customer/app/page.tsx
// Root page — redirect to menu

import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/menu");
}
