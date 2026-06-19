# DataStore Schema — Salla Returns v2

Verified against the live Catalyst project `Salla-Exchange-and-Returns-Tracker` (2026-06-17).
**Verdict: the existing schema is solid and reused as-is.** Only the 3 additive changes below are new.
All tables carry `tenant_id` (FK → `tenants.ROWID`). System columns (`ROWID`, `CREATORID`,
`CREATEDTIME`, `MODIFIEDTIME`) omitted. ZCQL: BIGINT/FK unquoted in WHERE; ≤200 rows; no JOIN/OFFSET.

## Tables (as built)

| Table | Key columns | Notes |
|---|---|---|
| `tenants` | salla_store_id (uniq), store_name, store_domain, timezone, plan_code, flags_json, status, portal_public_slug (uniq) | one row per Salla store |
| `salla_oauth_tokens` | tenant_id, access_token_enc, refresh_token_enc, token_type, scopes, access_token_expires_at, last_token_refresh_at, token_status, installed_at, uninstalled_at, tenant_unique_key (uniq) | tokens AES-256-GCM encrypted |
| `oauth_states` | tenant_id, state (uniq), expires_at | custom-mode OAuth CSRF state |
| `return_rules` | tenant_id, tenant_rules_key (uniq), rules_version, default_return_window_days, auto_approve_enabled, auto_approve_max_value, auto_approve_reason_whitelist_json, category_rules_json, exchange_allowed, store_credit_allowed, refund_allowed, require_images_for_reasons_json, sku_restrictions_json, updated_by_* , last_updated_at | **rules live here, not in tenant.flags** |
| `return_requests` | return_number (uniq), order_number, order_id_external, customer_contact_masked, customer_contact_hash, requested_resolution, status (machine), status_reason, requested_at/approved_at/received_at/resolved_at, policy_snapshot_json, notes_internal, notes_customer, total_items_count, total_request_value, exchange_order_id_external, refund_transaction_id_external, store_credit_ref_external, is_warranty, customer_cancelled_at | + **`bank_iban_enc` (NEW)** |
| `return_items` | return_request_id, order_item_id_external, sku, product_name, variant_name, category_id_external, quantity, unit_price, reason_code, reason_note, decision | + **`exchange_variant_id` (NEW)** |
| `return_attachments` | return_request_id, file_role, filestore_path, content_type, file_size_bytes, checksum_sha256, uploaded_by_actor_*, is_deleted, deleted_at, meta_json | soft-delete + checksum built-in |
| `return_shipments` | return_request_id, mode (manual/auto), carrier_name, tracking_number, tracking_url, shipment_id_external, status, status_last_updated_at, label_attachment_id, raw_tracking_json | reverse logistics |
| `return_outcomes` | return_request_id, outcome_type (refund/exchange/store_credit), outcome_amount, currency, status, completed_at, reference_id_external, raw_provider_response_json, failure_reason | **resolution execution ledger** — sallaResolution writes here |
| `otp_sessions` | tenant_id, channel, contact_hash, otp_hash, expires_at, attempt_count, max_attempts, locked_until, verified_at, request_ip, user_agent, order_number | email-OTP fallback |
| `portal_sessions` | tenant_id, session_token_hash, contact_hash, order_number, expires_at, created_ip, last_seen_at | customer session |
| `webhook_events_salla` | tenant_id, event_type, event_id_external, idempotency_key (uniq), signature_valid, payload_json, received_at, processed_at, process_status, failure_reason, retry_count | idempotent webhook log |
| `usage_monthly` | tenant_id, year_month, tenant_month_key (uniq), returns_created, attachments_uploaded, auto_approved_count, last_aggregated_at | real `automation_pct` source |
| `audit_events` | tenant_id, entity_type, entity_rowid, event_type, actor_type, actor_id, before_json, after_json, meta_json, event_time | immutable audit |

## Additive changes for v2 (apply in Catalyst Console → DataStore)

1. **`return_items.exchange_variant_id`** — `varchar`, nullable. Replacement SKU/variant id for exchange resolution.
2. **`return_requests.bank_iban_enc`** — `encrypted text`, nullable. COD refund IBAN (PII; AES-GCM at app layer too).
3. **Billing (optional):** for Salla App Subscriptions, either add a `subscriptions` table
   (tenant_id, salla_plan_id, status, period_end, monthly_quota) **or** ride on `tenants.plan_code` +
   `usage_monthly` for the MVP (chosen default). Add only if/when billing webhooks are wired.

> Until #1/#2 are applied, the code degrades gracefully: `exchange_variant_id` and the IBAN are
> persisted inside `return_requests.policy_snapshot_json` as a fallback so nothing breaks.
