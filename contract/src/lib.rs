//! Confidential invoice approval contract for T3N.
//!
//! The pure decision function is tested on the native target. On wasm32,
//! policy and duplicate markers live in the tenant KV namespace. The contract
//! returns a redacted summary and never logs invoice identifiers or amounts.
#![warn(clippy::style, missing_debug_implementations)]
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

extern crate alloc;

use alloc::{string::String, vec::Vec};
use serde::{Deserialize, Serialize};

pub const CONTRACT_VERSION: &str = "0.1.0";
const DEFAULT_POLICY_KEY: &[u8] = b"policy";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct Invoice {
    pub invoice_id: String,
    pub vendor_id: String,
    pub amount: u64,
    pub currency: String,
    pub purchase_order: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct Policy {
    pub max_auto_approve: u64,
    pub allowed_currencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Decision {
    pub decision: String,
    pub reasons: Vec<String>,
    pub invoice: InvoiceSummary,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct InvoiceSummary {
    pub invoice_id: String,
    pub vendor_id: String,
    pub amount: u64,
    pub currency: String,
}

pub fn evaluate_invoice(invoice: &Invoice, policy: &Policy, seen_ids: &[String]) -> Decision {
    let summary = InvoiceSummary {
        invoice_id: invoice.invoice_id.clone(),
        vendor_id: invoice.vendor_id.clone(),
        amount: invoice.amount,
        currency: invoice.currency.clone(),
    };
    if seen_ids.iter().any(|id| id == &invoice.invoice_id) {
        return decision("reject", "duplicate invoice identifier", summary);
    }
    if !policy.allowed_currencies.is_empty()
        && !policy
            .allowed_currencies
            .iter()
            .any(|c| c.eq_ignore_ascii_case(&invoice.currency))
    {
        return decision("reject", "currency is not allowed by policy", summary);
    }
    if invoice.amount > policy.max_auto_approve {
        return decision("review", "amount exceeds the auto approval limit", summary);
    }
    decision("approve", "invoice satisfies approval policy", summary)
}

fn decision(status: &str, reason: &str, invoice: InvoiceSummary) -> Decision {
    Decision {
        decision: status.into(),
        reasons: vec![reason.into()],
        invoice,
    }
}

fn parse_invoice(bytes: &[u8]) -> Result<Invoice, String> {
    let invoice: Invoice = serde_json::from_slice(bytes)
        .map_err(|error| alloc::format!("invalid invoice input: {error}"))?;
    if invoice.invoice_id.trim().is_empty() {
        return Err("invoice_id is required".into());
    }
    if invoice.vendor_id.trim().is_empty() {
        return Err("vendor_id is required".into());
    }
    if invoice.amount == 0 {
        return Err("amount must be positive".into());
    }
    if invoice.currency.len() != 3 || !invoice.currency.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err("currency must be a three letter ISO code".into());
    }
    if invoice.purchase_order.trim().is_empty() {
        return Err("purchase_order is required".into());
    }
    Ok(Invoice {
        currency: invoice.currency.to_ascii_uppercase(),
        ..invoice
    })
}

fn parse_policy(bytes: &[u8]) -> Result<Policy, String> {
    let policy: Policy = serde_json::from_slice(bytes)
        .map_err(|error| alloc::format!("invalid policy input: {error}"))?;
    if policy.max_auto_approve == 0 {
        return Err("max_auto_approve must be positive".into());
    }
    if policy
        .allowed_currencies
        .iter()
        .any(|c| c.len() != 3 || !c.chars().all(|x| x.is_ascii_alphabetic()))
    {
        return Err("allowed_currencies must contain three letter ISO codes".into());
    }
    Ok(Policy {
        allowed_currencies: policy
            .allowed_currencies
            .into_iter()
            .map(|c| c.to_ascii_uppercase())
            .collect(),
        ..policy
    })
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::*;
    use crate::bindings::host::{
        interfaces::{kv_store, logging},
        tenant::tenant_context,
    };

    pub fn map_name() -> String {
        alloc::format!(
            "z:{}:invoice-approval",
            hex::encode(tenant_context::tenant_did())
        )
    }

    fn read_policy() -> Result<Policy, String> {
        let bytes = kv_store::get(&map_name(), DEFAULT_POLICY_KEY)
            .map_err(|e| alloc::format!("policy read failed: {e}"))?
            .ok_or("policy is not configured")?;
        parse_policy(&bytes)
    }

    fn duplicate_exists(invoice_id: &str) -> Result<bool, String> {
        let key = alloc::format!("seen:{invoice_id}");
        Ok(kv_store::get(&map_name(), key.as_bytes())
            .map_err(|e| alloc::format!("duplicate check failed: {e}"))?
            .is_some())
    }

    pub fn evaluate(input: &[u8]) -> Result<Vec<u8>, String> {
        let invoice = parse_invoice(input)?;
        let policy = read_policy()?;
        let seen = if duplicate_exists(&invoice.invoice_id)? {
            vec![invoice.invoice_id.clone()]
        } else {
            Vec::new()
        };
        let result = evaluate_invoice(&invoice, &policy, &seen);
        if result.decision == "approve" {
            let key = alloc::format!("seen:{}", invoice.invoice_id);
            kv_store::put(&map_name(), key.as_bytes(), b"1")
                .map_err(|e| alloc::format!("duplicate marker write failed: {e}"))?;
        }
        let _ = logging::info("invoice evaluated inside TEE");
        serde_json::to_vec(&result).map_err(|e| alloc::format!("response encoding failed: {e}"))
    }

    pub fn set_policy(input: &[u8]) -> Result<Vec<u8>, String> {
        let policy = parse_policy(input)?;
        let bytes = serde_json::to_vec(&policy)
            .map_err(|e| alloc::format!("policy encoding failed: {e}"))?;
        kv_store::put(&map_name(), DEFAULT_POLICY_KEY, &bytes)
            .map_err(|e| alloc::format!("policy write failed: {e}"))?;
        let _ = logging::info("invoice policy updated inside TEE");
        Ok(br#"{"status":"policy_updated"}"#.to_vec())
    }
}

#[cfg(target_arch = "wasm32")]
mod bindings {
    use super::*;
    wit_bindgen::generate!({
        world: "invoice-approval",
        path: "wit",
        additional_derives: [serde::Deserialize, serde::Serialize],
        generate_all,
    });

    struct Component;
    impl exports::z::invoice_approval::contracts::Guest for Component {
        fn evaluate_invoice(
            req: exports::z::invoice_approval::contracts::GenericInput,
        ) -> Result<Vec<u8>, String> {
            wasm::evaluate(&req.input.ok_or("evaluate-invoice: missing input")?)
        }
        fn set_policy(
            req: exports::z::invoice_approval::contracts::GenericInput,
        ) -> Result<Vec<u8>, String> {
            wasm::set_policy(&req.input.ok_or("set-policy: missing input")?)
        }
    }
    export!(Component);
}
