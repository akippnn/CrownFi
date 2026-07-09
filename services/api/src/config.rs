#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: String,
    pub api_mode: String,
    pub database_url: Option<String>,
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
            database_url: std::env::var("DATABASE_URL").ok(),
            redis_url: std::env::var("REDIS_URL").ok(),
            admin_demo_token: std::env::var("ADMIN_DEMO_TOKEN")
                .unwrap_or_else(|_| "local-admin-demo-token".to_string()),
            stellar_mode: std::env::var("STELLAR_MODE").unwrap_or_else(|_| "mock".to_string()),
        }
    }

    pub fn has_database(&self) -> bool {
        self.database_url.as_ref().is_some_and(|value| !value.is_empty())
    }

    pub fn has_redis(&self) -> bool {
        self.redis_url.as_ref().is_some_and(|value| !value.is_empty())
    }
}
