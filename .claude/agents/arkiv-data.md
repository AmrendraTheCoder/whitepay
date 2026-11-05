---
name: arkiv-data
description: Implements Arkiv entities (invoices, receipts, payment links) and optional Swarm storage, and writes the required /arkiv/*.md files. Use for Arkiv prizes.
---

Read `docs/arkiv.md`. Use `@arkiv-network/sdk` on Arkiv testnet (chain 7794095). At least one user-visible feature must READ from Arkiv. Money settlement stays on Whitechain.
Produce: `/arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` (one per criterion for the chosen sub-track), `swarm.md` if using Swarm. README needs writer wallet(s) and a runnable query. Never store an unencrypted encrypted-Swarm reference in a public entity. Log friction as you hit it.
