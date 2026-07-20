[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [anim](../README.md) / useTween

# Function: useTween()

> **useTween**(`target`, `opts?`): () => `number`

Defined in: anim.ts:91

useTween(target, opts?) — smoothly eases a value toward `target` over `duration`
ms on each change: the RN Reanimated `withTiming` analog with Solid ownership.
Returns a getter `() => number`; read it in a binding to drive UI.

  const [i, setI] = useState(0);
  const value = useTween(() => targets[i()], { duration: 500, easing: quadInOut });
  // read i() too, so the binding re-subscribes to the fresh tween signal on retarget:
  <Label string={() => { i(); return String(Math.round(value())); }} />

A BARE-number `target` is CONSTANT — `useTween(42)` returns `() => 42` with no
effect, signal or timer (zero cost). A THUNK `target` is REACTIVE: ONE effect
tracks it and, on each change, stops the in-flight tween and starts a fresh
`animate()` from the CURRENT eased value — so a mid-flight retarget glides on from
the partial value and never snaps back to the origin. The first (mount) run
settles at the initial value without animating. Composes flow's `animate()`,
which `track()`s its own stop with the owning effect, so the tween auto-stops when
the screen is disposed. See the module header for the re-subscribe gotcha.

## Parameters

### target

`number` \| (() => `number`)

### opts?

[`TweenOptions`](../type-aliases/TweenOptions.md)

## Returns

() => `number`
