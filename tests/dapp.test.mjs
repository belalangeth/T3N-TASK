import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReviewRequest, redactReviewResult } from '../web/server.mjs';

test('dapp accepts required invoice fields and strips unknown fields', () => {
  assert.deepEqual(sanitizeReviewRequest({
    invoiceId: 'INV-UI-1', vendorId: 'vendor-ui', amount: 90,
    currency: 'USD', purchaseOrder: 'PO-UI-1', internalNote: 'do not forward',
  }), {
    invoiceId: 'INV-UI-1', vendorId: 'vendor-ui', amount: 90,
    currency: 'USD', purchaseOrder: 'PO-UI-1',
  });
});

test('dapp rejects malformed payloads before T3N invocation', () => {
  assert.throws(() => sanitizeReviewRequest({ invoiceId: 'x', amount: 0 }), /vendorId|currency|purchaseOrder/i);
});

test('dapp returns only safe result fields to the browser', () => {
  assert.deepEqual(redactReviewResult({
    decision: 'approve', reasons: ['ok'], invoice: { invoice_id: 'INV-1', vendor_id: 'v', amount: 90, currency: 'USD' },
    policy: { max_auto_approve: 5000 }, duplicate_state: ['INV-1'], purchase_order: 'private',
  }), {
    decision: 'approve', reasons: ['ok'], invoice: { invoice_id: 'INV-1', vendor_id: 'v', amount: 90, currency: 'USD' },
  });
});
