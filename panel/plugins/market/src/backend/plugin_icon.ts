const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Keep an icon small enough that an admin-only proxy cannot become a file relay. */
export const MAX_PLUGIN_ICON_BYTES = 1024 * 1024;

/**
 * Convert one market response into the only image format the UI accepts.
 * Checking the signature prevents a successful HTML/error response from being
 * presented as an image, while the byte cap bounds both memory and data-URL size.
 */
export function encodePluginIcon(value: ArrayBuffer | ArrayBufferView): string {
  const data = Buffer.isBuffer(value)
    ? value
    : ArrayBuffer.isView(value)
    ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    : Buffer.from(value);
  if (
    data.length === 0 ||
    data.length > MAX_PLUGIN_ICON_BYTES ||
    !data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error("Invalid plugin icon");
  }
  return `data:image/png;base64,${data.toString("base64")}`;
}
