# Trusted references and calibration

![Trusted references and calibration](../../assets/features/calibration.png)

Distribution comparisons need reference observations from a trusted channel under matching conditions. HLWY can also use its public reference; Juice calibration uses recorded reference values rather than server-authenticated budgets.

[中文](../../features/calibration.md) · [Back to README](../../../README.en.md#model-verification) · [Feature index](README.md)

## Matching conditions

Check the model, protocol, prompt, sampling parameters, and reasoning effort before comparing a target with a reference. Reference sampling parameters and the monitored target's effort are recorded separately for inspection. A distance under incompatible conditions is not evidence of model identity.

## Method 1: trusted API answer comparison

Open **Settings → Trusted API answer comparison**:

1. Enter the trusted channel and key for collection.
2. Run the two-request trial to check that responses arrive.
3. Collect 16–100 samples. Collection can be stopped and counts toward the local daily request allowance.
4. Select distribution-fingerprint verification for a target with matching model, protocol, and reasoning conditions.

Collection uses the supplied credentials. Separately saving a trusted provider persists its key in a local configuration file; this is not an encrypted credential vault.

## Method 2: export and import a reference archive

For One Token and Astra:

1. Run the method against a trusted channel with at least 10 valid samples per question. The default one sample per question is only a preview.
2. Export the distribution archive from the completed historical report. The export is checked as JSON data.
3. Import it under **Settings → Verification → Calibration archives**.
4. Run the same method against another channel under matching conditions to compare distributions.

## Limits

Collection and export do not automatically establish an authenticity threshold. Without a calibrated threshold, show distance rather than a true/false identity verdict. Astra's source does not provide the exact author question set and distributions, so references must be collected locally. One Token implements 10 English task categories, not the paper's entire four-language set.
