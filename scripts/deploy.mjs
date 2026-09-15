import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
const t3n = new T3nClient({
  trustAnchor,
  wasmComponent,
  handlers: { EthSign: metamask_sign(address, undefined, apiKey) },
});
await t3n.handshake();
const auth = await t3n.authenticate(createEthAuthInput(address));
const tenantDid = auth.value;
if (!tenantDid?.startsWith('did:t3n:')) throw new Error('invalid authenticated tenant DID');

const tenant = new TenantClient({ environment: 'testnet', t3n, tenantDid, baseUrl: getNodeUrl() });
const wasmPath = new URL('../contract/target/wasm32-wasip2/release/t3n_invoice_contract.wasm', import.meta.url);
const wasm = await readFile(wasmPath);
const sourceHash = createHash('sha256').update(wasm).digest('hex');
const tail = 'invoice-approval';
const version = '0.1.0';

const registered = await tenant.contracts.register({ tail, version, wasm, source_hash: sourceHash });
const contractId = registered.contract_id;

await tenant.maps.create({
  tail,
  visibility: 'private',
  writers: { only: [contractId] },
  readers: { only: [contractId] },
});
await tenant.maps.entrySet(tail, 'policy', JSON.stringify({
  max_auto_approve: 5000,
  allowed_currencies: ['USD'],
}));

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
        input: { invoice_id: 'string', vendor_id: 'string', amount: 'u64', currency: 'string', purchase_order: 'string' },
        output: { decision: 'approve | review | reject', reasons: 'string[]', invoice: 'redacted summary' },
      },
      {
        name: 'set-policy',
        summary: 'Configure the tenant approval policy. Restrict this function to an administrator grant.',
        input: { max_auto_approve: 'u64', allowed_currencies: 'string[]' },
        output: { status: 'policy_updated' },
      },
    ],
  },
});

console.log('T3N deployment succeeded');
console.log(`tenant=${tenantDid.slice(0, 16)}...`);
console.log(`contract=${registered.name}`);
console.log(`contract_id=${contractId}`);
console.log(`source_sha256=${sourceHash}`);
