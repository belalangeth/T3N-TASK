# T3N SDK and Documentation Findings

These findings were discovered while building and verifying the Confidential Invoice Approval Agent on the T3N testnet with `@terminal3/t3n-sdk@5.2.0`.

## 1. Contract descriptor field names differ from older examples

The current SDK accepts `returns` for a function return schema. Using the older `returns_schema` spelling caused descriptor validation to fail.

**Impact:** descriptor publication fails before the contract can be presented to reviewers.

**Resolution used here:** the descriptor uses `returns` and was published and read back successfully.

## 2. Function invocation uses camelCase SDK parameters

The SDK invocation surface expects `functionName`, while the contract wire payload uses snake_case field names such as `invoice_id`, `vendor_id`, and `purchase_order`.

**Impact:** using `function_name` prevents the intended function call, while sending application camelCase directly produces an invalid contract payload.

**Resolution used here:** the agent wrapper maps application fields to the T3N wire format and calls the SDK with `functionName`.

## 3. Delegated agents require their own funded balance

Delegation authorization and credit metering are tied to the agent DID. Tenant signup credits did not make a separate agent DID executable.

**Impact:** an authenticated agent with zero balance receives `InsufficientCredit` even when the tenant grant is valid.

**Resolution used here:** a separate funded agent identity was used. Its balance decreased after delegated `evaluate-invoice`, proving that the delegated call used the agent identity.

## Reproduction and evidence

The repository contains the scripts used to reproduce the integration:

* `scripts/finalize-descriptor.mjs`
* `scripts/verify-agent-delegation.mjs`
* `scripts/verify-agent-grant.mjs`
* `scripts/agent-balance-check.mjs`

The final delegated checks were:

* `evaluate-invoice`: authorised and returned `approve`
* `set-policy`: denied with `function_not_delegated`

No API keys, passwords, or private invoice data are included in this report.