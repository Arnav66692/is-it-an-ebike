# Contributing

Use Node.js 24 and `npm ci`. Run the commands under “Run locally” in the [README](README.md) before proposing a change. CI requires typechecking, lint with no warnings, the TypeScript tests, map-builder tests and a production build.

For a rules change, include the primary source, effective date, jurisdiction and a regression case. Update the source record and independent oracle deliberately; changing both to agree is not evidence of legal correctness. Keep unknown and unchecked coverage explicit.

For parser, network or UI changes, add behavioral regression tests where they protect an actual failure mode. Keep network tests deterministic; do not use private addresses or live public services as test targets. Do not commit photos without redistribution rights, credentials, local caches or personal rider information.

If recorded results change, run `npm run results` and review the generated files. Preserve preregistered pilot records and report failures as well as successes. For Spanish corrections, identify the affected screen and provide the English meaning and corrected Spanish text.

Original code contributions use the repository's MIT license. Third-party material must retain its own terms and attribution. For security reports, see [SECURITY.md](SECURITY.md).
