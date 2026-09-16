# Implementation Boundaries

Retain the existing Node HTTP service, SQLite store and browser UI. Protocol observation, aggregation, catalog parsing and identity matching are shared modules. The CLI consumes the same persisted aggregates.

Use a maintained SSE parser for frame boundaries and incremental UTF-8 decoding. Only protocol content events establish TTFT. Non-streaming response latency is not TTFT. Preserve raw usage and request conditions, and distinguish errors, partial data and unsupported measurements.

Models.dev's generated catalog has explicit `models` and `providers` maps. Parse those maps using the upstream generator contract, never arbitrary recursive name discovery. Canonical metadata remains separate from relay serving information. Cache only successfully downloaded data with source timestamps; refresh automatically and label stale data on failure.

Channels and groups use an exact identity tuple. Do not fall back to an unrelated model or key in the status line. Active jobs share results only for identical identity, protocol and evaluation conditions.

Quality method is pending user selection. Meow's fingerprint result measures resemblance among a candidate pool, not coding-task capability. Work on collection, persistence and UI can proceed independently.

The desktop shell uses native Swift/AppKit and WKWebView. It owns an always-on-top transparent island panel, expands that panel on hover, opens a separate detailed window on click, and starts the bundled localhost service. The application bundle contains a self-contained Apple Silicon Node runtime and is ad-hoc signed for local development.

Known environment constraints require revalidation for visual runtime checks: local listener creation returns `EPERM`, and LaunchServices returns `kLSNoExecutableErr` for both Modivue and an independently compiled minimal AppKit control bundle. Syntax, type, bundle, nested Mach-O signatures and the bundled service runtime can still be verified here; screenshots require a normal interactive macOS session.
