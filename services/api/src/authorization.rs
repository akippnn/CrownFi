use axum::{
    body::{to_bytes, Body},
    extract::{Request, State},
    http::{HeaderMap, Method},
    middleware::Next,
    response::Response,
};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

const MAX_AUTHORIZATION_BODY_BYTES: usize = 2 * 1024 * 1024;
const WEB_TOKEN_HEADER: &str = "x-crownfi-web-token";
const ADMIN_TOKEN_HEADER: &str = "x-admin-demo-token";
const ACTOR_HEADER: &str = "x-crownfi-user-id";
const PAYOUT_WORKER_HEADER: &str = "x-crownfi-payout-worker-token";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Capability {
    AccountRead,
    ManageOverview,
    SiteSettingsRead,
    SiteSettingsWrite,
    OrganizationMembersRead,
    OrganizationMembersManage,
    PageantWrite,
    CatalogueWrite,
    MediaWrite,
    OrderManage,
    OrderRead,
    ProviderEventWrite,
    IntentWrite,
    IntentRead,
    ContractRead,
    ContractWrite,
    ChainEvidenceWrite,
    ReconciliationRead,
    FulfillmentCreate,
    FulfillmentRead,
    FulfillmentOperate,
    PayoutManage,
    PayoutRead,
    SnapshotWrite,
}

