//! Sketch storage (docs/sketch-design.md §6): `sketches/*.sketch.json`, flat,
//! in git. Writes stay inside `sketches/**` + the index — the write-invariant
//! boundary is "who writes whose directory" (criterion.sketch_node is
//! blueprint-domain and never written from here).

use std::path::{Path, PathBuf};

use super::types::{
    Container, CrossAxis, Direction, Edges, Layout, MainAxis, Node, Size, Sizing, Sketch,
};

pub fn sketches_dir(root: &Path) -> PathBuf {
    root.join("sketches")
}

/// Node-id stability rule 1 (§6): heal-on-load — any id-less node mints a
/// ULID (copy of `load_blueprint_self_heals`); ids are stable from first
/// load. Returns whether anything was minted (→ caller writes back).
pub fn heal(sketch: &mut Sketch) -> bool {
    let mut changed = false;
    if sketch.id.is_empty() {
        sketch.id = ulid::Ulid::new().to_string();
        changed = true;
    }
    heal_node(&mut sketch.root, &mut changed);
    changed
}

fn heal_node(node: &mut Node, changed: &mut bool) {
    if node.id().is_empty() {
        *node.id_mut() = ulid::Ulid::new().to_string();
        *changed = true;
    }
    if let Some(children) = node.children_mut() {
        for child in children {
            heal_node(child, changed);
        }
    }
}

/// Load one `.sketch.json`: parse → validate the root is a stack → heal →
/// write the healed form back (ids must be durable before anything binds to
/// them — the S6 badge lesson).
pub fn load(path: &Path) -> Result<Sketch, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("read {}: {e}", path.display()))?;
    let mut sketch: Sketch =
        serde_json::from_str(&raw).map_err(|e| format!("parse {}: {e}", path.display()))?;
    if !matches!(sketch.root, Node::Stack(_)) {
        return Err(format!(
            "{}: sketch root must be a stack container",
            path.display()
        ));
    }
    if heal(&mut sketch) {
        save(path, &sketch)?;
        log::info!("sketch heal-on-load minted ids: {}", path.display());
    }
    Ok(sketch)
}

pub fn save(path: &Path, sketch: &Sketch) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("mkdir {}: {e}", dir.display()))?;
    }
    let json = serde_json::to_string_pretty(sketch)
        .map_err(|e| format!("serialize sketch {}: {e}", sketch.id))?;
    std::fs::write(path, json + "\n").map_err(|e| format!("write {}: {e}", path.display()))
}

