[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [numberfield](../README.md) / NumberField

# Function: NumberField()

> **NumberField**(`props`): `Content`

Defined in: numberfield.ts:102

NumberField — a big centered number with `+`/`-` stepper affordance hints
(a Pebble NumberWindow analog), on ONE Column of Labels.

  const [n, setN] = useState(0);
  const up = () => setN((v) => Math.min(v + 5, 100));
  const down = () => setN((v) => Math.max(v - 5, 0));
  <NumberField value={n} min={0} max={100} unit="%" />   // reactive
  <NumberField value={42} affordance={false} />          // static, no hints

DISPLAY-ONLY (Rule 8) — the APP owns the value and steps it on a button press;
NumberField just reflects it, clamped into `[min,max]`. Hand-builds a Column of
up to three Labels; a thunk `value` is driven by ONE effect (idiom 5b). See the
module header for the composition + reactivity + gotcha-16 contract.

## Parameters

### props

[`NumberFieldProps`](../type-aliases/NumberFieldProps.md)

## Returns

`Content`
