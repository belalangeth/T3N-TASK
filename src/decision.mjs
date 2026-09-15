const ISO_CURRENCY = /^[A-Z]{3}$/;

export function normalizeInvoice(input) {
  if (!input || typeof input !== 'object') throw new TypeError('invoice must be an object');
  const invoiceId = String(input.invoiceId ?? '').trim();
  const vendorId = String(input.vendorId ?? '').trim();
  const currency = String(input.currency ?? '').trim().toUpperCase();
  const amount = Number(input.amount);
  const purchaseOrder = String(input.purchaseOrder ?? '').trim();

  if (!invoiceId) throw new TypeError('invoiceId is required');
  if (!vendorId) throw new TypeError('vendorId is required');
  if (!Number.isFinite(amount) || amount <= 0) throw new TypeError('amount must be positive');
  if (!ISO_CURRENCY.test(currency)) throw new TypeError('currency must be a three letter ISO code');
  if (!purchaseOrder) throw new TypeError('purchaseOrder is required');

  return { invoiceId, vendorId, amount, currency, purchaseOrder };
}

export function evaluateInvoice(input, policy = {}) {
  const invoice = normalizeInvoice(input);
  const maxAutoApprove = Number(policy.maxAutoApprove ?? 0);
  const allowedCurrencies = new Set((policy.allowedCurrencies ?? []).map((value) => String(value).toUpperCase()));
  const seenInvoiceIds = new Set((policy.seenInvoiceIds ?? []).map(String));
  const reasons = [];

  if (seenInvoiceIds.has(invoice.invoiceId)) {
    return { decision: 'reject', reasons: ['duplicate invoice identifier'], invoice };
  }
  if (allowedCurrencies.size && !allowedCurrencies.has(invoice.currency)) {
    return { decision: 'reject', reasons: ['currency is not allowed by policy'], invoice };
  }
  if (!Number.isFinite(maxAutoApprove) || maxAutoApprove <= 0) {
    return { decision: 'review', reasons: ['approval policy has no valid auto approval limit'], invoice };
  }
  if (invoice.amount > maxAutoApprove) {
    return { decision: 'review', reasons: ['amount exceeds the auto approval limit'], invoice };
  }

  reasons.push('invoice satisfies approval policy');
  return { decision: 'approve', reasons, invoice };
}
