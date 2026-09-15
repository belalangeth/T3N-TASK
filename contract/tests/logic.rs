use t3n_invoice_contract::{evaluate_invoice, Invoice, Policy};

fn invoice(id: &str, amount: u64, currency: &str) -> Invoice {
    Invoice {
        invoice_id: id.into(),
        vendor_id: "vendor-1".into(),
        amount,
        currency: currency.into(),
        purchase_order: "PO-1".into(),
    }
}

#[test]
fn valid_invoice_is_approved() {
    let result = evaluate_invoice(
        &invoice("INV-1", 4200, "USD"),
        &Policy {
            max_auto_approve: 5000,
            allowed_currencies: vec!["USD".into()],
        },
        &[],
    );
    assert_eq!(result.decision, "approve");
    assert_eq!(result.reasons, vec!["invoice satisfies approval policy"]);
}

#[test]
fn over_limit_invoice_needs_review() {
    let result = evaluate_invoice(
        &invoice("INV-2", 5001, "USD"),
        &Policy {
            max_auto_approve: 5000,
            allowed_currencies: vec!["USD".into()],
        },
        &[],
    );
    assert_eq!(result.decision, "review");
    assert!(result.reasons.join(" ").contains("approval limit"));
}

#[test]
fn duplicate_invoice_is_rejected() {
    let result = evaluate_invoice(
        &invoice("INV-1", 100, "USD"),
        &Policy {
            max_auto_approve: 5000,
            allowed_currencies: vec!["USD".into()],
        },
        &["INV-1".into()],
    );
    assert_eq!(result.decision, "reject");
    assert!(result.reasons.join(" ").contains("duplicate"));
}

#[test]
fn invalid_currency_is_rejected() {
    let result = evaluate_invoice(
        &invoice("INV-3", 100, "EUR"),
        &Policy {
            max_auto_approve: 5000,
            allowed_currencies: vec!["USD".into()],
        },
        &[],
    );
    assert_eq!(result.decision, "reject");
    assert!(result.reasons.join(" ").contains("currency"));
}
