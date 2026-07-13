use std::{collections::HashMap, time::Duration};

use aws_sdk_s3::{
    config::{Credentials, Region},
    presigning::PresigningConfig,
    Client,
};
use sha2::{Digest, Sha256};

use crate::config::Config;

#[derive(Clone)]
pub struct MediaStore {
    client: Client,
    bucket: String,
    public_base_url: Option<String>,
    upload_ttl: Duration,
    max_object_bytes: i64,
}

#[derive(Debug, Clone)]
pub struct UploadAuthorization {
    pub url: String,
    pub headers: HashMap<String, String>,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Clone)]
pub struct StoredObject {
    pub content_length: i64,
    pub content_type: Option<String>,
    pub sha256_metadata: Option<String>,
    pub e_tag: Option<String>,
}

impl MediaStore {
    pub async fn from_config(config: &Config) -> Option<Self> {
        let endpoint = config.r2_endpoint.as_deref()?;
        let access_key_id = config.r2_access_key_id.as_deref()?;
        let secret_access_key = config.r2_secret_access_key.as_deref()?;
        let bucket = config.r2_bucket.clone()?;

        let shared_config = aws_config::from_env()
            .endpoint_url(endpoint)
            .credentials_provider(Credentials::new(
                access_key_id,
                secret_access_key,
                None,
                None,
                "crownfi-r2",
            ))
            .region(Region::new("auto"))
            .load()
            .await;
        let service_config = aws_sdk_s3::config::Builder::from(&shared_config)
            .force_path_style(true)
            .build();

        Some(Self {
            client: Client::from_conf(service_config),
            bucket,
            public_base_url: config
                .r2_public_base_url
                .as_deref()
                .map(str::trim_end_matches)
                .map(ToOwned::to_owned),
            upload_ttl: Duration::from_secs(config.r2_upload_ttl_seconds),
            max_object_bytes: config.r2_max_image_bytes,
        })
    }

    pub fn bucket(&self) -> &str {
        &self.bucket
    }

    pub fn delivery_url(&self, object_key: &str) -> Option<String> {
        self.public_base_url
            .as_ref()
            .map(|base| format!("{base}/{object_key}"))
    }

    pub async fn presign_upload(
        &self,
        object_key: &str,
        content_type: &str,
        sha256: &str,
    ) -> Result<UploadAuthorization, String> {
        let presigning_config = PresigningConfig::expires_in(self.upload_ttl)
            .map_err(|error| format!("invalid R2 presigning configuration: {error}"))?;
        let request = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(object_key)
            .content_type(content_type)
            .metadata("sha256", sha256)
            .presigned(presigning_config)
            .await
            .map_err(|error| format!("failed to presign R2 upload: {error}"))?;

        Ok(UploadAuthorization {
            url: request.uri().to_string(),
            headers: HashMap::from([
                ("content-type".to_string(), content_type.to_string()),
                ("x-amz-meta-sha256".to_string(), sha256.to_string()),
            ]),
            expires_in_seconds: self.upload_ttl.as_secs(),
        })
    }

    pub async fn head_object(&self, object_key: &str) -> Result<StoredObject, String> {
        let output = self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(object_key)
            .send()
            .await
            .map_err(|error| format!("failed to inspect R2 object: {error}"))?;
        let content_length = output.content_length().unwrap_or_default();
        if content_length <= 0 || content_length > self.max_object_bytes {
            return Ok(StoredObject {
                content_length,
                content_type: output.content_type().map(ToOwned::to_owned),
                sha256_metadata: None,
                e_tag: output.e_tag().map(ToOwned::to_owned),
            });
        }

        let metadata_sha256 = output
            .metadata()
            .and_then(|metadata| metadata.get("sha256"))
            .cloned();
        let actual_sha256 = self.object_sha256(object_key).await?;
        let verified_sha256 = metadata_sha256.filter(|declared| declared == &actual_sha256);

        Ok(StoredObject {
            content_length,
            content_type: output.content_type().map(ToOwned::to_owned),
            sha256_metadata: verified_sha256,
            e_tag: output.e_tag().map(ToOwned::to_owned),
        })
    }

    async fn object_sha256(&self, object_key: &str) -> Result<String, String> {
        let output = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(object_key)
            .send()
            .await
            .map_err(|error| format!("failed to read R2 object: {error}"))?;
        let bytes = output
            .body
            .collect()
            .await
            .map_err(|error| format!("failed to collect R2 object body: {error}"))?
            .into_bytes();
        if bytes.len() as i64 > self.max_object_bytes {
            return Err("R2 object exceeds configured maximum size".to_string());
        }
        Ok(hex::encode(Sha256::digest(bytes)))
    }

    pub async fn delete_object(&self, object_key: &str) -> Result<(), String> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(object_key)
            .send()
            .await
            .map_err(|error| format!("failed to delete R2 object: {error}"))?;
        Ok(())
    }
}
