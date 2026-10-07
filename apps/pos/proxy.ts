import { NextResponse } from "next/server";
// POS auth is gated client-side in the protected route layout.
// This avoids redirect loops caused by cookie propagation timing between
// the browser auth client and Next.js proxy on localhost.
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
