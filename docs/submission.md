# Submission Draft

## Project

**Confidential Invoice Approval Agent**

## One line pitch

A T3N TEE agent that approves routine invoices without exposing tenant approval policy or duplicate invoice state to the host agent.

## What is real

* Rust WASM component built for `wasm32-wasip2`.
* T3N private KV map stores policy and `seen:<invoice_id>` markers.
* Contract is registered and active in T3N sandbox as `z:<tenant>:invoice-approval`, version `0.1.2`.
* Descriptor is published and read back from T3N.
* TypeScript agent wrapper validates and allowlists input before dispatch.

## Demo evidence

```json
{
  "valid_invoice": "approve",
  "duplicate_invoice": "reject",
  "over_limit_invoice": "review",
  "unsupported_currency": "reject"
}
```

The live verification scripts are:

* `scripts/invoke-demo.mjs`
* `scripts/verify-failure-paths.mjs`

Visual evidence is saved at:

* `docs/t3n-verification-full.png`: contract verification report
* `docs/dapp-demo-decision.png`: thin dapp with live delegated `APPROVE` result

## Privacy boundary

The contract returns invoice ID, vendor ID, amount, currency, decision, and reasons. It does not return purchase order values, tenant policy, or the duplicate-state map contents. The WASM component imports only tenant context, logging, and KV store.

## Reviewer runbook

```bash
npm install
npm test
cargo test --manifest-path contract/Cargo.toml
cargo build --manifest-path contract/Cargo.toml --target wasm32-wasip2 --release
node scripts/invoke-demo.mjs
node scripts/verify-failure-paths.mjs
```

Set `T3N_API_KEY` in the environment. Do not commit any environment file.

* Separate agent DID authentication: verified
* Delegation grant readback: verified
* `evaluate-invoice` authorization check: `authorised: true`
* `set-policy` authorization check: `authorised: false`
* Metered delegated invocation: verified with a separate funded agent DID
* Delegated `evaluate-invoice`: approved
* Delegated `set-policy`: rejected with `function_not_delegated`
* Obsolete agent grant: removed and read back absent

## External publication checklist

* [ ] Create or select the final public GitHub repository.
* [ ] Add a public Google Doc with the README content and demo evidence.
* [ ] Capture screenshots of the repo, descriptor, and live demo output.
* [ ] Decide whether to report SDK descriptor schema discoveries as a T3N developer experience note.
* [ ] Obtain approval before pushing or submitting to Superteam.
