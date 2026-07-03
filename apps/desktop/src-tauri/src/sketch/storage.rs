//! Sketch storage (docs/sketch-design.md §6): `sketches/*.sketch.json`, flat,
//! in git. Writes stay inside `sketches/**` + the index — the write-invariant
//! boundary is "who writes whose directory" (criterion.sketch_node is
//! blueprint-domain and never written from here).

use std::path::{Path, PathBuf};

use super::types::{
    Container, CrossAxis, Direction, Edges, Layout, MainAxis, Node, Size, Sizing, Sketch,
};

/// Current Spec schema (mirrors sketch-core's SCHEMA_VERSION). v2 added
/// `list` + data binding.
pub const SCHEMA_VERSION: u32 = 2;

pub fn sketches_dir(root: &Path) -> PathBuf {
    root.join("sketches")
}

/// Node-id stability rule 1 (§6): heal-on-load — any id-less node mints a
/// ULID (copy of `load_blueprint_self_heals`); ids are stable from first
/// load. Also migrates older schema versions forward (v1 → v2 is the
/// identity migration: v2 only ADDED the `list` kind), riding the same
/// write-back channel. A version NEWER than this build is left untouched.
/// Returns whether anything changed (→ caller writes back).
pub fn heal(sketch: &mut Sketch) -> bool {
    let mut changed = false;
    if sketch.id.is_empty() {
        sketch.id = ulid::Ulid::new().to_string();
        changed = true;
    }
    if sketch.schema_version < SCHEMA_VERSION {
        sketch.schema_version = SCHEMA_VERSION;
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
    match node {
        Node::Stack(c) => {
            for child in &mut c.children {
                heal_node(child, changed);
            }
        }
        // A list's template subtree heals like any other — node-id stability
        // must reach template nodes (criteria bind to them too).
        Node::List(l) => heal_node(&mut l.template, changed),
        _ => {}
    }
}

/// Every list's template must be a stack container (the TS Spec types it as
/// `Container`; the mirror holds a `Node` for the serde tag — same pattern
/// as `Sketch.root`).
fn validate_templates(node: &Node) -> Result<(), String> {
    match node {
        Node::Stack(c) => c.children.iter().try_for_each(validate_templates),
        Node::List(l) => {
            if !matches!(*l.template, Node::Stack(_)) {
                return Err(format!("list {}: template must be a stack container", l.id));
            }
            validate_templates(&l.template)
        }
        _ => Ok(()),
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
    validate_templates(&sketch.root).map_err(|e| format!("{}: {e}", path.display()))?;
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
        schema_version: SCHEMA_VERSION,
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

    /// A TS-shaped v2 list fixture — bound text/image inside the template,
    /// sample rows, and UNKNOWN fields on the list and an itemShape entry
    /// (round-trip safety, Blueprint constraint 23: what this build doesn't
    /// know, it must not delete).
    const LIST_FIXTURE: &str = r#"{
  "id": "sk_inbox",
  "name": "Inbox",
  "blueprintRef": "feat_inbox",
  "root": {
    "kind": "stack",
    "id": "root",
    "layout": {
      "direction": "col",
      "gap": 4,
      "padding": { "top": 6, "right": 6, "bottom": 6, "left": 6 },
      "mainAxis": "start",
      "crossAxis": "stretch"
    },
    "sizing": { "width": { "mode": "fill" }, "height": { "mode": "fill" } },
    "children": [
      {
        "kind": "list",
        "id": "mail-list",
        "itemShape": [
          { "name": "id", "type": "string", "isKey": true, "futureRef": "bp_x" },
          { "name": "subject", "type": "string" },
          { "name": "avatar", "type": "image" }
        ],
        "dataKey": "inbox",
        "template": {
          "kind": "stack",
          "id": "mail-row",
          "layout": {
            "direction": "row",
            "gap": 3,
            "padding": { "top": 2, "right": 2, "bottom": 2, "left": 2 },
            "mainAxis": "start",
            "crossAxis": "center"
          },
          "sizing": { "width": { "mode": "fill" }, "height": { "mode": "hug" } },
          "children": [
            {
              "kind": "image",
              "id": "mail-avatar",
              "src": { "bind": "avatar" },
              "alt": "avatar",
              "sizing": { "width": { "mode": "fixed", "px": 32 }, "height": { "mode": "fixed", "px": 32 } }
            },
            {
              "kind": "text",
              "id": "mail-subject",
              "role": "body",
              "content": { "bind": "subject" },
              "sizing": { "width": { "mode": "fill" }, "height": { "mode": "hug" } }
            },
            {
              "kind": "button",
              "id": "mail-open",
              "label": "Open",
              "variant": "ghost",
              "intent": { "kind": "navigate", "to": null },
              "sizing": { "width": { "mode": "hug" }, "height": { "mode": "hug" } }
            }
          ]
        },
        "sampleRows": [
          { "id": "m1", "subject": "Welcome to Drafting", "avatar": "/a1.png" },
          { "id": "m2", "subject": "Your build is green", "avatar": "/a2.png" }
        ],
        "sizing": { "width": { "mode": "fill" }, "height": { "mode": "hug" } },
        "emptyState": { "future": "field this build does not know" }
      }
    ]
  },
  "schemaVersion": 2
}"#;

    #[test]
    fn serde_mirror_round_trips_a_list_with_unknown_fields() {
        let sketch: Sketch = serde_json::from_str(LIST_FIXTURE).expect("parse list JSON");
        let Node::Stack(ref root) = sketch.root else {
            panic!("root is a stack")
        };
        let Node::List(ref list) = root.children[0] else {
            panic!("child is a list")
        };
        assert_eq!(list.data_key, "inbox");
        assert_eq!(list.item_shape.len(), 3);
        assert_eq!(list.item_shape[0].is_key, Some(true));
        assert_eq!(list.sample_rows.len(), 2);
        // Unknown fields were captured, not dropped.
        assert!(list.extra.contains_key("emptyState"));
        assert!(list.item_shape[0].extra.contains_key("futureRef"));

        // Value-identical round-trip: unknown fields ride through and the
        // enum tag is not duplicated into the flatten map.
        let out = serde_json::to_string_pretty(&sketch).unwrap();
        let a: serde_json::Value = serde_json::from_str(LIST_FIXTURE).unwrap();
        let b: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(a, b, "list mirror must not add, drop, or rename fields");
    }

    #[test]
    fn heal_migrates_old_schema_versions_forward_and_reaches_templates() {
        // v1 → v2 is the identity migration (v2 only added `list`) + version
        // write-back through the same heal channel as id minting.
        let mut sketch: Sketch = serde_json::from_str(TS_FIXTURE).unwrap();
        assert_eq!(sketch.schema_version, 1);
        assert!(heal(&mut sketch), "migration reports a change to write back");
        assert_eq!(sketch.schema_version, SCHEMA_VERSION);
        assert!(!heal(&mut sketch), "second heal is a no-op");

        // Template nodes heal like any other (criteria bind to them too).
        let mut listed: Sketch = serde_json::from_str(
            &LIST_FIXTURE
                .replace(r#""id": "mail-row""#, r#""id": """#)
                .replace(r#""id": "mail-open""#, r#""id": """#),
        )
        .unwrap();
        assert!(heal(&mut listed));
        let Node::Stack(root) = &listed.root else {
            panic!()
        };
        let Node::List(list) = &root.children[0] else {
            panic!()
        };
        let Node::Stack(tmpl) = &*list.template else {
            panic!()
        };
        assert!(!tmpl.id.is_empty());
        let Node::Button(button) = &tmpl.children[2] else {
            panic!()
        };
        assert!(!button.id.is_empty());
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

        // And so must every list template.
        let bad_tmpl = sketches_dir(root).join("bad-template.sketch.json");
        std::fs::write(
            &bad_tmpl,
            r#"{ "id": "y", "name": "bad-template", "blueprintRef": null,
  "root": { "kind": "stack", "id": "r",
    "layout": { "direction": "col", "gap": 0,
      "padding": { "top": 0, "right": 0, "bottom": 0, "left": 0 },
      "mainAxis": "start", "crossAxis": "stretch" },
    "sizing": { "width": { "mode": "hug" }, "height": { "mode": "hug" } },
    "children": [
      { "kind": "list", "id": "l", "dataKey": "rows",
        "itemShape": [ { "name": "id", "type": "string", "isKey": true } ],
        "sampleRows": [],
        "template": { "kind": "text", "id": "t", "role": "body", "content": "x",
          "sizing": { "width": { "mode": "hug" }, "height": { "mode": "hug" } } },
        "sizing": { "width": { "mode": "fill" }, "height": { "mode": "hug" } } }
    ]
  },
  "schemaVersion": 2 }"#,
        )
        .unwrap();
        assert!(load(&bad_tmpl).is_err());
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
