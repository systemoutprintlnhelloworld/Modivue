# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Forbidden Patterns

- Do not use a WinForms transparency key or an opaque hit-test backing for the Windows island. They cannot preserve per-pixel alpha at antialiased edges. `IslandWindow` owns native physical-pixel bounds; WPF and `WebView2CompositionControl` own composition.
- Do not let browser `:hover` alone keep desktop island handles visible. Native pointer messages own `.island-rail-hover`, including leave cleanup.
- Native island rings use ARIA labels and the existing detail popover rather than SVG `<title>` tooltips. Keep ring creation and incremental updates consistent when title nodes are absent.

<!-- Patterns that should never be used and why -->

(To be filled by the team)

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

(To be filled by the team)

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)
