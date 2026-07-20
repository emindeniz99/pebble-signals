[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [press](../README.md) / PressHandlers

# Type Alias: PressHandlers

> **PressHandlers** = `Record`\<`string`, () => `boolean`\>

Defined in: press.ts:64

The spread-ready bag of button-event handlers every hook returns. Keys are the
`onPress<Button>` / `onRelease<Button>` names for the chosen button; each handler
returns `true` to CONSUME the event (jsx-runtime's HandlerBehavior treats any
non-`false` return as "consume"). Spread it onto a FOCUSED node:
`<Container focus {...bag}>`.
