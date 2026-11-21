use crate::blender::BlenderFs;
use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlendHeaderInfo {
    pub version: String,
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub is_64_bit: bool,
    pub little_endian: bool,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum HeaderReadError {
    #[error("File too short to be a .blend file")]
    TooShort,
    #[error("Invalid magic header: expected 'BLENDER'")]
    InvalidMagic,
    #[error("Invalid version string in header")]
    InvalidVersion,
    #[error("IO error reading header: {0}")]
    Io(String),
}

/// Parses the 12-byte header of a .blend file from a fixed array.
pub fn parse_blend_header(bytes: &[u8; 12]) -> Result<BlendHeaderInfo, HeaderReadError> {
    parse_blend_header_slice(bytes)
}

/// Parses the 12-byte header from a byte slice.
pub fn parse_blend_header_slice(bytes: &[u8]) -> Result<BlendHeaderInfo, HeaderReadError> {
    if bytes.len() < 12 {
        return Err(HeaderReadError::TooShort);
    }

    if &bytes[0..7] != b"BLENDER" {
        return Err(HeaderReadError::InvalidMagic);
    }

    let ptr_char = bytes[7];
    let endian_char = bytes[8];

    let is_64_bit = ptr_char == b'_';
    let little_endian = endian_char == b'v';

    let major_char = bytes[9] as char;
    let minor_str =
        std::str::from_utf8(&bytes[10..12]).map_err(|_| HeaderReadError::InvalidVersion)?;

    let major = major_char
        .to_digit(10)
        .ok_or(HeaderReadError::InvalidVersion)?;
    let minor = minor_str
        .parse::<u32>()
        .map_err(|_| HeaderReadError::InvalidVersion)?;
    let patch = 0;

    let version = format!("{major}.{minor}.{patch}");

    Ok(BlendHeaderInfo {
        version,
        major,
        minor,
        patch,
        is_64_bit,
        little_endian,
    })
}

/// Reads the 12-byte header cheaply from disk via std::fs.
pub fn read_blend_header(path: &Path) -> Result<BlendHeaderInfo, HeaderReadError> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).map_err(|e| HeaderReadError::Io(e.to_string()))?;
    let mut buf = [0u8; 12];
    file.read_exact(&mut buf).map_err(|e| {
        if e.kind() == std::io::ErrorKind::UnexpectedEof {
            HeaderReadError::TooShort
        } else {
            HeaderReadError::Io(e.to_string())
        }
    })?;
    parse_blend_header(&buf)
}

/// Reads the 12-byte header via the BlenderFs abstraction trait.
pub fn read_blend_header_fs<F: BlenderFs + ?Sized>(
    fs: &F,
    path: &Path,
) -> Result<BlendHeaderInfo, HeaderReadError> {
    let buf = fs.read_header(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::UnexpectedEof {
            HeaderReadError::TooShort
        } else {
            HeaderReadError::Io(e.to_string())
        }
    })?;
    parse_blend_header(&buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_blend_header_402() {
        let bytes = b"BLENDER_v402";
        let info = parse_blend_header(bytes).unwrap();
        assert_eq!(info.version, "4.2.0");
        assert_eq!(info.major, 4);
        assert_eq!(info.minor, 2);
        assert_eq!(info.patch, 0);
        assert!(info.is_64_bit);
        assert!(info.little_endian);
    }

    #[test]
    fn test_parse_blend_header_306_32bit_be() {
        let bytes = b"BLENDER-V306";
        let info = parse_blend_header(bytes).unwrap();
        assert_eq!(info.version, "3.6.0");
        assert_eq!(info.major, 3);
        assert_eq!(info.minor, 6);
        assert_eq!(info.patch, 0);
        assert!(!info.is_64_bit);
        assert!(!info.little_endian);
    }

    #[test]
    fn test_parse_blend_header_500() {
        let bytes = b"BLENDER_v500";
        let info = parse_blend_header(bytes).unwrap();
        assert_eq!(info.version, "5.0.0");
        assert_eq!(info.major, 5);
        assert_eq!(info.minor, 0);
    }

    #[test]
    fn test_parse_blend_header_280() {
        let bytes = b"BLENDER_v280";
        let info = parse_blend_header(bytes).unwrap();
        assert_eq!(info.version, "2.80.0");
        assert_eq!(info.major, 2);
        assert_eq!(info.minor, 80);
    }

    #[test]
    fn test_parse_blend_header_errors() {
        assert_eq!(
            parse_blend_header_slice(b"BLENDER").unwrap_err(),
            HeaderReadError::TooShort
        );
        assert_eq!(
            parse_blend_header_slice(b"NOT_A_BLEND!").unwrap_err(),
            HeaderReadError::InvalidMagic
        );
        assert_eq!(
            parse_blend_header_slice(b"BLENDER_vXYZ").unwrap_err(),
            HeaderReadError::InvalidVersion
        );
    }
}
