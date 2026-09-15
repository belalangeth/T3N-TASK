import {
  T3nClient, TenantClient, setEnvironment, loadWasmComponent,
  fetchTrustedManifest, getNodeUrl, eth_get_address, metamask_sign,
  createEthAuthInput,
} from '@terminal3/t3n-sdk';

const key = process.env.T3N_API_KEY;
if (!key) throw new Error('T3N_API_KEY is missing');
setEnvironment('testnet');
const address = eth_get_address(key);
const t3n = new T3nClient({ trustAnchor: await fetchTrustedManifest('testnet'), wasmComponent: await loadWasmComponent(), handlers: { EthSign: metamask_sign(address, undefined, key) } });
await t3n.handshake();
const tenantDid = (await t3n.authenticate(createEthAuthInput(address))).value;
const tenant = new TenantClient({ environment: 'testnet', t3n, tenantDid, baseUrl: getNodeUrl() });
const page = await tenant.contracts.listDetailed();
const row = page.contracts.find((item) => item.short_name === 'invoice-approval');
if (!row) throw new Error('contract missing');
const invoke = (input) => tenant.contracts.execute('invoice-approval', { version: row.version, functionName: 'evaluate-invoice', input });
const runId = Date.now();
const base = { invoice_id: `INV-FAIL-${runId}`, vendor_id: 'vendor-acme', amount: 1200, currency: 'USD', purchase_order: `PO-FAIL-${runId}` };
const first = await invoke(base);
const duplicate = await invoke(base);
const overLimit = await invoke({ ...base, invoice_id: `INV-FAIL-LIMIT-${runId}`, amount: 5001 });
const badCurrency = await invoke({ ...base, invoice_id: `INV-FAIL-CURRENCY-${runId}`, currency: 'EUR' });
const observed = { first: first.decision, duplicate: duplicate.decision, overLimit: overLimit.decision, badCurrency: badCurrency.decision };
if (JSON.stringify(observed) !== JSON.stringify({ first: 'approve', duplicate: 'reject', overLimit: 'review', badCurrency: 'reject' })) throw new Error(`unexpected decisions: ${JSON.stringify(observed)}`);
console.log(JSON.stringify({ verified: true, observed }, null, 2));
