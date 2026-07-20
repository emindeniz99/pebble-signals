[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [anim](../README.md) / useSpring

# Function: useSpring()

> **useSpring**(`target`, `opts?`): () => `number` & `object`

Defined in: anim.ts:265

useSpring(target, opts?) — physics-based motion toward `target`: the RN
Reanimated `withSpring` analog and the one motion model [useTween](useTween.md) (fixed
duration) and [useSequence](useSequence.md) (keyframes) lack. Returns a getter
`() => number`; read it in a binding to drive UI.

  const [open, setOpen] = useState(false);
  const x = useSpring(() => (open() ? 100 : 0), { stiffness: 200, damping: 18 });
  <Label string={() => String(Math.round(x()))} />

A semi-implicit Euler integrator on the device's single interval timer (~30fps)
accelerates toward the target under a spring force minus damping, so motion
overshoots and settles naturally (bounce controlled by `damping`). A BARE-number
`target` springs ONCE from `opts.from` (default the target itself → rests with
no motion; pass `from` for a mount entrance). A THUNK `target` is REACTIVE: ONE
driving effect tracks it and, on each change, re-aims the spring from the CURRENT
position and velocity (a mid-flight change glides, never snaps). The `from` read
is untracked so the effect subscribes to `target()` only — reading the spring's
own output tracked would self-feed. On settle the timer is released and re-armed
on the next change; auto-cleared on owner dispose; the getter carries `.stop()`.
Zero module scope (Rule 5).

## Parameters

### target

`number` \| (() => `number`)

### opts?

[`SpringOptions`](../type-aliases/SpringOptions.md)

## Returns

() => `number` & `object`
