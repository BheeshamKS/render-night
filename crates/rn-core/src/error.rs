use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Range parse error: {0}")]
    Range(#[from] crate::ranges::RangeParseError),
    #[error("Blender header error: {0}")]
    BlenderHeader(#[from] crate::blender::HeaderReadError),
    #[error("Blender discovery error: {0}")]
    BlenderDiscovery(#[from] crate::blender::BlenderDiscoveryError),
    #[error("Generic error: {0}")]
    Generic(String),
}

pub type Result<T> = std::result::Result<T, Error>;