impl Capability {
    fn as_str(self) -> &'static str {
        match self {
            Self::AccountRead => "account.read",
            Self::ManageOverview => "manage.overview.read",
            Self::SiteSettingsRead => "site.settings.read",
            Self::SiteSettingsWrite => "site.settings.write",
            Self::OrganizationMembersRead => "organization.members.read",
            Self::OrganizationMembersManage => "organization.members.manage",
            Self::PageantWrite => "pageant.write",
            Self::CatalogueWrite => "catalogue.write",
            Self::MediaWrite => "media.write",
            Self::OrderManage => "order.manage",
            Self::OrderRead => "order.read",
            Self::ProviderEventWrite => "payment.provider_event.write",
            Self::IntentWrite => "stellar.intent.write",
            Self::IntentRead => "stellar.intent.read",
            Self::ContractRead => "contract_registry.read",
            Self::ContractWrite => "contract_registry.write",
            Self::ChainEvidenceWrite => "chain_evidence.write",
            Self::ReconciliationRead => "reconciliation.read",
            Self::FulfillmentCreate => "fulfillment.create",
            Self::FulfillmentRead => "fulfillment.read",
            Self::FulfillmentOperate => "fulfillment.operate",
            Self::PayoutManage => "payout.manage",
            Self::PayoutRead => "payout.read",
            Self::SnapshotWrite => "voting.snapshot.write",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Transport {
    WebInternal,
    AdminApi,
    PayoutWorker,
}

#[derive(Debug, Clone)]
struct Scope {
    organization_id: Option<Uuid>,
    owner_user_id: Option<Uuid>,
    resource_type: Option<&'static str>,
    resource_id: Option<Uuid>,
    conceal_cross_tenant: bool,
}

impl Scope {
    fn site() -> Self {
        Self {
            organization_id: None,
            owner_user_id: None,
            resource_type: None,
            resource_id: None,
            conceal_cross_tenant: false,
        }
    }

    fn user(user_id: Uuid) -> Self {
        Self {
            organization_id: None,
            owner_user_id: Some(user_id),
            resource_type: Some("user"),
            resource_id: Some(user_id),
            conceal_cross_tenant: true,
        }
    }

    fn organization(
        organization_id: Uuid,
        resource_type: &'static str,
        resource_id: Option<Uuid>,
    ) -> Self {
        Self {
            organization_id: Some(organization_id),
            owner_user_id: None,
            resource_type: Some(resource_type),
            resource_id,
            conceal_cross_tenant: true,
        }
    }

    fn owned_resource(
        organization_id: Uuid,
        owner_user_id: Uuid,
        resource_type: &'static str,
        resource_id: Uuid,
    ) -> Self {
        Self {
            organization_id: Some(organization_id),
            owner_user_id: Some(owner_user_id),
            resource_type: Some(resource_type),
            resource_id: Some(resource_id),
            conceal_cross_tenant: true,
        }
    }
}

#[derive(Debug, Clone)]
enum ScopeSource {
    Resolved(Scope),
    FirstEditableOrganization,
}

#[derive(Debug, Clone)]
struct ProtectedPlan {
    transport: Transport,
    capability: Capability,
    scope: ScopeSource,
    expected_actor_user_id: Option<Uuid>,
}

#[derive(Debug, Clone)]
struct TokenGate {
    transport: Transport,
    actor_required: bool,
    expected_actor_user_id: Option<Uuid>,
    local_only: bool,
}

#[derive(Debug, Clone)]
enum RequestClass {
    Public,
    TokenOnly(TokenGate),
    Protected(ProtectedPlan),
    Deny(Transport),
}

#[derive(Debug, Clone)]
struct Principal {
    user_active: bool,
    site_role: Option<String>,
    organization_role: Option<String>,
}

pub async fn enforce(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let (parts, body) = request.into_parts();
    let method = parts.method.clone();
    let path = parts.uri.path().to_string();
    let headers = parts.headers.clone();
    let bytes = to_bytes(body, MAX_AUTHORIZATION_BODY_BYTES)
        .await
        .map_err(|_| ApiError::InvalidRequest("request_body_too_large_or_invalid"))?;
    let body_json = if bytes.is_empty() {
        None
    } else {
        serde_json::from_slice::<Value>(&bytes).ok()
    };

    let class = classify_request(&state, &method, &path, body_json.as_ref()).await?;
    let request = Request::from_parts(parts, Body::from(bytes));

    match class {
        RequestClass::Public => Ok(next.run(request).await),
        RequestClass::TokenOnly(gate) => {
            require_transport(&state, &headers, gate.transport)?;
            if gate.local_only && !state.config.api_mode.starts_with("local") {
                return Err(ApiError::Forbidden);
            }
            let actor_user_id = actor_from_headers(&headers);
            if gate.actor_required && actor_user_id.is_none() {
                return Err(ApiError::Unauthorized);
            }
            if let Some(expected) = gate.expected_actor_user_id {
                if actor_user_id != Some(expected) {
                    return Err(ApiError::Forbidden);
                }
            }
            Ok(next.run(request).await)
        }
        RequestClass::Deny(transport) => {
            require_transport(&state, &headers, transport)?;
            Err(ApiError::Forbidden)
        }
        RequestClass::Protected(plan) => {
            require_transport(&state, &headers, plan.transport)?;
            let actor_user_id = actor_from_headers(&headers).ok_or(ApiError::Unauthorized)?;
            if let Some(expected) = plan.expected_actor_user_id {
                if actor_user_id != expected {
                    let pool = database_pool(&state)?;
                    record_decision(
                        pool,
                        Some(actor_user_id),
                        None,
                        plan.capability,
                        None,
                        None,
                        false,
                        "actor_binding_mismatch",
                        &method,
                        &path,
                    )
                    .await;
                    return Err(ApiError::Forbidden);
                }
            }

            let pool = database_pool(&state)?;
            let scope = match plan.scope {
                ScopeSource::Resolved(scope) => scope,
                ScopeSource::FirstEditableOrganization => {
                    resolve_first_editable_organization(pool, actor_user_id).await?
                }
            };
            let principal = load_principal(pool, actor_user_id, scope.organization_id).await?;
            if !principal.user_active {
                record_decision(
                    pool,
                    Some(actor_user_id),
                    scope.organization_id,
                    plan.capability,
                    scope.resource_type,
                    scope.resource_id,
                    false,
                    "principal_inactive_or_missing",
                    &method,
                    &path,
                )
                .await;
                return Err(ApiError::Unauthorized);
            }

            let (allowed, reason) = authorize_principal(
                actor_user_id,
                &principal,
                plan.capability,
                &scope,
            );
            record_decision(
                pool,
                Some(actor_user_id),
                scope.organization_id,
                plan.capability,
                scope.resource_type,
                scope.resource_id,
                allowed,
                reason,
                &method,
                &path,
            )
            .await;

            if !allowed {
                let has_site_scope = principal.site_role.is_some();
                let has_organization_scope = principal.organization_role.is_some();
                if scope.conceal_cross_tenant && !has_site_scope && !has_organization_scope {
                    return Err(ApiError::NotFound);
                }
                return Err(ApiError::Forbidden);
            }

            Ok(next.run(request).await)
        }
    }
}

async fn classify_request(
    state: &AppState,
    method: &Method,
    path: &str,
    body: Option<&Value>,
) -> Result<RequestClass, ApiError> {
    if is_public_request(method, path) {
        return Ok(RequestClass::Public);
    }

    let segments = split_path(path);
    if segments.is_empty() {
        return Ok(RequestClass::Public);
    }

    if segments.as_slice() == ["internal", "identity", "challenges"]
        && method == Method::POST
    {
        let requested_user_id = body_uuid(body, "requested_user_id");
        let link = body_string(body, "purpose").as_deref() == Some("link");
        return Ok(RequestClass::TokenOnly(TokenGate {
            transport: Transport::WebInternal,
            actor_required: link,
            expected_actor_user_id: if link { requested_user_id } else { None },
            local_only: false,
        }));
    }

    if segments.len() == 5
        && segments[0] == "internal"
        && segments[1] == "identity"
        && segments[2] == "challenges"
        && segments[4] == "consume"
        && method == Method::POST
    {
        let requested_user_id = body_uuid(body, "requested_user_id");
        return Ok(RequestClass::TokenOnly(TokenGate {
            transport: Transport::WebInternal,
            actor_required: requested_user_id.is_some(),
            expected_actor_user_id: requested_user_id,
            local_only: false,
        }));
    }

    if segments.as_slice() == ["internal", "setup", "complete"]
        && method == Method::POST
    {
        return Ok(RequestClass::TokenOnly(TokenGate {
            transport: Transport::WebInternal,
            actor_required: true,
            expected_actor_user_id: body_uuid(body, "user_id"),
            local_only: false,
        }));
    }

    if segments.as_slice() == ["admin", "platform", "bootstrap"]
        && method == Method::POST
    {
        return Ok(RequestClass::TokenOnly(TokenGate {
            transport: Transport::AdminApi,
            actor_required: false,
            expected_actor_user_id: None,
            local_only: true,
        }));
    }

    if segments.len() == 5
        && segments[0] == "internal"
        && segments[1] == "platform"
        && segments[2] == "payout-batches"
        && matches!(segments[4], "submission" | "transfer-evidence" | "failure")
        && method == Method::POST
    {
        return Ok(RequestClass::TokenOnly(TokenGate {
            transport: Transport::PayoutWorker,
            actor_required: false,
            expected_actor_user_id: None,
            local_only: false,
        }));
    }

    if segments[0] == "internal" {
        return classify_internal(state, method, &segments, body).await;
    }
    if segments[0] == "admin" {
        return classify_admin(state, method, &segments).await;
    }

    Ok(RequestClass::Public)
}

async fn classify_internal(
    state: &AppState,
    method: &Method,
    segments: &[&str],
    body: Option<&Value>,
) -> Result<RequestClass, ApiError> {
    let pool = database_pool(state)?;

    if segments.len() == 4
        && segments[1] == "identity"
        && segments[2] == "users"
        && method == Method::GET
    {
        let user_id = parse_uuid(segments[3])?;
        return Ok(protected_web(
            Capability::AccountRead,
            ScopeSource::Resolved(Scope::user(user_id)),
            None,
        ));
    }

    if segments.as_slice() == ["internal", "site-settings"] {
        let capability = match *method {
            Method::GET => Capability::SiteSettingsRead,
            Method::PATCH => Capability::SiteSettingsWrite,
            _ => return Ok(RequestClass::Deny(Transport::WebInternal)),
        };
        return Ok(protected_web(
            capability,
            ScopeSource::Resolved(Scope::site()),
            body_uuid(body, "actor_user_id"),
        ));
    }

    if segments.len() == 6
        && segments[1] == "access"
        && segments[2] == "organizations"
        && segments[4] == "members"
        && method == Method::GET
    {
        let organization_id = parse_uuid(segments[3])?;
        let actor_user_id = parse_uuid(segments[5])?;
        return Ok(protected_web(
            Capability::OrganizationMembersRead,
            ScopeSource::Resolved(Scope::organization(
                organization_id,
                "organization",
                Some(organization_id),
            )),
            Some(actor_user_id),
        ));
    }

    if segments.len() == 5
        && segments[1] == "access"
        && segments[2] == "organizations"
        && segments[4] == "members"
        && method == Method::POST
    {
        let organization_id = parse_uuid(segments[3])?;
        return Ok(protected_web(
            Capability::OrganizationMembersManage,
            ScopeSource::Resolved(Scope::organization(
                organization_id,
                "organization",
                Some(organization_id),
            )),
            body_uuid(body, "actor_user_id"),
        ));
    }

    if segments.len() == 4
        && segments[1] == "manage"
        && segments[2] == "overview"
        && method == Method::GET
    {
        let user_id = parse_uuid(segments[3])?;
        return Ok(protected_web(
            Capability::ManageOverview,
            ScopeSource::Resolved(Scope::user(user_id)),
            Some(user_id),
        ));
    }

    if segments.as_slice() == ["internal", "manage", "pageants"]
        && method == Method::POST
    {
        let organization_id = required_body_uuid(body, "organization_id")?;
        return Ok(protected_web(
            Capability::PageantWrite,
            ScopeSource::Resolved(Scope::organization(
                organization_id,
                "organization",
                Some(organization_id),
            )),
            body_uuid(body, "actor_user_id"),
        ));
    }

    if segments.as_slice() == ["internal", "manage", "categories"]
        && method == Method::POST
    {
        let pageant_id = required_body_uuid(body, "pageant_id")?;
        let organization_id = organization_for_pageant(pool, pageant_id).await?;
        return Ok(protected_web(
            Capability::PageantWrite,
            ScopeSource::Resolved(Scope::organization(
                organization_id,
                "pageant",
                Some(pageant_id),
            )),
            body_uuid(body, "actor_user_id"),
        ));
    }

    if segments.as_slice() == ["internal", "manage", "contestants"]
        && method == Method::POST
    {
        let pageant_id = required_body_uuid(body, "pageant_id")?;
        let organization_id = organization_for_pageant(pool, pageant_id).await?;
        return Ok(protected_web(
            Capability::PageantWrite,
            ScopeSource::Resolved(Scope::organization(
                organization_id,
                "pageant",
                Some(pageant_id),
            )),
            body_uuid(body, "actor_user_id"),
        ));
    }

    if segments.as_slice() == ["internal", "manage", "seed-miss-stellarverse"]
        && method == Method::POST
    {
        let scope = match body_uuid(body, "organization_id") {
            Some(organization_id) => ScopeSource::Resolved(Scope::organization(
                organization_id,
                "organization",
                Some(organization_id),
            )),
            None => ScopeSource::FirstEditableOrganization,
        };
        return Ok(protected_web(
            Capability::PageantWrite,
            scope,
            body_uuid(body, "actor_user_id"),
        ));
    }

    Ok(RequestClass::Deny(Transport::WebInternal))
}

async fn classify_admin(
    state: &AppState,
    method: &Method,
    segments: &[&str],
) -> Result<RequestClass, ApiError> {
    if segments.len() == 4
        && segments[1] == "events"
        && segments[3] == "snapshot"
        && method == Method::POST
    {
        return Ok(protected_admin(
            Capability::SnapshotWrite,
            Scope::site(),
        ));
    }
    if segments.len() == 4
        && segments[1] == "snapshots"
        && segments[3] == "anchor"
        && method == Method::POST
    {
        return Ok(protected_admin(
            Capability::SnapshotWrite,
            Scope::site(),
        ));
    }

    if segments.len() < 3 || segments[1] != "platform" {
        return Ok(RequestClass::Deny(Transport::AdminApi));
    }

    let pool = database_pool(state)?;

    if segments.len() == 3 && segments[2] == "contract-deployments" {
        let capability = match *method {
            Method::GET => Capability::ContractRead,
            Method::POST => Capability::ContractWrite,
            _ => return Ok(RequestClass::Deny(Transport::AdminApi)),
        };
        return Ok(protected_admin(capability, Scope::site()));
    }

    if segments.len() == 5 && segments[2] == "organizations" {
        let organization_id = parse_uuid(segments[3])?;
        let capability = match (segments[4], method) {
            ("pageants", &Method::POST) => Capability::PageantWrite,
            ("products", &Method::POST) => Capability::CatalogueWrite,
            ("collectible-collections", &Method::POST) => Capability::CatalogueWrite,
            ("media", _) => return Ok(RequestClass::Deny(Transport::AdminApi)),
            ("orders", &Method::POST) => Capability::OrderManage,
            _ => return Ok(RequestClass::Deny(Transport::AdminApi)),
        };
        return Ok(protected_admin(
            capability,
            Scope::organization(organization_id, "organization", Some(organization_id)),
        ));
    }

    if segments.len() == 6
        && segments[2] == "organizations"
        && segments[4] == "media"
        && segments[5] == "upload-intents"
        && method == Method::POST
    {
        let organization_id = parse_uuid(segments[3])?;
        return Ok(protected_admin(
            Capability::MediaWrite,
            Scope::organization(organization_id, "organization", Some(organization_id)),
        ));
    }

    if segments.len() == 7
        && segments[2] == "organizations"
        && segments[4] == "products"
        && segments[6] == "payout-rules"
        && method == Method::POST
    {
        let requested_organization_id = parse_uuid(segments[3])?;
        let product_id = parse_uuid(segments[5])?;
        let organization_id = organization_for_product(pool, product_id).await?;
        if requested_organization_id != organization_id {
            return Err(ApiError::NotFound);
        }
        return Ok(protected_admin(
            Capability::PayoutManage,
            Scope::organization(organization_id, "product", Some(product_id)),
        ));
    }

    if segments.len() == 5 && segments[2] == "pageants" && method == Method::POST {
        let pageant_id = parse_uuid(segments[3])?;
        if !matches!(segments[4], "categories" | "contestants") {
            return Ok(RequestClass::Deny(Transport::AdminApi));
        }
        let organization_id = organization_for_pageant(pool, pageant_id).await?;
        return Ok(protected_admin(
            Capability::PageantWrite,
            Scope::organization(organization_id, "pageant", Some(pageant_id)),
        ));
    }

    if segments.len() == 5 && segments[2] == "pageant-contestants" && method == Method::POST {
        let pageant_contestant_id = parse_uuid(segments[3])?;
        let organization_id = organization_for_pageant_contestant(pool, pageant_contestant_id).await?;
        let capability = match segments[4] {
            "sections" => Capability::PageantWrite,
            "media" => Capability::MediaWrite,
            _ => return Ok(RequestClass::Deny(Transport::AdminApi)),
        };
        return Ok(protected_admin(
            capability,
            Scope::organization(
                organization_id,
                "pageant_contestant",
                Some(pageant_contestant_id),
            ),
        ));
    }

    if segments.len() == 5
        && segments[2] == "media"
        && segments[4] == "complete"
        && method == Method::POST
    {
        let media_asset_id = parse_uuid(segments[3])?;
        let organization_id = organization_for_media(pool, media_asset_id).await?;
        return Ok(protected_admin(
            Capability::MediaWrite,
            Scope::organization(organization_id, "media_asset", Some(media_asset_id)),
        ));
    }

    if segments.len() == 5
        && segments[2] == "collectible-collections"
        && segments[4] == "editions"
        && method == Method::POST
    {
        let collection_id = parse_uuid(segments[3])?;
        let organization_id = organization_for_collection(pool, collection_id).await?;
        return Ok(protected_admin(
            Capability::CatalogueWrite,
            Scope::organization(
                organization_id,
                "collectible_collection",
                Some(collection_id),
            ),
        ));
    }

    if segments.len() >= 4 && segments[2] == "orders" {
        let order_id = parse_uuid(segments[3])?;
        let (organization_id, buyer_user_id) = scope_for_order(pool, order_id).await?;
        let capability = if segments.len() == 4 && method == Method::GET {
            Capability::OrderRead
        } else if segments.len() == 5 && segments[4] == "payment-attempts" && method == Method::POST {
            Capability::OrderManage
        } else if segments.len() == 5 && segments[4] == "stellar-intents" && method == Method::POST {
            Capability::IntentWrite
        } else if segments.len() == 5 && segments[4] == "fulfillment-jobs" && method == Method::POST {
            Capability::FulfillmentCreate
        } else if segments.len() == 5 && segments[4] == "payout-batches" && method == Method::POST {
            Capability::PayoutManage
        } else {
            return Ok(RequestClass::Deny(Transport::AdminApi));
        };
        return Ok(protected_admin(
            capability,
            Scope::owned_resource(organization_id, buyer_user_id, "order", order_id),
        ));
    }

    if segments.len() == 5
        && segments[2] == "payment-attempts"
        && segments[4] == "events"
        && method == Method::POST
    {
        let payment_attempt_id = parse_uuid(segments[3])?;
        let (organization_id, buyer_user_id) =
            scope_for_payment_attempt(pool, payment_attempt_id).await?;
        return Ok(protected_admin(
            Capability::ProviderEventWrite,
            Scope::owned_resource(
                organization_id,
                buyer_user_id,
                "payment_attempt",
                payment_attempt_id,
            ),
        ));
    }

    if segments.len() >= 4 && segments[2] == "stellar-intents" {
        let intent_id = parse_uuid(segments[3])?;
        let (organization_id, buyer_user_id) = scope_for_intent(pool, intent_id).await?;
        let capability = if segments.len() == 4 && method == Method::GET {
            Capability::IntentRead
        } else if segments.len() == 5
            && segments[4] == "signed-envelope"
            && method == Method::POST
        {
            Capability::IntentWrite
        } else if segments.len() == 5
            && matches!(segments[4], "submission-receipt" | "chain-evidence")
            && method == Method::POST
        {
            Capability::ChainEvidenceWrite
        } else if segments.len() == 5
            && segments[4] == "reconciliation"
            && method == Method::GET
        {
            Capability::ReconciliationRead
        } else {
            return Ok(RequestClass::Deny(Transport::AdminApi));
        };
        return Ok(protected_admin(
            capability,
            Scope::owned_resource(
                organization_id,
                buyer_user_id,
                "transaction_intent",
                intent_id,
            ),
        ));
    }

    if segments.len() >= 4 && segments[2] == "fulfillment-jobs" {
        let job_id = parse_uuid(segments[3])?;
        let (organization_id, buyer_user_id) = scope_for_fulfillment_job(pool, job_id).await?;
        let capability = if segments.len() == 4 && method == Method::GET {
            Capability::FulfillmentRead
        } else if segments.len() == 5
            && matches!(
                segments[4],
                "claim" | "submission" | "failure" | "mint-evidence"
            )
            && method == Method::POST
        {
            Capability::FulfillmentOperate
        } else {
            return Ok(RequestClass::Deny(Transport::AdminApi));
        };
        return Ok(protected_admin(
            capability,
            Scope::owned_resource(
                organization_id,
                buyer_user_id,
                "fulfillment_job",
                job_id,
            ),
        ));
    }

    if segments.len() == 4
        && segments[2] == "payout-batches"
        && method == Method::GET
    {
        let payout_batch_id = parse_uuid(segments[3])?;
        let (organization_id, buyer_user_id) =
            scope_for_payout_batch(pool, payout_batch_id).await?;
        return Ok(protected_admin(
            Capability::PayoutRead,
            Scope::owned_resource(
                organization_id,
                buyer_user_id,
                "payout_batch",
                payout_batch_id,
            ),
        ));
    }

    Ok(RequestClass::Deny(Transport::AdminApi))
}

fn protected_web(
    capability: Capability,
    scope: ScopeSource,
    expected_actor_user_id: Option<Uuid>,
) -> RequestClass {
    RequestClass::Protected(ProtectedPlan {
        transport: Transport::WebInternal,
        capability,
        scope,
        expected_actor_user_id,
    })
}

fn protected_admin(capability: Capability, scope: Scope) -> RequestClass {
    RequestClass::Protected(ProtectedPlan {
        transport: Transport::AdminApi,
        capability,
        scope: ScopeSource::Resolved(scope),
        expected_actor_user_id: None,
    })
}

fn is_public_request(method: &Method, path: &str) -> bool {
    if matches!(path, "/health" | "/ready" | "/setup/status") {
        return true;
    }

    if method == Method::GET
        && (path == "/events"
            || path.starts_with("/events/")
            || path.starts_with("/snapshots/")
            || path == "/markets"
            || path.starts_with("/markets/")
            || path.starts_with("/market-intents/")
            || path == "/platform/organizations"
            || path.starts_with("/platform/"))
    {
        return true;
    }

    // These are legacy in-memory proof-of-flow actions. They stay explicitly
    // classified until the durable voting/market slices replace them; unknown
    // admin/internal actions still fail closed.
    (method == Method::POST && path.starts_with("/events/") && path.ends_with("/vote"))
        || (method == Method::POST
            && path.starts_with("/markets/")
            && path.ends_with("/stake-intents"))
        || (method == Method::POST
            && path.starts_with("/market-intents/")
            && path.ends_with("/submission"))
}

fn split_path(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

fn require_transport(
    state: &AppState,
    headers: &HeaderMap,
    transport: Transport,
) -> Result<(), ApiError> {
    let valid = match transport {
        Transport::WebInternal => header_matches(
            headers,
            WEB_TOKEN_HEADER,
            &state.config.web_internal_token,
        ),
        Transport::AdminApi => {
            header_matches(headers, ADMIN_TOKEN_HEADER, &state.config.admin_demo_token)
        }
        Transport::PayoutWorker => state
            .config
            .payout_worker_token
            .as_deref()
            .is_some_and(|expected| header_matches(headers, PAYOUT_WORKER_HEADER, expected)),
    };
    if valid {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
    }
}

fn header_matches(headers: &HeaderMap, name: &str, expected: &str) -> bool {
    !expected.is_empty()
        && headers
            .get(name)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|provided| provided == expected)
}

fn actor_from_headers(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get(ACTOR_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
}

fn body_uuid(body: Option<&Value>, key: &str) -> Option<Uuid> {
    body.and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok())
}

fn required_body_uuid(body: Option<&Value>, key: &'static str) -> Result<Uuid, ApiError> {
    body_uuid(body, key).ok_or(ApiError::InvalidRequest(key))
}

fn body_string(body: Option<&Value>, key: &str) -> Option<String> {
    body.and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .map(|value| value.trim().to_ascii_lowercase())
}

fn parse_uuid(value: &str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(value).map_err(|_| ApiError::NotFound)
}

fn database_pool(state: &AppState) -> Result<&PgPool, ApiError> {
    state
        .database
        .as_ref()
        .ok_or(ApiError::ServiceUnavailable("database_not_configured"))
}

async fn load_principal(
    pool: &PgPool,
    actor_user_id: Uuid,
    organization_id: Option<Uuid>,
) -> Result<Principal, ApiError> {
    let user_active = sqlx::query_scalar::<_, bool>(
        "SELECT COALESCE((SELECT status = 'active' FROM users WHERE id = $1), false)",
    )
    .bind(actor_user_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;

    let site_role = sqlx::query_scalar::<_, String>(
        "SELECT role FROM site_administrators WHERE user_id = $1 AND status = 'active'",
    )
    .bind(actor_user_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?;

    let organization_role = if let Some(organization_id) = organization_id {
        sqlx::query_scalar::<_, String>(
            "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
        )
        .bind(organization_id)
        .bind(actor_user_id)
        .fetch_optional(pool)
        .await
        .map_err(map_database_error)?
    } else {
        None
    };

    Ok(Principal {
        user_active,
        site_role,
        organization_role,
    })
}

fn authorize_principal(
    actor_user_id: Uuid,
    principal: &Principal,
    capability: Capability,
    scope: &Scope,
) -> (bool, &'static str) {
    if !principal.user_active {
        return (false, "principal_inactive_or_missing");
    }

    let self_owned = scope.owner_user_id == Some(actor_user_id);
    if matches!(capability, Capability::AccountRead | Capability::ManageOverview) && self_owned {
        return (true, "resource_owner");
    }
    if matches!(capability, Capability::OrderRead | Capability::IntentRead) && self_owned {
        return (true, "resource_owner");
    }

    if let Some(role) = principal.site_role.as_deref() {
        if site_role_allows(role, capability) {
            return (true, "site_role");
        }
    }
    if let Some(role) = principal.organization_role.as_deref() {
        if organization_role_allows(role, capability) {
            return (true, "organization_role");
        }
    }

    (false, "capability_not_granted")
}

fn site_role_allows(role: &str, capability: Capability) -> bool {
    match role {
        "owner" | "admin" => true,
        "operator" => matches!(
            capability,
            Capability::SiteSettingsRead
                | Capability::OrderRead
                | Capability::IntentRead
                | Capability::ContractRead
                | Capability::ReconciliationRead
                | Capability::FulfillmentRead
                | Capability::FulfillmentOperate
                | Capability::PayoutRead
        ),
        "auditor" => matches!(
            capability,
            Capability::AccountRead
                | Capability::SiteSettingsRead
                | Capability::OrganizationMembersRead
                | Capability::OrderRead
                | Capability::IntentRead
                | Capability::ContractRead
                | Capability::ReconciliationRead
                | Capability::FulfillmentRead
                | Capability::PayoutRead
        ),
        _ => false,
    }
}

fn organization_role_allows(role: &str, capability: Capability) -> bool {
    match role {
        "owner" | "admin" => matches!(
            capability,
            Capability::OrganizationMembersRead
                | Capability::OrganizationMembersManage
                | Capability::PageantWrite
                | Capability::CatalogueWrite
                | Capability::MediaWrite
                | Capability::OrderManage
                | Capability::OrderRead
                | Capability::IntentWrite
                | Capability::IntentRead
                | Capability::ReconciliationRead
                | Capability::FulfillmentCreate
                | Capability::FulfillmentRead
                | Capability::FulfillmentOperate
                | Capability::PayoutManage
                | Capability::PayoutRead
        ),
        "editor" => matches!(
            capability,
            Capability::PageantWrite
                | Capability::CatalogueWrite
                | Capability::MediaWrite
                | Capability::OrderManage
                | Capability::OrderRead
                | Capability::IntentWrite
                | Capability::IntentRead
                | Capability::FulfillmentCreate
                | Capability::FulfillmentRead
        ),
        "operator" => matches!(
            capability,
            Capability::OrderRead
                | Capability::IntentRead
                | Capability::ReconciliationRead
                | Capability::FulfillmentRead
                | Capability::FulfillmentOperate
                | Capability::PayoutRead
        ),
        "auditor" | "viewer" => matches!(
            capability,
            Capability::OrganizationMembersRead
                | Capability::OrderRead
                | Capability::IntentRead
                | Capability::ReconciliationRead
                | Capability::FulfillmentRead
                | Capability::PayoutRead
        ),
        _ => false,
    }
}

async fn resolve_first_editable_organization(
    pool: &PgPool,
    actor_user_id: Uuid,
) -> Result<Scope, ApiError> {
    let organization_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT o.id FROM organizations o WHERE o.status <> 'archived' AND (EXISTS (SELECT 1 FROM site_administrators sa WHERE sa.user_id = $1 AND sa.status = 'active' AND sa.role IN ('owner','admin')) OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = o.id AND om.user_id = $1 AND om.status = 'active' AND om.role IN ('owner','admin','editor'))) ORDER BY o.created_at LIMIT 1",
    )
    .bind(actor_user_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::Forbidden)?;
    Ok(Scope::organization(
        organization_id,
        "organization",
        Some(organization_id),
    ))
}

async fn organization_for_pageant(pool: &PgPool, pageant_id: Uuid) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM pageants WHERE id = $1")
        .bind(pageant_id)
        .fetch_optional(pool)
        .await
        .map_err(map_database_error)?
        .ok_or(ApiError::NotFound)
}

async fn organization_for_pageant_contestant(
    pool: &PgPool,
    pageant_contestant_id: Uuid,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT p.organization_id FROM pageant_contestants pc JOIN pageants p ON p.id = pc.pageant_id WHERE pc.id = $1",
    )
    .bind(pageant_contestant_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn organization_for_media(pool: &PgPool, media_asset_id: Uuid) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM media_assets WHERE id = $1")
        .bind(media_asset_id)
        .fetch_optional(pool)
        .await
        .map_err(map_database_error)?
        .ok_or(ApiError::NotFound)
}

async fn organization_for_collection(pool: &PgPool, collection_id: Uuid) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT organization_id FROM collectible_collections WHERE id = $1",
    )
    .bind(collection_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn organization_for_product(pool: &PgPool, product_id: Uuid) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM products WHERE id = $1")
        .bind(product_id)
        .fetch_optional(pool)
        .await
        .map_err(map_database_error)?
        .ok_or(ApiError::NotFound)
}

