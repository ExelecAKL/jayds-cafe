import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://menu-photo-fixture.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-server-only";
process.env.NEXT_PUBLIC_ADMIN_URL = "https://cafe-public.fixture/admin";
const { POST } = await import("../apps/admin/app/api/menu/images/route.ts");
test("photo upload verifies approved Admin access before accepting file bytes or writing storage", async () => {
  const original = globalThis.fetch;
  let role = "staff",
    approved = true,
    writes = 0;
  let stored: unknown;
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/auth/v1/user"))
      return Response.json({
        id: "10000000-0000-4000-8000-000000000001",
        email: "fixture@example.test",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "2026-10-16",
      });
    if (url.includes("/rest/v1/profiles"))
      return Response.json({ role, is_approved: approved });
    if (url.includes("/storage/v1/object/")) {
      writes++;
      stored = init?.body;
      assert.match(url, /jayds-menu-images\/uploads\/[a-f0-9-]+\.webp$/);
      return Response.json({ Key: "fixture" });
    }
    throw new Error("Unexpected fixture request");
  };
  const request = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request("http://admin.fixture/api/menu/images", {
      method: "POST",
      body,
      headers: {
        authorization: "Bearer fixture-token",
        origin: "http://admin.fixture",
        ...headers,
      },
    });
  try {
    assert.equal(
      (
        await POST(
          new Request("http://admin.fixture/api/menu/images", {
            method: "POST",
            body: "bad",
          }),
        )
      ).status,
      401,
    );
    assert.equal(
      (await POST(request("bad", { origin: "https://other.fixture" }))).status,
      403,
    );
    assert.equal((await POST(request("bad"))).status, 403);
    assert.equal(writes, 0);
    role = "admin";
    approved = false;
    assert.equal((await POST(request("bad"))).status, 403);
    assert.equal(writes, 0);
    approved = true;
    assert.equal((await POST(request("bad"))).status, 400);
    assert.equal(writes, 0);
    const photo = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#986b4c" },
    })
      .png()
      .toBuffer();
    const response = await POST(request(photo));
    assert.equal(response.status, 200);
    assert.equal(writes, 1);
    assert.ok(stored);
    assert.match(
      (await response.json()).url,
      /\/storage\/v1\/object\/public\/jayds-menu-images\/uploads\//,
    );
    assert.equal(
      (await POST(request(photo, { origin: "https://cafe-public.fixture" })))
        .status,
      200,
      "Configured public Admin origin works through an upstream rewrite",
    );
    assert.equal(
      (
        await POST(
          request(photo, { origin: "https://cafe-public.fixture.evil" }),
        )
      ).status,
      403,
    );
    assert.equal(writes, 2);
  } finally {
    globalThis.fetch = original;
  }
});
