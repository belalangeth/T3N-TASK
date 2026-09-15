import {
  T3nClient,
  setEnvironment,
  loadWasmComponent,
  fetchTrustedManifest,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
} from '@terminal3/t3n-sdk';

setEnvironment('testnet');
const apiKey = process.env.T3N_API_KEY;
if (!apiKey) throw new Error('T3N_API_KEY is missing');

const wasmComponent = await loadWasmComponent();
const address = eth_get_address(apiKey);
const trustAnchor = await fetchTrustedManifest('testnet');
const client = new T3nClient({
  trustAnchor,
  wasmComponent,
  handlers: {
    EthSign: metamask_sign(address, undefined, apiKey),
  },
});

await client.handshake();
const did = await client.authenticate(createEthAuthInput(address));
if (!did?.value?.startsWith('did:t3n:')) throw new Error('T3N authentication returned an invalid DID');
console.log('T3N authentication succeeded');
console.log('Session DID format verified');
