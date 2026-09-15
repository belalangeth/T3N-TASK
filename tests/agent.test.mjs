import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoiceAgent } from '../src/agent.mjs';

test('agent delegates sanitized invoice input and returns decision', async () => {
  let call;
  const agent = createInvoiceAgent({
    execute: async (request) => { call = request; return { decision: 'approve', reasons: ['policy ok'] }; },
  });
  const result = await agent.review({
    invoiceId: 'INV-2001', vendorId: 'vendor-1', amount: 150,
    currency: 'USD', purchaseOrder: 'PO-1', internalNote: 'ignore this',
  });
  assert.equal(result.decision, 'approve');
  assert.equal(call.functionName, 'evaluate-invoice');
  assert.deepEqual(call.input, {
    invoice_id: 'INV-2001', vendor_id: 'vendor-1', amount: 150,
    currency: 'USD', purchase_order: 'PO-1',
  });
});

test('agent fails closed when contract execution fails', async () => {
  const agent = createInvoiceAgent({ execute: async () => { throw new Error('permission denied'); } });
  await assert.rejects(agent.review({
    invoiceId: 'INV-2002', vendorId: 'vendor-1', amount: 150,
    currency: 'USD', purchaseOrder: 'PO-2',
  }), /permission denied/);
});
