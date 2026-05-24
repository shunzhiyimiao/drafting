use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Position (for react-flow node placement)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

// ---------------------------------------------------------------------------
// Socket (contract/interface definition)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SocketLifecycle {
    Draft,
    Stable,
    Deprecated,
    Removed,
}

impl Default for SocketLifecycle {
    fn default() -> Self {
        Self::Draft
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MethodParam {
    pub name: String,
    pub param_type: String,
    #[serde(default)]
    pub optional: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocketMethod {
    pub name: String,
    pub params: Vec<MethodParam>,
    pub return_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocketDefinition {
    pub id: String,
    pub full_name: String,
    pub display_name: String,
    #[serde(default)]
    pub lifecycle: SocketLifecycle,
    #[serde(default)]
    pub extends: Vec<String>,
    #[serde(default)]
    pub methods: Vec<SocketMethod>,
    pub created_at: u64,
    pub updated_at: u64,
}

// ---------------------------------------------------------------------------
// Registry index
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntry {
    pub id: String,
    pub full_name: String,
    pub display_name: String,
    pub lifecycle: SocketLifecycle,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryIndex {
    pub version: u32,
    pub sockets: Vec<RegistryEntry>,
}

impl Default for RegistryIndex {
    fn default() -> Self {
        Self {
            version: 1,
            sockets: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AdapterParamType {
    #[serde(rename_all = "camelCase")]
    SocketDep { socket_id: String },
    Primitive { type_name: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterConstructorParam {
    pub name: String,
    pub param_type: AdapterParamType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterNode {
    pub id: String,
    pub name: String,
    pub implements: Vec<String>,
    #[serde(default)]
    pub constructor_params: Vec<AdapterConstructorParam>,
    #[serde(default)]
    pub position: Position,
}

// ---------------------------------------------------------------------------
// Socket reference (on canvas)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocketReference {
    pub socket_id: String,
    #[serde(default)]
    pub position: Position,
}

// ---------------------------------------------------------------------------
// Wire (dependency injection connector)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Wire {
    pub id: String,
    pub from_adapter_id: String,
    pub from_socket_id: String,
    pub to_adapter_id: String,
    pub to_param_name: String,
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryPoint {
    pub id: String,
    pub adapter_id: String,
    pub export_name: String,
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Canvas {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub socket_refs: Vec<SocketReference>,
    #[serde(default)]
    pub adapters: Vec<AdapterNode>,
    #[serde(default)]
    pub wires: Vec<Wire>,
    #[serde(default)]
    pub entry_points: Vec<EntryPoint>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSummary {
    pub id: String,
    pub name: String,
    pub adapter_count: usize,
    pub wire_count: usize,
    pub updated_at: u64,
}

impl Canvas {
    pub fn summary(&self) -> CanvasSummary {
        CanvasSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            adapter_count: self.adapters.len(),
            wire_count: self.wires.len(),
            updated_at: self.updated_at,
        }
    }
}

// ---------------------------------------------------------------------------
// Patchboard config
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchboardConfig {
    pub version: u32,
    pub scope_name: String,
    pub sockets_package: String,
    pub adapters_package: String,
    pub wiring_package: String,
}

impl Default for PatchboardConfig {
    fn default() -> Self {
        Self {
            version: 1,
            scope_name: "@myapp".to_string(),
            sockets_package: "packages/sockets".to_string(),
            adapters_package: "packages/adapters".to_string(),
            wiring_package: "packages/wiring".to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Command input types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSocketInput {
    pub full_name: String,
    pub display_name: String,
    #[serde(default)]
    pub extends: Vec<String>,
    #[serde(default)]
    pub methods: Vec<SocketMethod>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSocketInput {
    pub id: String,
    pub full_name: Option<String>,
    pub display_name: Option<String>,
    pub lifecycle: Option<SocketLifecycle>,
    pub extends: Option<Vec<String>>,
    pub methods: Option<Vec<SocketMethod>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeGenResult {
    pub success: bool,
    pub files: Vec<String>,
    #[serde(default)]
    pub errors: Vec<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn new_ulid() -> String {
    ulid::Ulid::new().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn socket_definition_round_trip() {
        let socket = SocketDefinition {
            id: new_ulid(),
            full_name: "auth/IAuthService".to_string(),
            display_name: "Auth Service".to_string(),
            lifecycle: SocketLifecycle::Draft,
            extends: vec![],
            methods: vec![SocketMethod {
                name: "login".to_string(),
                params: vec![MethodParam {
                    name: "email".to_string(),
                    param_type: "string".to_string(),
                    optional: false,
                }],
                return_type: "Promise<boolean>".to_string(),
            }],
            created_at: now_ms(),
            updated_at: now_ms(),
        };
        let json = serde_json::to_string_pretty(&socket).unwrap();
        let parsed: SocketDefinition = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.full_name, socket.full_name);
        assert_eq!(parsed.methods.len(), 1);
    }

    #[test]
    fn canvas_round_trip() {
        let canvas = Canvas {
            id: new_ulid(),
            name: "test-canvas".to_string(),
            socket_refs: vec![],
            adapters: vec![AdapterNode {
                id: new_ulid(),
                name: "TestAdapter".to_string(),
                implements: vec!["socket-1".to_string()],
                constructor_params: vec![AdapterConstructorParam {
                    name: "db".to_string(),
                    param_type: AdapterParamType::SocketDep {
                        socket_id: "socket-2".to_string(),
                    },
                }],
                position: Position { x: 100.0, y: 200.0 },
            }],
            wires: vec![],
            entry_points: vec![],
            created_at: now_ms(),
            updated_at: now_ms(),
        };
        let json = serde_json::to_string_pretty(&canvas).unwrap();
        let parsed: Canvas = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "test-canvas");
        assert_eq!(parsed.adapters.len(), 1);
    }

    #[test]
    fn adapter_param_type_serialization() {
        let dep = AdapterParamType::SocketDep {
            socket_id: "abc".to_string(),
        };
        let json = serde_json::to_string(&dep).unwrap();
        assert!(json.contains("\"kind\":\"socketDep\""));

        let prim = AdapterParamType::Primitive {
            type_name: "string".to_string(),
        };
        let json = serde_json::to_string(&prim).unwrap();
        assert!(json.contains("\"kind\":\"primitive\""));
    }
}
