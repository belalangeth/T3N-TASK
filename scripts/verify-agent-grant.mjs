import { T3nClient, setEnvironment, loadWasmComponent, fetchTrustedManifest, eth_get_address, metamask_sign, createEthAuthInput } from '@terminal3/t3n-sdk';
const tenantKey = process.env.T3N_API_KEY;
const agentKey = process.env.T3N_AGENT_KEY;
if (!tenantKey || !agentKey) throw new Error('T3N_API_KEY and T3N_AGENT_KEY are required');
setEnvironment('testnet');
const trustAnchor = await fetchTrustedManifest('testnet');
const wasmComponent = await loadWasmComponent();
async function auth(key) {
  const address = eth_get_address(key);
  const client = new T3nClient({ trustAnchor, wasmComponent, handlers: { EthSign: metamask_sign(address, undefined, key) } });
  await client.handshake();
  return { client, did: (await client.authenticate(createEthAuthInput(address))).value };
}
const tenant = await auth(tenantKey);
const agent = await auth(agentKey);
const contract = `z:${tenant.did.slice(8)}:invoice-approval`;
const doc = await tenant.client.getMemberDelegation();
const grant = doc.grants.find((item) => item.grantee === agent.did && item.contract_id === contract);
if (!grant) throw new Error('delegation grant was not read back');
const verdict = await agent.client.checkDelegation({ contract, pii_did: tenant.did, functions: ['evaluate-invoice'], scopes: ['invoice-approval'] });
if (!verdict.authorised) throw new Error(`delegation check denied: ${JSON.stringify(verdict)}`);
const restricted = await agent.client.checkDelegation({ contract, pii_did: tenant.did, functions: ['set-policy'], scopes: ['invoice-approval'] });
if (restricted.authorised) throw new Error('set-policy unexpectedly authorized');
console.log(JSON.stringify({ verified: true, agentDid: agent.did, contract, grant: { functions: grant.functions, scopes: grant.scopes, version_req: grant.version_req }, delegationCheck: { authorised: verdict.authorised, disclosed: verdict.disclosed }, restrictedFunctionCheck: { authorised: restricted.authorised, missing: restricted.missing.map((item) => item.functions) } }, null, 2));
