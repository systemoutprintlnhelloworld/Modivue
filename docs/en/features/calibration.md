# Reference calibration

Distribution-based methods need a reference collected from the same model under the same conditions on a trusted channel.

Conditions must match: model, protocol, prompt, sampling parameters, and reasoning effort.

## Trusted API collection

1. Enter a trusted channel in Settings.
2. Run two trial samples.
3. Collect 16–100 samples and stop when needed.
4. Use the resulting reference for the same model and conditions.

## Export from a historical report

For One Token and Astra, run a trusted-channel verification, export the distribution archive from history, then import it under Settings → Verification.

## Limits

Without a calibrated threshold, Modivue shows distance only. Astra does not publish its exact dataset. One Token supports ten English task classes, not the paper's full multilingual set.

[Back to README](../../../README.en.md) · [Feature index](README.md)
