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
    pub stellar_mode: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            bind_addr: std::env::var("CROWNFI_API_BIND")
                .unwrap_or_else(|_| "127.0.0.1:8080".to_string()),
            api_mode: std::env::var("CROWNFI_API_MODE")
                .unwrap_or_else(|_| "local-demo".to_string()),
            database_url: std::env::var("DATABASE_URL")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            database_required: env_bool("CROWNFI_DATABASE_REQUIRED", false),
            database_max_connections: env_u32("CROWNFI_DATABASE_MAX_CONNECTIONS", 10),
            database_acquire_timeout_seconds: env_u64(
                "CROWNFI_DATABASE_ACQUIRE_TIMEOUT_SECONDS",
                10,
            ),
            redis_url: std::env::var("REDIS_URL")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            admin_demo_token: std::env::var("ADMIN_DEMO_TOKEN")
                .unwrap_or_else(|_| "local-admin-demo-token".to_string()),
            stellar_mode: std::env::var("STELLAR_MODE").unwrap_or_else(|_| "mock".to_string()),
        }
    }

    pub fn has_database(&self) -> bool {
        self.database_url.is_some()
    }

    pub fn has_redis(&self) -> bool {
        self.redis_url.is_some()
    }
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
