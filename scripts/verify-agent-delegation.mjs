import {
  T3nClient, setEnvironment, loadWasmComponent, fetchTrustedManifest,
  eth_get_address, metamask_sign, createEthAuthInput,
} from '@terminal3/t3n-sdk';

const tenantKey = process.env.T3N_API_KEY;
const agentKey = process.env.T3N_AGENT_KEY;
if (!tenantKey || !agentKey) throw new Error('T3N_API_KEY and T3N_AGENT_KEY are required');
setEnvironment('testnet');
const trustAnchor = await fetchTrustedManifest('testnet');
const wasmComponent = await loadWasmComponent();

async function authenticated(key) {
  const address = eth_get_address(key);
  const client = new T3nClient({ trustAnchor, wasmComponent, handlers: { EthSign: metamask_sign(address, undefined, key) } });
  await client.handshake();
  const auth = await client.authenticate(createEthAuthInput(address));
  return { client, did: auth.value };
}

const tenant = await authenticated(tenantKey);
const agent = await authenticated(agentKey);
const contractId = `z:${tenant.did.slice(8)}:invoice-approval`;
const grant = {
  grantee: agent.did,
  contract_id: contractId,
  functions: ['evaluate-invoice'],
  scopes: ['invoice-approval'],
  version_req: '0.1.2',
};
const mergeResult = await tenant.client.updateMemberDelegation(grant);
const invoice = { invoice_id: `INV-AGENT-${Date.now()}`, vendor_id: 'vendor-acme', amount: 1200, currency: 'USD', purchase_order: 'PO-AGENT' };
const allowed = await agent.client.executeAndDecode({ contract_id: contractId, contract_version: '0.1.2', function_name: 'evaluate-invoice', input: invoice, pii_did: tenant.did });
let denied = false;
let deniedMessage = '';
try {
  await agent.client.executeAndDecode({ contract_id: contractId, contract_version: '0.1.2', function_name: 'set-policy', input: { max_auto_approve: 1, allowed_currencies: ['USD'] }, pii_did: tenant.did });
} catch (error) {
  denied = true;
  deniedMessage = error instanceof Error ? error.message : 'authorization denied';
}
if (!denied) throw new Error('set-policy unexpectedly succeeded for restricted agent');
if (allowed?.decision !== 'approve') throw new Error(`delegated evaluate did not approve: ${JSON.stringify(allowed)}`);
console.log(JSON.stringify({ verified: true, tenantDid: tenant.did, agentDid: agent.did, contractId, grant, preservedRows: mergeResult.preservedRows.length, allowedDecision: allowed.decision, deniedSetPolicy: denied, deniedReason: deniedMessage.slice(0, 160) }, null, 2));
