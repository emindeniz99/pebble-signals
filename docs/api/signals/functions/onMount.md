[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / onMount

# Function: onMount()

> **onMount**(`fn`): `void`

Defined in: signals.ts:923

onMount(fn): run fn ONCE, untracked. In this run-once model a component body
already executes a single time as it builds, so this is just "do it once,
without subscribing" — the place to start a timer or kick a fetch. (There is
no separate post-layout phase like the DOM's; fn runs during the build.)

## Parameters

### fn

() => `void`

## Returns

`void`
