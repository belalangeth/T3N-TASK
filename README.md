# Confidential Invoice Approval Agent

A privacy preserving enterprise invoice reviewer built for the T3N ADK. The agent sends only the invoice fields needed for a decision. Tenant policy and duplicate state remain inside a T3N TEE contract backed by a private tenant KV map.

## Why this use case

Invoice approval is a useful confidential workflow because the decision needs business sensitive information, but the host agent should not receive tenant policy, duplicate history, or internal notes. The contract returns a redacted invoice summary and a decision only.

## Architecture

```text
Agent client
  | authenticated T3N session
  v
z:<tenant>:invoice-approval  [TEE WASM contract]
  |-- private KV: policy
  |-- private KV: seen:<invoice_id>
  |-- returns: approve | review | reject + redacted summary
```

The contract imports only tenant context, logging, and KV store. The tenant DID is read from the enclave session and is never hardcoded. The map ACL grants access only to the registered contract ID.

## Decision policy

* Reject malformed input, unsupported currency, and duplicate invoice IDs.
* Approve invoices at or below `max_auto_approve`.
* Route larger invoices to `review`.
* Never return purchase order values or policy values.

The seeded demo policy is USD only with an auto approval limit of 5,000.

## Local development

Requirements: Node 20+, Rust, `wasm32-wasip2`, and `wasm-tools`.

```bash
npm install
npm test
cargo test --manifest-path contract/Cargo.toml
cargo fmt --manifest-path contract/Cargo.toml -- --check
cargo build --manifest-path contract/Cargo.toml --target wasm32-wasip2 --release
wasm-tools component wit contract/target/wasm32-wasip2/release/t3n_invoice_contract.wasm
```

Set `T3N_API_KEY` in the environment. Never commit it. Authenticate and verify the session:

```bash
node scripts/auth-check.mjs
```

Deploy or upgrade the contract:

```bash
node scripts/upgrade.mjs
```

Run the live demo and failure path verification:

```bash
node scripts/invoke-demo.mjs
node scripts/verify-failure-paths.mjs
npm run dev
```

`npm run dev` serves the thin demo dapp at `http://127.0.0.1:4173`. The browser never receives either T3N key. The server authenticates the tenant and delegated agent, then returns only the redacted contract result.

The scripts use T3N `testnet` explicitly, matching the current Quickstart. They read the authenticated DID from the session and resolve the active contract version through `listDetailed`.

## Security notes

* Secrets are environment only and are not logged by scripts.
* The contract has no outbound HTTP capability.
* The map is private and contract scoped.
* `set-policy` is separately described and should be exposed only through an administrator grant. The deployment script seeds policy through the tenant owner management surface.
* Example data is synthetic.
* The agent wrapper has an explicit allowlist and converts camelCase application input to the T3N snake_case wire format.
* Error text is intentionally generic at the agent boundary. Raw provider responses are not exposed as business output.

## Verified remote deployment

The T3N testnet deployment was read back successfully after upgrade:

* Contract version: `0.1.2`
* Contract status: `active`
* Descriptor: present with enterprise, invoice, privacy, approval, and tee tags
* Smoke test: `approve` for a valid USD invoice
* Failure paths: duplicate `reject`, over limit `review`, unsupported currency `reject`
* Separate agent DID: `did:t3n:a051c0883bc551ef21846c6eedd7fdb89cb746ec`
* Delegated `evaluate-invoice`: `approve`
* Delegated `set-policy`: denied with `function_not_delegated`
* Obsolete zero-credit agent grant: removed and read back absent

## Project layout

* `src/decision.mjs`: pure policy engine used by local tests
* `src/agent.mjs`: input allowlist and T3N executor seam
* `contract/src/lib.rs`: native tested logic and WASM host adapter
* `contract/wit/world.wit`: least privilege host imports and exported functions
* `scripts/upgrade.mjs`: register, ACL, policy, descriptor, and readback
* `scripts/invoke-demo.mjs`: authenticated live invocation
* `scripts/verify-failure-paths.mjs`: authenticated negative and boundary scenarios
* `scripts/agent-auth-check.mjs`: separate agent identity authentication
* `scripts/verify-agent-grant.mjs`: readback and allow/deny delegation checks
* `docs/t3n-verification-full.png`: full page visual evidence
