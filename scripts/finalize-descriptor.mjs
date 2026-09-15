import {
  T3nClient,
  TenantClient,
  setEnvironment,
  loadWasmComponent,
  fetchTrustedManifest,
  getNodeUrl,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
} from '@terminal3/t3n-sdk';

const apiKey = process.env.T3N_API_KEY;
if (!apiKey) throw new Error('T3N_API_KEY is missing');
setEnvironment('testnet');
const wasmComponent = await loadWasmComponent();
const address = eth_get_address(apiKey);
const trustAnchor = await fetchTrustedManifest('testnet');
const t3n = new T3nClient({ trustAnchor, wasmComponent, handlers: { EthSign: metamask_sign(address, undefined, apiKey) } });
await t3n.handshake();
const auth = await t3n.authenticate(createEthAuthInput(address));
const tenantDid = auth.value;
const tenant = new TenantClient({ environment: 'testnet', t3n, tenantDid, baseUrl: getNodeUrl() });
const tail = 'invoice-approval';
const version = '0.1.0';

await tenant.contracts.setDescriptor({
  tail,
  version,
  descriptor: {
    name: 'Confidential Invoice Approval Agent',
    summary: 'A TEE backed enterprise agent that evaluates invoices against private tenant policy.',
    tags: ['enterprise', 'invoice', 'privacy', 'approval', 'tee'],
    functions: [
      {
        name: 'evaluate-invoice',
        summary: 'Validate and classify an invoice without exposing tenant policy or duplicate state.',
        mutates: true,
        auth: {},
        params_schema: { type: 'object', properties: { invoice_id: { type: 'string' }, vendor_id: { type: 'string' }, amount: { type: 'integer', minimum: 0 }, currency: { type: 'string', pattern: '^[A-Z]{3}$' }, purchase_order: { type: 'string' } }, required: ['invoice_id', 'vendor_id', 'amount', 'currency', 'purchase_order'], additionalProperties: false },
        returns: { type: 'object', properties: { decision: { type: 'string', enum: ['approve', 'review', 'reject'] }, reasons: { type: 'array', items: { type: 'string' } }, invoice: { type: 'object' } }, required: ['decision', 'reasons', 'invoice'], additionalProperties: false },
        errors: ['invalid-input', 'duplicate-invoice', 'policy-unavailable', 'storage-error'],
        examples: [{ invoice_id: 'INV-1001', vendor_id: 'vendor-acme', amount: 1200, currency: 'USD', purchase_order: 'PO-1001' }],
      },
      {
        name: 'set-policy',
        summary: 'Configure the tenant approval policy. Restrict this function to an administrator grant.',
        mutates: true,
        auth: { admin: true },
        params_schema: { type: 'object', properties: { max_auto_approve: { type: 'integer', minimum: 0 }, allowed_currencies: { type: 'array', items: { type: 'string', pattern: '^[A-Z]{3}$' }, minItems: 1 } }, required: ['max_auto_approve', 'allowed_currencies'], additionalProperties: false },
        returns: { type: 'object', properties: { status: { type: 'string', const: 'policy_updated' } }, required: ['status'], additionalProperties: false },
        errors: ['invalid-policy', 'storage-error'],
        examples: [{ max_auto_approve: 5000, allowed_currencies: ['USD'] }],
      },
    ],
  },
});
const discovered = await t3n.execute({ action: 'discover', query: { type: 'describe-contract', contract_id: `z:${tenantDid.slice(8)}:${tail}` } });
console.log('T3N descriptor finalized');
console.log(`tenant=${tenantDid.slice(0, 16)}...`);
console.log(`descriptor_verified=${Boolean(discovered)}`);
