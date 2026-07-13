use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("not_found")]
    NotFound,
    #[error("invalid_request: {0}")]
    InvalidRequest(&'static str),
    #[error("conflict: {0}")]
    Conflict(&'static str),
    #[error("duplicate_vote")]
    DuplicateVote,
    #[error("voting_closed")]
    VotingClosed,
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("database_error")]
    Database,
    #[error("storage_error: {0}")]
    Storage(&'static str),
    #[error("service_unavailable: {0}")]
    ServiceUnavailable(&'static str),
}

#[derive(Serialize)]
pub struct ErrorBody {
    pub ok: bool,
    pub error: String,
    pub detail: Option<String>,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let status = match self {
            ApiError::NotFound => StatusCode::NOT_FOUND,
            ApiError::InvalidRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Conflict(_) | ApiError::DuplicateVote | ApiError::VotingClosed => {
                StatusCode::CONFLICT
            }
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
            ApiError::Forbidden => StatusCode::FORBIDDEN,
            ApiError::Database => StatusCode::INTERNAL_SERVER_ERROR,
            ApiError::Storage(_) => StatusCode::BAD_GATEWAY,
            ApiError::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
        };

        let body = ErrorBody {
            ok: false,
            error: self.to_string(),
            detail: None,
        };

        (status, Json(body)).into_response()
    }
}
