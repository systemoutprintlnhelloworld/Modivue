# HLWY Public Baselines

Source: https://github.com/hanlinwenyuan/hlwy-ai-checker
Author: hanlinwenyuan and contributors.
License: GNU Lesser General Public License 2.1, included in HLWY-LICENSE.txt.

hlwy-baselines.json contains unmodified baseline records retrieved on 2026-09-08,
wrapped with source URLs and retrieval date. Modivue periodically refreshes these
records from the upstream baselines directory. These community measurements are
not model-provider certifications. Standard model names still come from models.dev.

Modivue independently implements the published cosine / natural-log JS divergence /
mode-distance formula in src/core/evaluator-hlwy.mjs. It uses strict integer parsing
and an 80% validity requirement; it does not adopt the upstream identity verdicts
when the reference reasoning effort is unspecified.
