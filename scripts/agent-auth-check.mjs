import {
  T3nClient, setEnvironment, loadWasmComponent, fetchTrustedManifest,
  eth_get_address, metamask_sign, createEthAuthInput,
} from '@terminal3/t3n-sdk';

const key = process.env.T3N_AGENT_KEY;
if (!key) throw new Error('T3N_AGENT_KEY is missing');
setEnvironment('testnet');
const address = eth_get_address(key);
const client = new T3nClient({
  trustAnchor: await fetchTrustedManifest('testnet'),
  wasmComponent: await loadWasmComponent(),
  handlers: { EthSign: metamask_sign(address, undefined, key) },
});
await client.handshake();
const auth = await client.authenticate(createEthAuthInput(address));
if (!auth.value?.startsWith('did:t3n:')) throw new Error('invalid agent DID');
console.log(JSON.stringify({ agentDid: auth.value, authenticated: true }, null, 2));
