[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [jsx-runtime](../README.md) / RenderOptions

# Interface: RenderOptions

Defined in: jsx-runtime.ts:416

Options for [render](../functions/render.md).

## Properties

### boundary?

> `optional` **boundary?**: `boolean`

Defined in: jsx-runtime.ts:426

Top-level error boundary (default ON). `true`/omitted: an escaped
reactive or build error disposes the whole tree and paints a crash
screen — the full error on the watch; select retries the build, any
other button exits (rethrows → fxAbort, so the log gets it too).
`false` = strict: errors are logged in full, then PROPAGATE (on
device: fxAbort — dead but loud). A custom `globalThis.__spError`
handler bypasses both and owns the policy.
