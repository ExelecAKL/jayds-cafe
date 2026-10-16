import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://finance-fixture.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-server-only";
const { POST, GET } =
  await import("../apps/admin/app/api/finance/documents/route.ts");
test("financial photos require current approved Admin, validate bytes, remain private and are downloaded without public URLs", async () => {
  const original = globalThis.fetch;
  let role = "staff",
    approved = true,
    storageWrites = 0,
    metadataWrites = 0,
    cleanup = 0,
    failMetadata = false,
    expired = false;
  const id = "40000000-0000-4000-8000-000000000001";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.pathname.endsWith("/auth/v1/user"))
      return Response.json({
        id: "10000000-0000-4000-8000-000000000001",
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-10-16",
      });
    if (url.pathname.endsWith("/rest/v1/profiles"))
      return Response.json({ role, is_approved: approved });
    if (url.pathname.endsWith("/rest/v1/finance_documents")) {
      if (init?.method === "POST") {
        metadataWrites++;
        return failMetadata
          ? Response.json(
              { message: "Fixture metadata failure" },
              { status: 500 },
            )
          : new Response(null, { status: 201 });
      }
      if (url.searchParams.has("id"))
        return Response.json({
          storage_path: "private/fixture.webp",
          linked_id: expired ? null : id,
          expires_at: "2000-01-01T00:00:00Z",
        });
      return Response.json([]);
    }
    if (url.pathname.includes("/storage/v1/object/")) {
      assert.ok(
        !url.pathname.includes("/public/"),
        "Financial files never use a public object URL",
      );
      if (init?.method === "POST") {
        storageWrites++;
        assert.match(
          url.pathname,
          /jayds-finance-documents\/[a-f0-9-]+\/[a-f0-9-]+\.webp$/,
        );
        return Response.json({ Key: "fixture" });
      }
      if (init?.method === "DELETE") {
        cleanup++;
        return Response.json([]);
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "image/webp" },
      });
    }
    throw Error("Unexpected isolated finance request");
  };
  const upload = (body: BodyInit, extra: Record<string, string> = {}) =>
    new Request("https://admin.fixture/api/finance/documents", {
      method: "POST",
      body,
      headers: {
        Authorization: "Bearer fixture",
        Origin: "https://admin.fixture",
        ...extra,
      },
    });
  const get = () =>
    new Request("https://admin.fixture/api/finance/documents?id=" + id, {
      headers: { Authorization: "Bearer fixture" },
    });
  try {
    assert.equal(
      (
        await POST(
          new Request("https://admin.fixture/api/finance/documents", {
            method: "POST",
            body: "bad",
          }),
        )
      ).status,
      401,
    );
    assert.equal((await POST(upload("bad"))).status, 403);
    assert.equal(storageWrites, 0);
    role = "admin";
    approved = false;
    assert.equal((await GET(get())).status, 403);
    approved = true;
    assert.equal(
      (await POST(upload("bad", { Origin: "https://evil.fixture" }))).status,
      403,
    );
    assert.equal((await POST(upload('<svg onload="alert(1)"/>'))).status, 400);
    const image = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#986b4c" },
    })
      .png()
      .toBuffer();
    const result = await POST(upload(image));
    assert.equal(result.status, 200);
    assert.equal(typeof (await result.json()).id, "string");
    assert.equal(storageWrites, 1);
    assert.equal(metadataWrites, 1);
    const download = await GET(get());
    assert.equal(download.status, 200);
    assert.match(download.headers.get("Cache-Control") ?? "", /no-store/);
    assert.match(
      download.headers.get("Content-Disposition") ?? "",
      /^attachment/,
    );
    assert.equal(download.headers.get("X-Content-Type-Options"), "nosniff");
    expired = true;
    assert.equal((await GET(get())).status, 404);
    failMetadata = true;
    assert.equal((await POST(upload(image))).status, 503);
    assert.equal(
      cleanup,
      1,
      "Failed metadata insert removes the private uploaded object",
    );
  } finally {
    globalThis.fetch = original;
  }
});
