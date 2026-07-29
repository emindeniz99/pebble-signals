[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [button](../README.md) / Button

# Function: Button()

> **Button**(`props`): `Content`

Defined in: button.ts:103

Button — a focusable, pressable Container with a centered label and a skin that
swaps on press.

  const [n, setN] = useState(0);
  <Button label="Press SELECT" onPress={() => setN((c) => c + 1)} width={160} />
  <Button label={() => `Count ${n()}`} onPress={reset} onLongPress={hardReset} />

Built through the jsx() factory so the `focus` prop, the onPressSelect/
onReleaseSelect whitelist and the reactive `skin` binding all ride the
device-proven paths (the ErrorBoundary crash UI is the in-repo receipt). onPress
fires on RELEASE; press-down only lights the pressed skin. Handlers return truthy
to CONSUME the Select press. See the module header for the press / long-press /
focus / single-focus contract.

## Parameters

### props

[`ButtonProps`](../type-aliases/ButtonProps.md)

## Returns

`Content`
