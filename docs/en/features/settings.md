# Settings and notifications

![Settings and notifications](../../assets/features/settings.png)

[中文](../../features/settings.md) · [Back to README](../../../README.en.md#features) · [Feature index](README.md)

## Using Settings

Settings are grouped by category and can be searched. Changes are saved automatically with a confirmation message. Invalid input is reported; failed saves retain the draft rather than allowing a refresh to overwrite it.

## Detection

| Setting | Purpose |
|---|---|
| Active probing | Enables or pauses automatic sampling; proxy observation remains available. |
| Probe interval | Controls performance sampling and checks for due verification. |
| Verification interval | 1–1440 minutes between completed local verification rounds; separate from delays between requests within a round. |
| Daily request limit | Bounds local probe requests, including manual sampling. |
| Output token limit | Bounds output for performance probes; verification methods may have their own limits. |
| Trusted API comparison | Collects reference answers; see [Calibration](calibration.md). |
| Calibration archives | Imports compatible reference distributions; see [archive export and import](calibration.md#method-2-export-and-import-a-reference-archive). |

See [Cost and balance](cost.md) for charging and remote-service limits.

## Notifications

System notifications are delivered through the persistent desktop host. Settings includes a test notification. Verification, TTFT, cache, request errors, and balance alerts have category-specific controls and sounds. Category settings remain subject to the overall notification and sound controls. Balance also has separate in-app/system delivery settings.

## Appearance and language

| Setting | Purpose |
|---|---|
| Language | Follows the system initially; Chinese and English can be selected manually. Questions and model answers retain their original language. |
| Theme | Controls colors; the native macOS title bar follows the app theme. |
| Text size | 80%–200%. |
| Body text color | Can be set independently of the theme. |
| Visible information | Selects panel metrics/information and nonessential navigation tabs. |
| Ring contrast | Adjusts model backgrounds and empty ring tracks. |
| Balance baseline | Resets the full-ring reference; see [Dynamic Island](island.md#balance-ring-baseline). |

Panel animations respect the operating system's reduced-motion setting.
