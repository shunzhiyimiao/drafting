use std::path::Path;

use crate::patchboard::error::{PatchboardError, Result};
use crate::patchboard::types::*;

const REGISTRY_DIR: &str = ".patchboard/registry";
const SOCKETS_DIR: &str = ".patchboard/registry/sockets";
const INDEX_FILE: &str = ".patchboard/registry/index.json";

pub fn init_registry(project_root: &Path) -> Result<()> {
    let sockets_dir = project_root.join(SOCKETS_DIR);
    std::fs::create_dir_all(&sockets_dir)?;

    let index_path = project_root.join(INDEX_FILE);
    if !index_path.exists() {
        let index = RegistryIndex::default();
        let json = serde_json::to_string_pretty(&index)?;
        std::fs::write(&index_path, json)?;
    }
    Ok(())
}

pub fn load_registry(project_root: &Path) -> Result<RegistryIndex> {
    let index_path = project_root.join(INDEX_FILE);
    if !index_path.exists() {
        return Ok(RegistryIndex::default());
    }
    let data = std::fs::read_to_string(&index_path)?;
    let index: RegistryIndex = serde_json::from_str(&data)?;
    Ok(index)
}

pub fn load_socket(project_root: &Path, socket_id: &str) -> Result<SocketDefinition> {
    let path = project_root
        .join(SOCKETS_DIR)
        .join(format!("{}.json", socket_id));
    if !path.exists() {
        return Err(PatchboardError::SocketNotFound(socket_id.to_string()));
    }
    let data = std::fs::read_to_string(&path)?;
    let socket: SocketDefinition = serde_json::from_str(&data)?;
    Ok(socket)
}

pub fn save_socket(project_root: &Path, socket: &SocketDefinition) -> Result<()> {
    let sockets_dir = project_root.join(SOCKETS_DIR);
    std::fs::create_dir_all(&sockets_dir)?;

    let path = sockets_dir.join(format!("{}.json", socket.id));
    let json = serde_json::to_string_pretty(socket)?;
    std::fs::write(&path, json)?;

    update_index(project_root)?;
    Ok(())
}

pub fn delete_socket(project_root: &Path, socket_id: &str) -> Result<()> {
    let path = project_root
        .join(SOCKETS_DIR)
        .join(format!("{}.json", socket_id));
    if !path.exists() {
        return Err(PatchboardError::SocketNotFound(socket_id.to_string()));
    }
    std::fs::remove_file(&path)?;
    update_index(project_root)?;
    Ok(())
}

fn update_index(project_root: &Path) -> Result<()> {
    let sockets_dir = project_root.join(SOCKETS_DIR);
    let mut entries = Vec::new();

    if sockets_dir.exists() {
        for entry in std::fs::read_dir(&sockets_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "json") {
                let data = std::fs::read_to_string(&path)?;
                if let Ok(socket) = serde_json::from_str::<SocketDefinition>(&data) {
                    entries.push(RegistryEntry {
                        id: socket.id,
                        full_name: socket.full_name,
                        display_name: socket.display_name,
                        lifecycle: socket.lifecycle,
                        updated_at: socket.updated_at,
                    });
                }
            }
        }
    }

    entries.sort_by(|a, b| a.full_name.cmp(&b.full_name));

    let index = RegistryIndex {
        version: 1,
        sockets: entries,
    };
    let json = serde_json::to_string_pretty(&index)?;
    std::fs::write(project_root.join(INDEX_FILE), json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_socket() -> SocketDefinition {
        SocketDefinition {
            id: new_ulid(),
            full_name: "test/ITestService".to_string(),
            display_name: "Test Service".to_string(),
            lifecycle: SocketLifecycle::Draft,
            extends: vec![],
            methods: vec![SocketMethod {
                name: "doThing".to_string(),
                params: vec![],
                return_type: "void".to_string(),
            }],
            created_at: now_ms(),
            updated_at: now_ms(),
        }
    }

    #[test]
    fn init_creates_directory_and_index() {
        let tmp = TempDir::new().unwrap();
        init_registry(tmp.path()).unwrap();

        assert!(tmp.path().join(SOCKETS_DIR).exists());
        assert!(tmp.path().join(INDEX_FILE).exists());

        let index = load_registry(tmp.path()).unwrap();
        assert_eq!(index.sockets.len(), 0);
    }

    #[test]
    fn save_and_load_socket() {
        let tmp = TempDir::new().unwrap();
        init_registry(tmp.path()).unwrap();

        let socket = create_test_socket();
        save_socket(tmp.path(), &socket).unwrap();

        let loaded = load_socket(tmp.path(), &socket.id).unwrap();
        assert_eq!(loaded.full_name, socket.full_name);

        let index = load_registry(tmp.path()).unwrap();
        assert_eq!(index.sockets.len(), 1);
        assert_eq!(index.sockets[0].id, socket.id);
    }

    #[test]
    fn delete_socket_removes_file_and_updates_index() {
        let tmp = TempDir::new().unwrap();
        init_registry(tmp.path()).unwrap();

        let socket = create_test_socket();
        save_socket(tmp.path(), &socket).unwrap();
        assert_eq!(load_registry(tmp.path()).unwrap().sockets.len(), 1);

        delete_socket(tmp.path(), &socket.id).unwrap();
        assert_eq!(load_registry(tmp.path()).unwrap().sockets.len(), 0);
    }

    #[test]
    fn load_nonexistent_socket_returns_error() {
        let tmp = TempDir::new().unwrap();
        init_registry(tmp.path()).unwrap();

        let result = load_socket(tmp.path(), "nonexistent");
        assert!(result.is_err());
    }
}
