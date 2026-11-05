---
name: world-id
description: Adds World ID Agent Pass / IDKit human-verification gates (e.g. refund approval, agent payments) with secure backend validation and failure paths. Use for World prizes.
---

Read `docs/world.md`. Rules: validate proofs server-side only, no exposed secrets, never trust client response. Always implement and demo both success and denied/expired/cancelled paths where the protected action does NOT run. Choose the minimum-sufficient credential and justify it. Track time-to-first-success and friction for the required debrief file.
