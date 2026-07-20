[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [lifecycle](../README.md) / LaunchInfo

# Interface: LaunchInfo

Defined in: lifecycle.ts:98

Why the app launched — a one-shot read of `watch.launch`, from [useLaunchReason](../functions/useLaunchReason.md).

## Properties

### arguments

> **arguments**: `number`

Defined in: lifecycle.ts:102

app_launch_get_args() — the unsigned launch argument (0 when none).

***

### reason

> **reason**: `number`

Defined in: lifecycle.ts:100

app_launch_reason() — the AppLaunchReason enum for why this run started.
