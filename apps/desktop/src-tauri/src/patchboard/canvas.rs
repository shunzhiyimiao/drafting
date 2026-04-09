use std::path::Path;

use crate::patchboard::error::{PatchboardError, Result};
use crate::patchboard::types::*;

const CANVASES_DIR: &str = ".patchboard/canvases";

pub fn init_canvases_dir(project_root: &Path) -> Result<()> {
    let dir = project_root.join(CANVASES_DIR);
    std::fs::create_dir_all(&dir)?;
    Ok(())
}

pub fn list_canvases(project_root: &Path) -> Result<Vec<CanvasSummary>> {
    let dir = project_root.join(CANVASES_DIR);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut summaries = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path
            .file_name()
            .map_or(false, |n| n.to_string_lossy().ends_with(".canvas.json"))
        {
            let data = std::fs::read_to_string(&path)?;
            if let Ok(canvas) = serde_json::from_str::<Canvas>(&data) {
                summaries.push(canvas.summary());
            }
        }
    }
    summaries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(summaries)
}

pub fn load_canvas(project_root: &Path, canvas_id: &str) -> Result<Canvas> {
    let path = project_root
        .join(CANVASES_DIR)
        .join(format!("{}.canvas.json", canvas_id));
    if !path.exists() {
        return Err(PatchboardError::CanvasNotFound(canvas_id.to_string()));
    }
    let data = std::fs::read_to_string(&path)?;
    let canvas: Canvas = serde_json::from_str(&data)?;
    Ok(canvas)
}

pub fn save_canvas(project_root: &Path, canvas: &Canvas) -> Result<()> {
    let dir = project_root.join(CANVASES_DIR);
    std::fs::create_dir_all(&dir)?;

    let path = dir.join(format!("{}.canvas.json", canvas.id));
    let json = serde_json::to_string_pretty(canvas)?;
    std::fs::write(&path, json)?;
    Ok(())
}

pub fn delete_canvas(project_root: &Path, canvas_id: &str) -> Result<()> {
    let path = project_root
        .join(CANVASES_DIR)
        .join(format!("{}.canvas.json", canvas_id));
    if !path.exists() {
        return Err(PatchboardError::CanvasNotFound(canvas_id.to_string()));
    }
    std::fs::remove_file(&path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_canvas() -> Canvas {
        Canvas {
            id: new_ulid(),
            name: "test-canvas".to_string(),
            socket_refs: vec![],
            adapters: vec![],
            wires: vec![],
            entry_points: vec![],
            created_at: now_ms(),
            updated_at: now_ms(),
        }
    }

    #[test]
    fn init_and_list_empty() {
        let tmp = TempDir::new().unwrap();
        init_canvases_dir(tmp.path()).unwrap();
        let list = list_canvases(tmp.path()).unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn save_load_canvas() {
        let tmp = TempDir::new().unwrap();
        init_canvases_dir(tmp.path()).unwrap();

        let canvas = create_test_canvas();
        save_canvas(tmp.path(), &canvas).unwrap();

        let loaded = load_canvas(tmp.path(), &canvas.id).unwrap();
        assert_eq!(loaded.name, "test-canvas");
    }

    #[test]
    fn list_canvases_returns_summaries() {
        let tmp = TempDir::new().unwrap();
        init_canvases_dir(tmp.path()).unwrap();

        let c1 = Canvas {
            name: "alpha".to_string(),
            ..create_test_canvas()
        };
        let c2 = Canvas {
            name: "beta".to_string(),
            ..create_test_canvas()
        };
        save_canvas(tmp.path(), &c1).unwrap();
        save_canvas(tmp.path(), &c2).unwrap();

        let list = list_canvases(tmp.path()).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "alpha");
        assert_eq!(list[1].name, "beta");
    }

    #[test]
    fn delete_canvas_works() {
        let tmp = TempDir::new().unwrap();
        init_canvases_dir(tmp.path()).unwrap();

        let canvas = create_test_canvas();
        save_canvas(tmp.path(), &canvas).unwrap();
        assert_eq!(list_canvases(tmp.path()).unwrap().len(), 1);

        delete_canvas(tmp.path(), &canvas.id).unwrap();
        assert_eq!(list_canvases(tmp.path()).unwrap().len(), 0);
    }
}