async fn scope_for_order(pool: &PgPool, order_id: Uuid) -> Result<(Uuid, Uuid), ApiError> {
    sqlx::query_as::<_, (Uuid, Uuid)>(
        "SELECT organization_id, buyer_user_id FROM orders WHERE id = $1",
    )
    .bind(order_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn scope_for_payment_attempt(
    pool: &PgPool,
    payment_attempt_id: Uuid,
) -> Result<(Uuid, Uuid), ApiError> {
    sqlx::query_as::<_, (Uuid, Uuid)>(
        "SELECT o.organization_id, o.buyer_user_id FROM payment_attempts pa JOIN orders o ON o.id = pa.order_id WHERE pa.id = $1",
    )
    .bind(payment_attempt_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn scope_for_intent(pool: &PgPool, intent_id: Uuid) -> Result<(Uuid, Uuid), ApiError> {
    sqlx::query_as::<_, (Uuid, Uuid)>(
        "SELECT ti.organization_id, o.buyer_user_id FROM transaction_intents ti JOIN orders o ON o.id = ti.order_id WHERE ti.id = $1",
    )
    .bind(intent_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn scope_for_fulfillment_job(
    pool: &PgPool,
    job_id: Uuid,
) -> Result<(Uuid, Uuid), ApiError> {
    sqlx::query_as::<_, (Uuid, Uuid)>(
        "SELECT fj.organization_id, o.buyer_user_id FROM fulfillment_jobs fj JOIN orders o ON o.id = fj.order_id WHERE fj.id = $1",
    )
    .bind(job_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn scope_for_payout_batch(
    pool: &PgPool,
    payout_batch_id: Uuid,
) -> Result<(Uuid, Uuid), ApiError> {
    sqlx::query_as::<_, (Uuid, Uuid)>(
        "SELECT pb.organization_id, o.buyer_user_id FROM payout_batches pb JOIN orders o ON o.id = pb.order_id WHERE pb.id = $1",
    )
    .bind(payout_batch_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

#[allow(clippy::too_many_arguments)]
async fn record_decision(
    pool: &PgPool,
    actor_user_id: Option<Uuid>,
    organization_id: Option<Uuid>,
    capability: Capability,
    resource_type: Option<&str>,
    resource_id: Option<Uuid>,
    allowed: bool,
    reason: &str,
    method: &Method,
    path: &str,
) {
    let result = sqlx::query(
        "INSERT INTO authorization_decisions (id, actor_user_id, organization_id, capability, resource_type, resource_id, decision, reason, request_method, request_path) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    )
    .bind(Uuid::new_v4())
    .bind(actor_user_id)
    .bind(organization_id)
    .bind(capability.as_str())
    .bind(resource_type)
    .bind(resource_id)
    .bind(if allowed { "allow" } else { "deny" })
    .bind(reason)
    .bind(method.as_str())
    .bind(path.chars().take(1000).collect::<String>())
    .execute(pool)
    .await;

    if let Err(error) = result {
        tracing::warn!(%error, capability = capability.as_str(), "failed to persist authorization decision");
    }
}

fn map_database_error(error: sqlx::Error) -> ApiError {
    tracing::error!(%error, "authorization database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    fn principal(site_role: Option<&str>, organization_role: Option<&str>) -> Principal {
        Principal {
            user_active: true,
            site_role: site_role.map(str::to_string),
            organization_role: organization_role.map(str::to_string),
        }
    }

    fn organization_scope(owner_user_id: Option<Uuid>) -> Scope {
        Scope {
            organization_id: Some(Uuid::new_v4()),
            owner_user_id,
            resource_type: Some("test_resource"),
            resource_id: Some(Uuid::new_v4()),
            conceal_cross_tenant: true,
        }
    }

    #[test]
    fn organization_editor_can_manage_content_but_not_members() {
        let actor = Uuid::new_v4();
        let editor = principal(None, Some("editor"));
        assert!(authorize_principal(
            actor,
            &editor,
            Capability::PageantWrite,
            &organization_scope(None)
        )
        .0);
        assert!(!authorize_principal(
            actor,
            &editor,
            Capability::OrganizationMembersManage,
            &organization_scope(None)
        )
        .0);
    }

    #[test]
    fn operator_is_operational_not_editorial() {
        let actor = Uuid::new_v4();
        let operator = principal(None, Some("operator"));
        assert!(authorize_principal(
            actor,
            &operator,
            Capability::FulfillmentOperate,
            &organization_scope(None)
        )
        .0);
        assert!(!authorize_principal(
            actor,
            &operator,
            Capability::CatalogueWrite,
            &organization_scope(None)
        )
        .0);
    }

    #[test]
    fn auditor_is_read_only() {
        let actor = Uuid::new_v4();
        let auditor = principal(Some("auditor"), None);
        assert!(authorize_principal(
            actor,
            &auditor,
            Capability::ReconciliationRead,
            &Scope::site()
        )
        .0);
        assert!(!authorize_principal(
            actor,
            &auditor,
            Capability::ChainEvidenceWrite,
            &Scope::site()
        )
        .0);
    }

    #[test]
    fn resource_owner_can_read_own_order_but_not_someone_elses() {
        let actor = Uuid::new_v4();
        let public_user = principal(None, None);
        assert!(authorize_principal(
            actor,
            &public_user,
            Capability::OrderRead,
            &organization_scope(Some(actor))
        )
        .0);
        assert!(!authorize_principal(
            actor,
            &public_user,
            Capability::OrderRead,
            &organization_scope(Some(Uuid::new_v4()))
        )
        .0);
    }

    #[test]
    fn inactive_principal_is_always_denied() {
        let actor = Uuid::new_v4();
        let inactive = Principal {
            user_active: false,
            site_role: Some("owner".to_string()),
            organization_role: Some("owner".to_string()),
        };
        assert!(!authorize_principal(
            actor,
            &inactive,
            Capability::SiteSettingsWrite,
            &Scope::site()
        )
        .0);
    }

    #[test]
    fn unknown_internal_and_admin_paths_are_not_public() {
        assert!(!is_public_request(&Method::POST, "/internal/unknown"));
        assert!(!is_public_request(&Method::POST, "/admin/unknown"));
    }
}
