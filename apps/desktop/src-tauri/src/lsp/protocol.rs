//! LSP framing: Content-Length header + JSON body over stdio.
//!
//! Each message is:
//!   Content-Length: N\r\n
//!   \r\n
//!   <N bytes of JSON>

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, ChildStdout};

/// Encode a JSON value as an LSP message and write it to stdin.
pub async fn write_message(stdin: &mut ChildStdin, value: &Value) -> std::io::Result<()> {
    let body = serde_json::to_vec(value)?;
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    stdin.write_all(header.as_bytes()).await?;
    stdin.write_all(&body).await?;
    stdin.flush().await
}

/// Read a single LSP message from stdout. Returns the parsed JSON.
pub async fn read_message(reader: &mut BufReader<ChildStdout>) -> std::io::Result<Value> {
    let mut content_length: Option<usize> = None;
    let mut header_line = String::new();

    loop {
        header_line.clear();
        let n = reader.read_line(&mut header_line).await?;
        if n == 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "LSP server closed stdout",
            ));
        }

        let trimmed = header_line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            // End of headers
            break;
        }

        if let Some(rest) = trimmed.strip_prefix("Content-Length:") {
            let n: usize = rest
                .trim()
                .parse()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, format!("{e}")))?;
            content_length = Some(n);
        }
        // ignore Content-Type and other headers
    }

    let n = content_length.ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "missing Content-Length")
    })?;

    let mut buf = vec![0u8; n];
    reader.read_exact(&mut buf).await?;

    serde_json::from_slice(&buf)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, format!("{e}")))
}
