/** CSV strings are spreadsheet-safe, including leading whitespace before formulas. */
export function recordsCsv(
  rows: Record<string, unknown>[],
  columns?: string[],
) {
  const keys = columns ?? [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => {
    let text =
      value == null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    if (typeof value !== "number" && /^[\s]*[=+\-@\t\r]/.test(text))
      text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return (
    "\ufeff" +
    [
      keys.map(cell).join(","),
      ...rows.map((row) => keys.map((key) => cell(row[key])).join(",")),
    ].join("\r\n")
  );
}
const encoder = new TextEncoder();
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size: number) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}
/** Standard, uncompressed ZIP; browser-native and readable by ordinary ZIP tools. */
export function dataZip(files: { name: string; text: string }[]): Uint8Array {
  const parts: Uint8Array[] = [],
    directory: Uint8Array[] = [];
  let offset = 0,
    centralSize = 0;
  if (files.length > 65535) throw new Error("Too many files in this export.");
  for (const file of files) {
    if (!/^[a-z0-9_.-]+$/i.test(file.name))
      throw new Error("Invalid export filename.");
    const name = encoder.encode(file.name),
      data = encoder.encode(file.text),
      crc = crc32(data);
    if (offset + data.length > 0xffffffff)
      throw new Error("Export is too large. Download fewer sections at once.");
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x800, true);
    local.view.setUint16(12, 0x21, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, name.length, true);
    parts.push(local.bytes, name, data);
    const central = header(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x800, true);
    central.view.setUint16(14, 0x21, true);
    central.view.setUint32(16, crc, true);
    central.view.setUint32(20, data.length, true);
    central.view.setUint32(24, data.length, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint32(42, offset, true);
    directory.push(central.bytes, name);
    centralSize += 46 + name.length;
    offset += 30 + name.length + data.length;
  }
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + 22);
  let position = 0;
  for (const bytes of [...parts, ...directory, end.bytes]) {
    output.set(bytes, position);
    position += bytes.length;
  }
  return output;
}
