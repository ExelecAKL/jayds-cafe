import {
  requireAdminRequest,
  AdminAccessError,
} from "../../../../lib/admin-access";
import {
  prepareMenuImage,
  readMenuImage,
  MenuImageError,
} from "../../../../lib/menu-image";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
  "X-Content-Type-Options": "nosniff",
};
export async function POST(request: Request) {
  try {
    return await withRequestDeadline(async () => {
      const { db, actor } = await requireAdminRequest(request);
      const image = await prepareMenuImage(await readMenuImage(request));
      const id = crypto.randomUUID(),
        path = `${actor}/${id}.webp`;
      const bucket = db.storage.from("jayds-finance-documents");
      const { error } = await bucket.upload(path, image, {
        contentType: "image/webp",
        upsert: false,
      });
      if (error) throw new Error("Storage unavailable");
      const saved = await db.from("finance_documents").insert({
        id,
        actor_id: actor,
        storage_path: path,
        byte_size: image.length,
      });
      if (saved.error) {
        await bucket.remove([path]);
        throw new Error("Upload record unavailable");
      }
      // Expired abandoned uploads are inaccessible and removed on later uploads.
      const expired = await db
        .from("finance_documents")
        .select("id,storage_path")
        .lt("expires_at", new Date().toISOString())
        .is("linked_id", null)
        .limit(20);
      if (expired.data?.length) {
        const removed = await bucket.remove(
          expired.data.map((row) => row.storage_path),
        );
        if (!removed.error)
          await db
            .from("finance_documents")
            .delete()
            .in(
              "id",
              expired.data.map((row) => row.id),
            )
            .is("linked_id", null);
      }
      return Response.json({ id }, { headers });
    }, 30000);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AdminAccessError || error instanceof MenuImageError
            ? error.message
            : "Document upload failed. Your form is retained; try again.",
      },
      {
        status:
          error instanceof AdminAccessError || error instanceof MenuImageError
            ? error.status
            : 503,
        headers,
      },
    );
  }
}
export async function GET(request: Request) {
  try {
    return await withRequestDeadline(async () => {
      const { db } = await requireAdminRequest(request),
        id = new URL(request.url).searchParams.get("id");
      if (!id || !/^[a-f0-9-]{36}$/i.test(id))
        throw new AdminAccessError("Document not found.", 404);
      const { data, error } = await db
        .from("finance_documents")
        .select("storage_path,expires_at,linked_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("Document unavailable");
      if (
        !data ||
        (!data.linked_id && Date.parse(data.expires_at) <= Date.now())
      )
        throw new AdminAccessError("Document not found.", 404);
      const result = await db.storage
        .from("jayds-finance-documents")
        .download(data.storage_path);
      if (result.error || !result.data) throw new Error("Document unavailable");
      return new Response(result.data, {
        headers: {
          ...headers,
          "Content-Type": "image/webp",
          "Content-Disposition": 'attachment; filename="invoice-photo.webp"',
          "Content-Security-Policy": "sandbox; default-src 'none'",
        },
      });
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AdminAccessError
            ? error.message
            : "Document could not load. Try again.",
      },
      {
        status: error instanceof AdminAccessError ? error.status : 503,
        headers,
      },
    );
  }
}
