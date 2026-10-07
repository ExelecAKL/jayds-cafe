import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseAdminClient: SupabaseClient | null = null;

function getSupabaseAdmin() {
  if (!supabaseAdminClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase admin environment variables");
    }

    supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return supabaseAdminClient;
}

const ACCOUNT_QR_HASH_PATTERN = /^[0-9a-f]{64}$/i;

function parseAccountQr(rawValue: unknown): string | null {
  if (typeof rawValue !== "string") return null;

  const value = rawValue.trim();
  const hash = value.startsWith("account:")
    ? value.slice("account:".length).trim()
    : value;

  return ACCOUNT_QR_HASH_PATTERN.test(hash) ? hash : null;
}

async function requireStaff(req: NextRequest, supabaseAdmin: SupabaseClient) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();

  if (!token) {
    return {
      response: NextResponse.json(
        { error: "Missing staff session" },
        { status: 401 },
      ),
    };
  }

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);
  const userId = userData.user?.id;

  if (userError || !userId) {
    return {
      response: NextResponse.json(
        { error: "Invalid staff session" },
        { status: 401 },
      ),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role,is_approved")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("Staff profile lookup error:", profileError);
    return {
      response: NextResponse.json(
        { error: "Failed to verify staff session" },
        { status: 500 },
      ),
    };
  }

  if (
    !profile ||
    !["staff", "admin"].includes(profile.role) ||
    profile.is_approved !== true
  ) {
    return {
      response: NextResponse.json(
        { error: "Staff access required" },
        { status: 403 },
      ),
    };
  }

  return { userId };
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const staff = await requireStaff(req, supabaseAdmin);
    if ("response" in staff) return staff.response;

    const body = (await req.json().catch(() => ({}))) as { qr?: unknown };
    const accountQrHash = parseAccountQr(body.qr);

    if (!accountQrHash) {
      return NextResponse.json(
        { error: "Invalid account QR" },
        { status: 400 },
      );
    }

    const { data: customer, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, phone, points, loyalty_tier")
      .eq("account_qr_hash", accountQrHash)
      .eq("role", "customer")
      .maybeSingle();

    if (error) {
      console.error("Account QR lookup error:", error);
      return NextResponse.json(
        { error: "Failed to look up account" },
        { status: 500 },
      );
    }

    if (!customer) {
      return NextResponse.json(
        { error: "Account QR not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ customer });
  } catch (error) {
    console.error("Account lookup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
