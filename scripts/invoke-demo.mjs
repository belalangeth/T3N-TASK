import {
  T3nClient, TenantClient, setEnvironment, loadWasmComponent,
  fetchTrustedManifest, getNodeUrl, eth_get_address, metamask_sign,
  createEthAuthInput,
} from '@terminal3/t3n-sdk';
import { createInvoiceAgent } from '../src/agent.mjs';

const key = process.env.T3N_API_KEY;
if (!key) throw new Error('T3N_API_KEY is missing');
setEnvironment('testnet');
const wasmComponent = await loadWasmComponent();
const address = eth_get_address(key);
const t3n = new T3nClient({ trustAnchor: await fetchTrustedManifest('testnet'), wasmComponent, handlers: { EthSign: metamask_sign(address, undefined, key) } });
await t3n.handshake();
const tenantDid = (await t3n.authenticate(createEthAuthInput(address))).value;
const tenant = new TenantClient({ environment: 'testnet', t3n, tenantDid, baseUrl: getNodeUrl() });
const rows = await tenant.contracts.listDetailed();
const contract = rows.contracts.find((row) => row.short_name === 'invoice-approval');
if (!contract || contract.status !== 'active' || !contract.descriptor) throw new Error('deployed contract descriptor not found');
const agent = createInvoiceAgent({ execute: (payload) => tenant.contracts.execute('invoice-approval', { version: contract.version, functionName: payload.functionName, input: payload.input }) });
const demoId = `INV-DEMO-${Date.now()}`;
const result = await agent.review({ invoiceId: demoId, vendorId: 'vendor-acme', amount: 1200, currency: 'USD', purchaseOrder: `PO-DEMO-${demoId}` });
console.log(JSON.stringify({ verified: true, contract: contract.name, version: contract.version, descriptor: contract.descriptor, result }, null, 2));
