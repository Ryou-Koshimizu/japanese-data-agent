# Engineering requirements

This repository is evidence for freelance engineering reviews targeting roughly JPY 500,000 engagements. Demonstrate maintainability, safe execution, reproducible verification and honest limitations; do not promise contract acquisition.

- Never commit secrets, personal data, real customer data or fabricated metrics.
- Claude keys are configured by the person running their own environment.
- Core harness must work independently of the web UI; dependency injection is required.
- Every generated/repaired SQL goes through AST validation and a read-only DB role.
- Preserve SQLSTATE-only repair feedback and bounded outputs/history.
- Test adversarial SQL, retry bounds, DB permission denial, and result-based eval.
- Label demo fixtures explicitly; never count mock tests as LLM accuracy.
- Run typecheck, test and build for source changes. Verify E2E when UI changes.
- Keep commits focused by feature. Document design tradeoffs in ADRs.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
