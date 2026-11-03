import { isUtf8 } from 'node:buffer'

/** A message body as text when it's valid UTF-8, else base64 (so we never mangle binaries). */
export function encodePayload(content: Buffer): { payload: string; isBinary: boolean } {
  const isBinary = !isUtf8(content)
  return {
    payload: isBinary ? content.toString('base64') : content.toString('utf8'),
    isBinary
  }
}
