import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInvoice } from '../src/decision.mjs';
import { createInvoiceAgent } from '../src/agent.mjs';
import {
  T3nClient, TenantClient, setEnvironment, loadWasmComponent,
  fetchTrustedManifest, getNodeUrl, eth_get_address, metamask_sign,
  createEthAuthInput,
} from '@terminal3/t3n-sdk';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const MAX_BODY = 16 * 1024;
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

export function sanitizeReviewRequest(payload) {
  return normalizeInvoice(payload);
}

export function redactReviewResult(result) {
  return { decision: result?.decision, reasons: Array.isArray(result?.reasons) ? result.reasons : [], invoice: result?.invoice };
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}

export function createDappServer({ review, status, staticDir = ROOT }) {
  if (typeof review !== 'function' || typeof status !== 'function') throw new TypeError('review and status handlers are required');
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/api/review') {
        const result = await review(sanitizeReviewRequest(await readJson(req)));
        return json(res, 200, redactReviewResult(result));
      }
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, await status());
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
      const requested = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = normalize(join(staticDir, requested));
      if (!filePath.startsWith(normalize(staticDir))) return json(res, 404, { error: 'not found' });
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      return res.end(body);
    } catch (error) {
      const message = error instanceof SyntaxError ? 'invalid JSON body' : error instanceof Error ? error.message : 'request failed';
      return json(res, message === 'request body too large' ? 413 : 400, { error: message });
    }
  });
}

async function authenticatedClient(key, trustAnchor, wasmComponent) {
  const address = eth_get_address(key);
  const client = new T3nClient({ trustAnchor, wasmComponent, handlers: { EthSign: metamask_sign(address, undefined, key) } });
  await client.handshake();
  const did = (await client.authenticate(createEthAuthInput(address))).value;
  return { client, did };
}

export async function createT3nRuntime({ tenantKey = process.env.T3N_API_KEY, agentKey = process.env.T3N_AGENT_KEY } = {}) {
  if (!tenantKey || !agentKey) throw new Error('T3N_API_KEY and T3N_AGENT_KEY are required');
  setEnvironment('testnet');
  const trustAnchor = await fetchTrustedManifest('testnet');
  const wasmComponent = await loadWasmComponent();
  const tenantAuth = await authenticatedClient(tenantKey, trustAnchor, wasmComponent);
  const agentAuth = await authenticatedClient(agentKey, trustAnchor, wasmComponent);
  const tenant = new TenantClient({ environment: 'testnet', t3n: tenantAuth.client, tenantDid: tenantAuth.did, baseUrl: getNodeUrl() });
  const contractId = `z:${tenantAuth.did.slice(8)}:invoice-approval`;
  const page = await tenant.contracts.listDetailed();
  const contract = page.contracts.find((row) => row.short_name === 'invoice-approval' && row.status === 'active');
  if (!contract?.descriptor) throw new Error('active invoice contract descriptor not found');
  const delegation = await agentAuth.client.checkDelegation({ contract: contractId, pii_did: tenantAuth.did, functions: ['evaluate-invoice'], scopes: ['invoice-approval'] });
  if (!delegation.authorised) throw new Error('agent delegation is not authorized');
  const agent = createInvoiceAgent({ execute: ({ functionName, input }) => agentAuth.client.executeAndDecode({ contract_id: contractId, contract_version: contract.version, function_name: functionName, input, pii_did: tenantAuth.did }) });
  return {
    review: (invoice) => agent.review(invoice),
    status: async () => ({ network: 'T3N testnet', tenantDid: tenantAuth.did, agentDid: agentAuth.did, contractId, version: contract.version, grantedFunctions: ['evaluate-invoice'], restrictedFunctions: ['set-policy'], authorization: 'delegated' }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  const runtime = await createT3nRuntime();
  const server = createDappServer(runtime);
  server.listen(port, '127.0.0.1', () => console.log(`Invoice Approval dapp listening on http://127.0.0.1:${port}`));
}
