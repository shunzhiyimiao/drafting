//! Atlas 测绘 (B-spade MVP) — the FACT level of the two-tier doctrine.
//!
//! 两级教义:事实级(无需核准,本模块的全部)与提案级(proposed-only,
//! 人升 declared — B 阶段 2,未开工)。这里禁止:任何 LLM 调用、任何
//! adapter 候选、任何「像是」判断。产出的一切都是可从源码直接读出的事实。
//!
//! 语言分工与 K3 同构:Rust 腿在本模块(cargo metadata 子进程 + syn 扫描),
//! TS 腿在 codegen-server(TS compiler API),Rust 经 RPC 编排。两条腿都
//! 挂在 `survey_*` 接缝上,未来语言腿可插。诚实降级:传感器不可用(cargo
//! 不在 PATH、RPC 失败)→ 对应腿为 None + warnings 记录原因,绝不装数据。

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use syn::visit::Visit;

// ---------------------------------------------------------------- the map --

/// The whole survey — persisted verbatim as `.atlas/map.json` (a purely
/// derived cache; rebuildable at will; never committed).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasMap {
    pub version: u32,
    pub generated_at_ms: u64,
    pub rust: Option<RustSurvey>,
    pub ts: Option<TsSurvey>,
    /// Honest-degradation notes: which leg failed and why.
    pub warnings: Vec<String>,
}

