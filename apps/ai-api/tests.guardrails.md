# Manual API Test Scenarios

1. Valid request returns `contractVersion: 1` with schema-valid `commandDrafts`.
2. Unsupported commands are rejected with `command_guardrails_failed`.
3. More than 20 total commands are rejected.
4. Missing or invalid origin/client key is rejected when configured.
5. Empty selection + non-create prompt returns warnings and no command drafts.
