use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SymbolKind {
    Class,
    Interface,
    Function,
    Method,
    Property,
    Enum,
    TypeAlias,
    Variable,
    Struct,
    Trait,
    Impl,
    Module,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasSymbol {
    pub name: String,
    pub kind: SymbolKind,
    pub line: u32,
    pub column: u32,
    pub detail: Option<String>,
    #[serde(default)]
    pub children: Vec<AtlasSymbol>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMap {
    pub path: String,
    pub language: String,
    pub symbols: Vec<AtlasSymbol>,
    pub total_lines: u32,
    pub adapter_id: Option<String>,
    pub file_blueprint_id: Option<String>,
    pub is_generated: bool,
}
