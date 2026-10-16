import sharp from "sharp";

export const MENU_IMAGE_LIMIT = 5 * 1024 * 1024;
export class MenuImageError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function readMenuImage(request: Request): Promise<Buffer> {
  if (!request.body) throw new MenuImageError("Choose a photo first.");
  if (Number(request.headers.get("content-length")) > MENU_IMAGE_LIMIT)
    throw new MenuImageError("Choose a photo smaller than 5 MB.", 413);
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const stopped = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new MenuImageError("Photo upload took too long. Try again.", 408),
          ),
        15_000,
      );
    });
    const read = async () => {
      const chunks: Buffer[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MENU_IMAGE_LIMIT)
          throw new MenuImageError("Choose a photo smaller than 5 MB.", 413);
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
    };
    return await Promise.race([read(), stopped]);
  } catch (failure) {
    void reader.cancel().catch(() => {});
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}

/** Decode the actual file, reject active/animated formats, strip metadata and resize. */
export async function prepareMenuImage(bytes: Buffer): Promise<Buffer> {
  if (!bytes.length || bytes.length > MENU_IMAGE_LIMIT)
    throw new MenuImageError("Choose a photo smaller than 5 MB.", 413);
  try {
    const input = sharp(bytes, {
      limitInputPixels: 20_000_000,
      failOn: "warning",
    });
    const info = await input.metadata();
    if (
      !["jpeg", "png", "webp"].includes(info.format ?? "") ||
      (info.pages ?? 1) !== 1
    )
      throw new MenuImageError("Choose a JPG, PNG or still WebP photo.");
    return await input
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (failure) {
    if (failure instanceof MenuImageError) throw failure;
    throw new MenuImageError(
      "This photo could not be opened. Choose another JPG, PNG or WebP.",
    );
  }
}
