import { normalizeInvoice } from './decision.mjs';

const CONTRACT_FIELDS = [
  ['invoice_id', 'invoiceId'],
  ['vendor_id', 'vendorId'],
  ['amount', 'amount'],
  ['currency', 'currency'],
  ['purchase_order', 'purchaseOrder'],
];

function contractInput(invoice) {
  const normalized = normalizeInvoice(invoice);
  return Object.fromEntries(CONTRACT_FIELDS.map(([wire, field]) => [wire, normalized[field]]));
}

export function createInvoiceAgent({ execute }) {
  if (typeof execute !== 'function') throw new TypeError('execute must be a function');

  return {
    async review(invoice) {
      const input = contractInput(invoice);
      return execute({ functionName: 'evaluate-invoice', input });
    },
  };
}

export function createT3nExecutor({ client, contractId, contractVersion }) {
  if (!client || typeof client.executeAndDecode !== 'function') throw new TypeError('client is required');
  if (!contractId) throw new TypeError('contractId is required');
  if (!contractVersion) throw new TypeError('contractVersion is required');

  return ({ functionName, input }) => client.executeAndDecode({
    contract_id: contractId,
    contract_version: contractVersion,
    function_name: functionName,
    input,
  });
}