/// All sketches in the project, healed. Skips unparseable files with a log
/// line rather than failing the whole list (degrade, don't crash).
pub fn list(root: &Path) -> Vec<(PathBuf, Sketch)> {
    let dir = sketches_dir(root);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.ends_with(".sketch.json"))
        {
            continue;
        }
        match load(&path) {
            Ok(sketch) => out.push((path, sketch)),
            Err(e) => log::warn!("skipping unreadable sketch: {e}"),
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

pub fn find_by_id(root: &Path, sketch_id: &str) -> Option<(PathBuf, Sketch)> {
    list(root).into_iter().find(|(_, s)| s.id == sketch_id)
}

/// Delete a sketch by id. The generated React half goes with it (tool-owned,
/// regenerated wholesale — its source is gone); the user-owned sibling is
/// never touched: its now-dead import becomes a tsc error, which is the
/// honest signal to the owner. Criteria bound to this sketch go dangling
/// per §6 — a signal, never a cascade.
pub fn delete(root: &Path, sketch_id: &str) -> Result<(), String> {
    let (path, _) = find_by_id(root, sketch_id)
        .ok_or_else(|| format!("sketch {sketch_id} not found"))?;
    std::fs::remove_file(&path).map_err(|e| format!("delete {}: {e}", path.display()))?;
    if let Some(slug) = path
        .file_name()
        .and_then(|n| n.to_str())
        .and_then(|n| n.strip_suffix(".sketch.json"))
    {
        let generated = root.join(format!("packages/ui/src/generated/{slug}.generated.tsx"));
        if generated.exists() {
            if let Err(e) = std::fs::remove_file(&generated) {
                log::warn!("sketch delete: generated half not removed: {e}");
            }
        }
    }
    Ok(())
}

fn slugify(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    let slug = slug
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() { "sketch".to_string() } else { slug }
}

/// Create a new sketch: minted ids, a default empty column root, filename
/// from the slugified name (deduped with -2, -3… on collision).
pub fn create(root: &Path, name: &str, blueprint_ref: Option<String>) -> Result<(PathBuf, Sketch), String> {
    let sketch = Sketch {
        id: ulid::Ulid::new().to_string(),
        name: name.to_string(),
        blueprint_ref,
        root: Node::Stack(Container {
            id: ulid::Ulid::new().to_string(),
            layout: Layout {
                direction: Direction::Col,
                gap: 4,
                padding: Edges { top: 4, right: 4, bottom: 4, left: 4 },
                main_axis: MainAxis::Start,
                cross_axis: CrossAxis::Stretch,
            },
            sizing: Sizing { width: Size::Fill, height: Size::Fill },
            style: None,
            children: Vec::new(),
        }),
        schema_version: 1,
    };

    let dir = sketches_dir(root);
    let base = slugify(name);
    let mut path = dir.join(format!("{base}.sketch.json"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{base}-{n}.sketch.json"));
        n += 1;
    }
    save(&path, &sketch)?;
    Ok((path, sketch))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// A TS-shaped fixture: exactly what sketch-core's spec.ts serializes
    /// (tags `kind`/`mode`, camelCase keys, kebab color tokens). The serde
    /// mirror must round-trip it value-identically.
    const TS_FIXTURE: &str = r#"{
  "id": "sk_login",
  "name": "Login Screen",
  "blueprintRef": "feat_login",
  "root": {
    "kind": "stack",
    "id": "root",
    "layout": {
      "direction": "col",
      "gap": 6,
      "padding": { "top": 6, "right": 6, "bottom": 6, "left": 6 },
      "mainAxis": "start",
      "crossAxis": "stretch"
    },
    "sizing": { "width": { "mode": "fill" }, "height": { "mode": "fill" } },
    "children": [
      {
        "kind": "text",
        "id": "title",
        "role": "heading",
        "content": "Sign in",
        "sizing": { "width": { "mode": "hug" }, "height": { "mode": "hug" } }
      },
      {
        "kind": "input",
        "id": "email",
        "label": "Email",
        "placeholder": "you@example.com",
        "type": "email",
        "sizing": { "width": { "mode": "fill" }, "height": { "mode": "hug" } }
      },
      {
        "kind": "button",
        "id": "submit",
        "label": "Sign in",
        "variant": "primary",
        "intent": { "kind": "submit" },
        "sizing": { "width": { "mode": "fixed", "px": 240 }, "height": { "mode": "hug" } },
        "style": { "bg": "on-primary" }
      },
      {
        "kind": "image",
        "id": "logo",
        "src": "/logo.png",
        "alt": "logo",
        "sizing": { "width": { "mode": "fixed", "px": 48 }, "height": { "mode": "fixed", "px": 48 } }
      }
    ]
  },
  "schemaVersion": 1
}"#;

    #[test]
    fn serde_mirror_round_trips_the_ts_shape() {
        let sketch: Sketch = serde_json::from_str(TS_FIXTURE).expect("parse TS-shaped JSON");
        assert_eq!(sketch.id, "sk_login");
        assert_eq!(sketch.blueprint_ref.as_deref(), Some("feat_login"));
        assert_eq!(sketch.schema_version, 1);

        // Value-identical round-trip (key order aside): reparse the
        // serialization and compare as JSON values.
        let out = serde_json::to_string_pretty(&sketch).unwrap();
        let a: serde_json::Value = serde_json::from_str(TS_FIXTURE).unwrap();
        let b: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(a, b, "serde mirror must not add, drop, or rename fields");
    }

    #[test]
    fn load_validates_root_and_heals_missing_ids() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(sketches_dir(root)).unwrap();

        // A sketch whose nodes have empty ids → heal mints and writes back.
        let path = sketches_dir(root).join("a.sketch.json");
        std::fs::write(
            &path,
            r#"{
  "id": "",
  "name": "a",
  "blueprintRef": null,
  "root": {
    "kind": "stack",
    "id": "",
    "layout": { "direction": "col", "gap": 0,
      "padding": { "top": 0, "right": 0, "bottom": 0, "left": 0 },
      "mainAxis": "start", "crossAxis": "stretch" },
    "sizing": { "width": { "mode": "hug" }, "height": { "mode": "hug" } },
    "children": [
      { "kind": "text", "id": "", "role": "body", "content": "x",
        "sizing": { "width": { "mode": "hug" }, "height": { "mode": "hug" } } }
    ]
  },
  "schemaVersion": 1
}"#,
        )
        .unwrap();

        let healed = load(&path).expect("load heals");
        assert!(!healed.id.is_empty());
        assert!(!healed.root.id().is_empty());

        // The healed ids were written back — a second load mints nothing and
        // returns the same ids (stability from first load).
        let again = load(&path).expect("reload");
        assert_eq!(again.id, healed.id);
        assert_eq!(again.root.id(), healed.root.id());

        // Root must be a stack.
        let bad = sketches_dir(root).join("bad.sketch.json");
        std::fs::write(
            &bad,
            r#"{ "id": "x", "name": "bad", "blueprintRef": null,
  "root": { "kind": "text", "id": "t", "role": "body", "content": "x",
    "sizing": { "width": { "mode": "hug" }, "height": { "mode": "hug" } } },
  "schemaVersion": 1 }"#,
        )
        .unwrap();
        assert!(load(&bad).is_err());
    }

    #[test]
    fn delete_removes_sketch_and_its_generated_half_only() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        let (path, sketch) = create(root, "Login", None).unwrap();

        // Simulate the codegen landing: generated (tool-owned) + sibling (user's).
        let generated = root.join("packages/ui/src/generated/login.generated.tsx");
        let sibling = root.join("packages/ui/src/login.tsx");
        std::fs::create_dir_all(generated.parent().unwrap()).unwrap();
        std::fs::write(&generated, "// generated\n").unwrap();
        std::fs::write(&sibling, "// USER\n").unwrap();

        delete(root, &sketch.id).unwrap();
        assert!(!path.exists(), "sketch file removed");
        assert!(!generated.exists(), "tool-owned generated half removed");
        assert!(sibling.exists(), "user-owned sibling untouched");
        assert!(find_by_id(root, &sketch.id).is_none());

        // Unknown id is a clear error, not a silent no-op.
        assert!(delete(root, "nope").is_err());
    }

    #[test]
    fn create_slugs_filenames_and_dedupes_collisions() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();

        let (p1, s1) = create(root, "Login Screen!", None).unwrap();
        assert!(p1.ends_with("sketches/login-screen.sketch.json"));
        assert!(!s1.id.is_empty());
        assert!(matches!(s1.root, Node::Stack(_)));

        let (p2, _) = create(root, "Login Screen!", None).unwrap();
        assert!(p2.ends_with("sketches/login-screen-2.sketch.json"));

        assert_eq!(list(root).len(), 2);
        assert!(find_by_id(root, &s1.id).is_some());
    }
}