pub const ATLAS_MAP_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RustSurvey {
    pub members: Vec<CrateSurvey>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrateSurvey {
    pub name: String,
    /// Manifest directory, project-relative where possible.
    pub manifest_dir: String,
    /// Declared dependency names (facts from the manifest, not resolved).
    pub deps: Vec<String>,
    pub pub_fns: Vec<String>,
    pub pub_structs: Vec<String>,
    pub pub_traits: Vec<String>,
    pub trait_impls: Vec<TraitImpl>,
    pub routes: Vec<RouteEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct TraitImpl {
    pub trait_name: String,
    pub type_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct RouteEntry {
    pub method: String,
    pub path: String,
    pub handler: String,
}

/// Mirror of the codegen-server's `atlasScanTs` output (the TS leg).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TsSurvey {
    pub packages: Vec<TsPackage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TsPackage {
    pub name: String,
    pub dir: String,
    pub deps: Vec<String>,
    pub file_count: u32,
    /// Resolved file→file edges for RELATIVE imports (project-relative paths).
    pub internal_edges: Vec<TsEdge>,
    /// Distinct external module specifiers imported anywhere in the package.
    pub external_imports: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TsEdge {
    pub from: String,
    pub to: String,
}

// -------------------------------------------------- cargo metadata (facts) --

#[derive(Debug, Deserialize)]
struct MetaRoot {
    packages: Vec<MetaPkg>,
    workspace_members: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct MetaPkg {
    id: String,
    name: String,
    manifest_path: String,
    dependencies: Vec<MetaDep>,
}

#[derive(Debug, Deserialize)]
struct MetaDep {
    name: String,
}

/// One workspace member's facts, straight from `cargo metadata`.
#[derive(Debug, Clone, PartialEq)]
pub struct MemberMeta {
    pub name: String,
    pub manifest_dir: PathBuf,
    pub deps: Vec<String>,
}

/// Parse the `cargo metadata --format-version 1 --no-deps` JSON. Pure —
/// unit-tested against a canned document.
pub fn parse_cargo_metadata(json: &str) -> Result<Vec<MemberMeta>, String> {
    let root: MetaRoot = serde_json::from_str(json).map_err(|e| format!("metadata JSON: {e}"))?;
    let member_ids: BTreeSet<&str> = root.workspace_members.iter().map(String::as_str).collect();
    let mut out: Vec<MemberMeta> = root
        .packages
        .iter()
        .filter(|p| member_ids.contains(p.id.as_str()))
        .map(|p| {
            let mut deps: Vec<String> = p.dependencies.iter().map(|d| d.name.clone()).collect();
            deps.sort();
            deps.dedup();
            MemberMeta {
                name: p.name.clone(),
                manifest_dir: Path::new(&p.manifest_path)
                    .parent()
                    .unwrap_or(Path::new(""))
                    .to_path_buf(),
                deps,
            }
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Run `cargo metadata` for the project (same subprocess class as the
/// compile-gate sensor). Not-a-Rust-project is the caller's check.
pub async fn cargo_workspace(project_root: &Path) -> Result<Vec<MemberMeta>, String> {
    let out = tokio::process::Command::new("cargo")
        .args(["metadata", "--format-version", "1", "--no-deps"])
        .current_dir(project_root)
        .output()
        .await
        .map_err(|e| format!("cargo 不可用: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "cargo metadata 失败: {}",
            String::from_utf8_lossy(&out.stderr).lines().next().unwrap_or("")
        ));
    }
    parse_cargo_metadata(&String::from_utf8_lossy(&out.stdout))
}

// --------------------------------------------------------- syn scan (facts) --

/// Everything the syn pass reads out of one crate's sources.
#[derive(Debug, Default, PartialEq)]
pub struct ItemsScan {
    pub pub_fns: BTreeSet<String>,
    pub pub_structs: BTreeSet<String>,
    pub pub_traits: BTreeSet<String>,
    pub trait_impls: BTreeSet<(String, String)>,
    pub routes: Vec<RouteEntry>,
}

struct Collector<'a> {
    scan: &'a mut ItemsScan,
}

const ROUTE_METHODS: [&str; 8] = ["get", "post", "put", "delete", "patch", "head", "options", "any"];

fn last_segment(path: &syn::Path) -> Option<String> {
    path.segments.last().map(|s| s.ident.to_string())
}

fn type_last_segment(ty: &syn::Type) -> Option<String> {
    match ty {
        syn::Type::Path(p) => last_segment(&p.path),
        syn::Type::Reference(r) => type_last_segment(&r.elem),
        _ => None,
    }
}

impl<'ast> Visit<'ast> for Collector<'_> {
    fn visit_item_fn(&mut self, node: &'ast syn::ItemFn) {
        if matches!(node.vis, syn::Visibility::Public(_)) {
            self.scan.pub_fns.insert(node.sig.ident.to_string());
        }
        syn::visit::visit_item_fn(self, node);
    }

    fn visit_item_struct(&mut self, node: &'ast syn::ItemStruct) {
        if matches!(node.vis, syn::Visibility::Public(_)) {
            self.scan.pub_structs.insert(node.ident.to_string());
        }
        syn::visit::visit_item_struct(self, node);
    }

    fn visit_item_trait(&mut self, node: &'ast syn::ItemTrait) {
        if matches!(node.vis, syn::Visibility::Public(_)) {
            self.scan.pub_traits.insert(node.ident.to_string());
        }
        syn::visit::visit_item_trait(self, node);
    }

    fn visit_item_impl(&mut self, node: &'ast syn::ItemImpl) {
        if let Some((_, trait_path, _)) = &node.trait_ {
            if let (Some(t), Some(ty)) = (last_segment(trait_path), type_last_segment(&node.self_ty))
            {
                self.scan.trait_impls.insert((t, ty));
            }
        }
        syn::visit::visit_item_impl(self, node);
    }

    /// Axum-shaped route facts: `.route("/path", get(handler))` — a literal
    /// path and a known method helper wrapping a handler path. Anything
    /// fancier (dynamic paths, merge/nest) is out of MVP scope by design.
    fn visit_expr_method_call(&mut self, node: &'ast syn::ExprMethodCall) {
        if node.method == "route" && node.args.len() == 2 {
            let path_lit = match &node.args[0] {
                syn::Expr::Lit(syn::ExprLit { lit: syn::Lit::Str(s), .. }) => Some(s.value()),
                _ => None,
            };
            if let (Some(path), syn::Expr::Call(call)) = (path_lit, &node.args[1]) {
                if let syn::Expr::Path(f) = call.func.as_ref() {
                    if let Some(method) = last_segment(&f.path) {
                        if ROUTE_METHODS.contains(&method.as_str()) {
                            let handler = call
                                .args
                                .first()
                                .and_then(|a| match a {
                                    syn::Expr::Path(p) => last_segment(&p.path),
                                    _ => None,
                                })
                                .unwrap_or_else(|| "<expr>".into());
                            self.scan.routes.push(RouteEntry {
                                method: method.to_uppercase(),
                                path,
                                handler,
                            });
                        }
                    }
                }
            }
        }
        syn::visit::visit_expr_method_call(self, node);
    }
}

/// Scan every `.rs` under `dir` (skipping target/vendor noise). Files that
/// fail to parse are skipped with a warning — facts only, never guesses.
pub fn scan_rust_sources(dir: &Path, warnings: &mut Vec<String>) -> ItemsScan {
    let mut scan = ItemsScan::default();
    let mut files = Vec::new();
    collect_files(dir, "rs", &["target", "node_modules", ".git"], &mut files);
    files.sort();
    for file in files {
        let Ok(content) = std::fs::read_to_string(&file) else {
            continue;
        };
        match syn::parse_file(&content) {
            Ok(ast) => {
                let mut c = Collector { scan: &mut scan };
                c.visit_file(&ast);
            }
            Err(e) => warnings.push(format!("syn 跳过 {}: {e}", file.display())),
        }
    }
    scan.routes.sort();
    scan.routes.dedup();
    scan
}

fn collect_files(dir: &Path, ext: &str, skip: &[&str], out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if !skip.contains(&name.as_str()) && !name.starts_with('.') {
                collect_files(&path, ext, skip, out);
            }
        } else if path.extension().and_then(|e| e.to_str()) == Some(ext) {
            out.push(path);
        }
    }
}

// ----------------------------------------------------------- the Rust leg --

/// Survey the Rust half of a project. `None` = not a Rust project (no root
/// Cargo.toml); a failed sensor degrades honestly into `warnings`.
pub async fn survey_rust(project_root: &Path, warnings: &mut Vec<String>) -> Option<RustSurvey> {
    if !project_root.join("Cargo.toml").exists() {
        return None;
    }
    let members = match cargo_workspace(project_root).await {
        Ok(m) => m,
        Err(e) => {
            warnings.push(format!("Rust 腿降级: {e}"));
            return None;
        }
    };
    let mut out = Vec::new();
    for m in members {
        let scan = scan_rust_sources(&m.manifest_dir.join("src"), warnings);
        let rel = m
            .manifest_dir
            .strip_prefix(project_root)
            .unwrap_or(&m.manifest_dir)
            .to_string_lossy()
            .to_string();
        out.push(CrateSurvey {
            name: m.name,
            manifest_dir: rel,
            deps: m.deps,
            pub_fns: scan.pub_fns.into_iter().collect(),
            pub_structs: scan.pub_structs.into_iter().collect(),
            pub_traits: scan.pub_traits.into_iter().collect(),
            trait_impls: scan
                .trait_impls
                .into_iter()
                .map(|(trait_name, type_name)| TraitImpl { trait_name, type_name })
                .collect(),
            routes: scan.routes,
        });
    }
    Some(RustSurvey { members: out })
}

// ------------------------------------------------------------------- tests --

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/atlas/mini-crate")
    }

    #[test]
    fn syn_scan_reads_pub_items_impls_and_routes() {
        let mut warnings = Vec::new();
        let scan = scan_rust_sources(&fixture().join("src"), &mut warnings);
        assert_eq!(warnings, Vec::<String>::new());

        // The axum-shaped stand-ins (get/post/Router/Handler) are pub facts
        // of the fixture too — the scanner reports what IS there.
        assert_eq!(
            scan.pub_fns.iter().cloned().collect::<Vec<_>>(),
            vec!["create_user", "get", "list_users", "post", "router"],
        );
        assert_eq!(
            scan.pub_structs.iter().cloned().collect::<Vec<_>>(),
            vec!["Handler", "Router", "User", "UserRepo"],
        );
        assert_eq!(scan.pub_traits.iter().cloned().collect::<Vec<_>>(), vec!["Repo"]);
        assert_eq!(
            scan.trait_impls.iter().cloned().collect::<Vec<_>>(),
            vec![("Repo".into(), "UserRepo".into())],
        );
        assert_eq!(
            scan.routes,
            vec![
                RouteEntry { method: "GET".into(), path: "/users".into(), handler: "list_users".into() },
                RouteEntry { method: "POST".into(), path: "/users".into(), handler: "create_user".into() },
            ],
        );
        // Private items never leak into the fact sheet.
        assert!(!scan.pub_fns.contains("internal_helper"));
    }

    #[test]
    fn cargo_metadata_parsing_is_deterministic() {
        let canned = r#"{
          "packages": [
            {
              "id": "path+file:///w/mini#mini-crate@0.1.0",
              "name": "mini-crate",
              "manifest_path": "/w/mini/Cargo.toml",
              "dependencies": [ { "name": "serde" }, { "name": "tokio" }, { "name": "serde" } ]
            },
            {
              "id": "registry+https://crates.io#serde@1.0.0",
              "name": "serde",
              "manifest_path": "/x/serde/Cargo.toml",
              "dependencies": []
            }
          ],
          "workspace_members": ["path+file:///w/mini#mini-crate@0.1.0"]
        }"#;
        let members = parse_cargo_metadata(canned).unwrap();
        assert_eq!(members.len(), 1, "non-members never count");
        assert_eq!(members[0].name, "mini-crate");
        assert_eq!(members[0].deps, vec!["serde", "tokio"], "sorted + deduped");
        assert_eq!(members[0].manifest_dir, Path::new("/w/mini"));
    }
}
