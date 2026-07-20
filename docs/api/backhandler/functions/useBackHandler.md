[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [backhandler](../README.md) / useBackHandler

# Function: useBackHandler()

> **useBackHandler**(`handler`): [`BackHandlerBag`](../interfaces/BackHandlerBag.md)

Defined in: backhandler.ts:58

useBackHandler(handler) — intercept the Back button: the RN `BackHandler`
analog. Returns a bag to SPREAD on a FOCUSED node; `handler` runs on each Back
press and returns `true` to CONSUME it (stay in the app) or `false` to let Back
do its default (leave the app / bubble).

  <Container focus {...useBackHandler(() => {
    if (nav.canPop()) { nav.pop(); return true; }  // consumed — pop instead of exit
    return false;                                   // at root — allow exit
  })}>…</Container>

Matches RN semantics: ONLY an explicit `true` consumes Back; `false`/`undefined`
allow the default. The handler is read on every press so it can consult live
state. See the module header for the honest device caveat (in-app intercept is
proven; firmware exit-prevention is not).

## Parameters

### handler

() => `boolean`

called on each Back press; return `true` to consume, else allow exit

## Returns

[`BackHandlerBag`](../interfaces/BackHandlerBag.md)

a [BackHandlerBag](../interfaces/BackHandlerBag.md) to spread on a focusable node
