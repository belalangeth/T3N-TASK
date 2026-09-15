import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { T3nClient, TenantClient, setEnvironment, loadWasmComponent, fetchTrustedManifest, getNodeUrl, eth_get_address, metamask_sign, createEthAuthInput } from '@terminal3/t3n-sdk';

const key = process.env.T3N_API_KEY;
if (!key) throw new Error('T3N_API_KEY is missing');
setEnvironment('testnet');
const wasm = await readFile(new URL('../contract/target/wasm32-wasip2/release/t3n_invoice_contract.wasm', import.meta.url));
const address = eth_get_address(key);
const t3n = new T3nClient({ trustAnchor: await fetchTrustedManifest('testnet'), wasmComponent: await loadWasmComponent(), handlers: { EthSign: metamask_sign(address, undefined, key) } });
await t3n.handshake();
const tenantDid = (await t3n.authenticate(createEthAuthInput(address))).value;
const tenant = new TenantClient({ environment: 'testnet', t3n, tenantDid, baseUrl: getNodeUrl() });
const tail = 'invoice-approval';
const version = '0.1.2';
const registered = await tenant.contracts.register({ tail, version, wasm, source_hash: createHash('sha256').update(wasm).digest('hex') });
await tenant.maps.update(tail, { visibility: 'private', readers: { only: [registered.contract_id] }, writers: { only: [registered.contract_id] } });
await tenant.maps.entrySet(tail, 'policy', JSON.stringify({ max_auto_approve: 5000, allowed_currencies: ['USD'] }));
await tenant.contracts.setDescriptor({ tail, version, descriptor: {
  name: 'Confidential Invoice Approval Agent',
  summary: 'A TEE backed enterprise agent that evaluates invoices against private tenant policy.',
  tags: ['enterprise', 'invoice', 'privacy', 'approval', 'tee'],
  functions: [
    { name: 'evaluate-invoice', summary: 'Validate and classify an invoice without exposing tenant policy or duplicate state.', mutates: true, auth: {}, params_schema: { type: 'object', properties: { invoice_id: { type: 'string' }, vendor_id: { type: 'string' }, amount: { type: 'integer', minimum: 0 }, currency: { type: 'string', pattern: '^[A-Z]{3}$' }, purchase_order: { type: 'string' } }, required: ['invoice_id', 'vendor_id', 'amount', 'currency', 'purchase_order'], additionalProperties: false }, returns: { type: 'object', properties: { decision: { type: 'string', enum: ['approve', 'review', 'reject'] }, reasons: { type: 'array', items: { type: 'string' } }, invoice: { type: 'object' } }, required: ['decision', 'reasons', 'invoice'], additionalProperties: false }, errors: ['invalid-input', 'duplicate-invoice', 'policy-unavailable', 'storage-error'], examples: [{ invoice_id: 'INV-1001', vendor_id: 'vendor-acme', amount: 1200, currency: 'USD', purchase_order: 'PO-1001' }] },
    { name: 'set-policy', summary: 'Configure the tenant approval policy. Restrict this function to an administrator grant.', mutates: true, auth: { admin: true }, params_schema: { type: 'object', properties: { max_auto_approve: { type: 'integer', minimum: 0 }, allowed_currencies: { type: 'array', items: { type: 'string', pattern: '^[A-Z]{3}$' }, minItems: 1 } }, required: ['max_auto_approve', 'allowed_currencies'], additionalProperties: false }, returns: { type: 'object', properties: { status: { type: 'string', const: 'policy_updated' } }, required: ['status'], additionalProperties: false }, errors: ['invalid-policy', 'storage-error'], examples: [{ max_auto_approve: 5000, allowed_currencies: ['USD'] }] },
  ],
} });
const page = await tenant.contracts.listDetailed();
const found = page.contracts.find((row) => row.short_name === tail && row.version === version);
if (!found || found.status !== 'active' || !found.descriptor) throw new Error('upgrade readback failed');
console.log(JSON.stringify({ deployed: true, contract_id: registered.contract_id, version, descriptor: found.descriptor }, null, 2));
