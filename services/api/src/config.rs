#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: String,
    pub api_mode: String,
    pub database_url: Option<String>,
    pub database_required: bool,
    pub database_max_connections: u32,
    pub database_acquire_timeout_seconds: u64,
    pub redis_url: Option<String>,
    pub admin_demo_token: String,
    pub payout_worker_token: Option<String>,
    pub web_internal_token: String,
    pub setup_bootstrap_token: String,
    pub allow_mainnet: bool,
    pub stellar_mode: String,
    pub r2_endpoint: Option<String>,
    pub r2_access_key_id: Option<String>,
    pub r2_secret_access_key: Option<String>,
    pub r2_bucket: Option<String>,
    pub r2_public_base_url: Option<String>,
    pub r2_upload_ttl_seconds: u64,
    pub r2_max_image_bytes: i64,
}

impl Config {
    pub fn from_env() -> Self {
        let api_mode =
            std::env::var("CROWNFI_API_MODE").unwrap_or_else(|_| "local-demo".to_string());
        let local_profile = api_mode.starts_with("local");
        let web_internal_token = env_optional("CROWNFI_WEB_INTERNAL_TOKEN").unwrap_or_else(|| {
            if local_profile {
                "local-web-to-api-token-change-before-sharing".to_string()
            } else {
                String::new()
            }
        });
        let setup_bootstrap_token =
            env_optional("CROWNFI_SETUP_BOOTSTRAP_TOKEN").unwrap_or_else(|| {
                if local_profile {
                    "local-first-admin-setup-token".to_string()
                } else {
                    format!("disabled-{}", uuid::Uuid::new_v4())
                }
            });

        Self {
            bind_addr: std::env::var("CROWNFI_API_BIND")
                .unwrap_or_else(|_| "127.0.0.1:8080".to_string()),
            api_mode,
            database_url: env_optional("DATABASE_URL"),
            database_required: env_bool("CROWNFI_DATABASE_REQUIRED", false),
            database_max_connections: env_u32("CROWNFI_DATABASE_MAX_CONNECTIONS", 10),
            database_acquire_timeout_seconds: env_u64(
                "CROWNFI_DATABASE_ACQUIRE_TIMEOUT_SECONDS",
                10,
            ),
            redis_url: env_optional("REDIS_URL"),
            admin_demo_token: std::env::var("ADMIN_DEMO_TOKEN")
                .unwrap_or_else(|_| "local-admin-demo-token".to_string()),
            payout_worker_token: env_optional("CROWNFI_PAYOUT_WORKER_TOKEN"),
            web_internal_token,
            setup_bootstrap_token,
            allow_mainnet: env_bool("CROWNFI_ALLOW_MAINNET", false),
            stellar_mode: std::env::var("STELLAR_MODE").unwrap_or_else(|_| "mock".to_string()),
            r2_endpoint: env_optional("R2_ENDPOINT"),
            r2_access_key_id: env_optional("R2_ACCESS_KEY_ID"),
            r2_secret_access_key: env_optional("R2_SECRET_ACCESS_KEY"),
            r2_bucket: env_optional("R2_BUCKET"),
            r2_public_base_url: env_optional("R2_PUBLIC_BASE_URL"),
            r2_upload_ttl_seconds: env_u64("R2_UPLOAD_TTL_SECONDS", 300).clamp(30, 3600),
            r2_max_image_bytes: env_i64("R2_MAX_IMAGE_BYTES", 15 * 1024 * 1024),
        }
    }

    pub fn has_database(&self) -> bool {
        self.database_url.is_some()
    }

    pub fn has_redis(&self) -> bool {
        self.redis_url.is_some()
    }

    pub fn has_r2(&self) -> bool {
        self.r2_endpoint.is_some()
            && self.r2_access_key_id.is_some()
            && self.r2_secret_access_key.is_some()
            && self.r2_bucket.is_some()
    }
}

fn env_optional(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn env_bool(name: &str, default: bool) -> bool {
    std::env::var(name)
        .ok()
        .and_then(|value| match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        })
        .unwrap_or(default)
}

fn env_u32(name: &str, default: u32) -> u32 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn env_i64(name: &str, default: i64) -> i64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}
