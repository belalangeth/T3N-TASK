import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInvoice, normalizeInvoice } from '../src/decision.mjs';

test('approves a valid invoice within policy', () => {
  const result = evaluateInvoice({
    invoiceId: 'INV-1001',
    vendorId: 'vendor-acme',
    amount: 4200,
    currency: 'USD',
    purchaseOrder: 'PO-77',
  }, { maxAutoApprove: 5000, allowedCurrencies: ['USD'] });
  assert.equal(result.decision, 'approve');
  assert.deepEqual(result.reasons, ['invoice satisfies approval policy']);
});

test('routes invoices above the auto approval limit to review', () => {
  const result = evaluateInvoice({
    invoiceId: 'INV-1002', vendorId: 'vendor-acme', amount: 5001,
    currency: 'USD', purchaseOrder: 'PO-78',
  }, { maxAutoApprove: 5000, allowedCurrencies: ['USD'] });
  assert.equal(result.decision, 'review');
  assert.match(result.reasons.join(' '), /approval limit/i);
});

test('rejects duplicate invoice identifiers', () => {
  const result = evaluateInvoice({
    invoiceId: 'INV-1001', vendorId: 'vendor-acme', amount: 4200,
    currency: 'USD', purchaseOrder: 'PO-77',
  }, { maxAutoApprove: 5000, allowedCurrencies: ['USD'], seenInvoiceIds: ['INV-1001'] });
  assert.equal(result.decision, 'reject');
  assert.match(result.reasons.join(' '), /duplicate/i);
});

test('rejects malformed or unsafe invoice values', () => {
  assert.throws(() => normalizeInvoice({ invoiceId: 'x', vendorId: 'v', amount: -1, currency: 'USD', purchaseOrder: 'po' }), /amount/i);
  assert.throws(() => normalizeInvoice({ invoiceId: 'x', vendorId: 'v', amount: 10, currency: 'US', purchaseOrder: 'po' }), /currency/i);
});
