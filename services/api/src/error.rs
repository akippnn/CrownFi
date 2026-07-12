use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("not_found")]
    NotFound,
    #[error("invalid_request: {0}")]
    InvalidRequest(&'static str),
    #[error("duplicate_vote")]
    DuplicateVote,
    #[error("voting_closed")]
    VotingClosed,
    #[error("unauthorized")]
    Unauthorized,
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
            ApiError::DuplicateVote | ApiError::VotingClosed => StatusCode::CONFLICT,
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
        };

        let body = ErrorBody {
            ok: false,
            error: self.to_string(),
            detail: None,
        };

        (status, Json(body)).into_response()
    }
}
