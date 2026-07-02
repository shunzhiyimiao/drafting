//! Serde mirror of the Sketch Spec.
//!
//! `packages/sketch-core/src/spec.ts` is authoritative (docs/sketch-design.md
//! §3); this mirror is isomorphic and — per the K3 corollary — Rust only
//! stores and indexes Sketches. It never computes a className.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sketch {
    pub id: String,
    pub name: String,
    pub blueprint_ref: Option<String>,
    /// TS types this as `Container`; the serialized JSON carries
    /// `kind:"stack"`, so the mirror holds a `Node` and storage validates
    /// stack-ness on load.
    pub root: Node,
    pub schema_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum Node {
    #[serde(rename = "stack")]
    Stack(Container),
    #[serde(rename = "text")]
    Text(TextP),
    #[serde(rename = "button")]
    Button(ButtonP),
    #[serde(rename = "input")]
    Input(InputP),
    #[serde(rename = "image")]
    Image(ImageP),
}

impl Node {
    pub fn id(&self) -> &str {
        match self {
            Node::Stack(n) => &n.id,
            Node::Text(n) => &n.id,
            Node::Button(n) => &n.id,
            Node::Input(n) => &n.id,
            Node::Image(n) => &n.id,
        }
    }

    pub fn id_mut(&mut self) -> &mut String {
        match self {
            Node::Stack(n) => &mut n.id,
            Node::Text(n) => &mut n.id,
            Node::Button(n) => &mut n.id,
            Node::Input(n) => &mut n.id,
            Node::Image(n) => &mut n.id,
        }
    }

    pub fn children_mut(&mut self) -> Option<&mut Vec<Node>> {
        match self {
            Node::Stack(n) => Some(&mut n.children),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Container {
    pub id: String,
    pub layout: Layout,
    pub sizing: Sizing,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<Style>,
    pub children: Vec<Node>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextP {
    pub id: String,
    pub role: TypeToken,
    pub content: String,
    pub sizing: Sizing,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<Style>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub semantics: Option<SemanticDecl>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ButtonP {
    pub id: String,
    pub label: String,
    pub variant: ButtonVariant,
    pub sizing: Sizing,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<Style>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intent: Option<Intent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub semantics: Option<SemanticDecl>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputP {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(rename = "type")]
    pub input_type: InputType,
    pub sizing: Sizing,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<Style>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub semantics: Option<SemanticDecl>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageP {
    pub id: String,
    pub src: String,
    pub alt: String,
    pub sizing: Sizing,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<Style>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub semantics: Option<SemanticDecl>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub direction: Direction,
    pub gap: u8,
    pub padding: Edges,
    pub main_axis: MainAxis,
    pub cross_axis: CrossAxis,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edges {
    pub top: u8,
    pub right: u8,
    pub bottom: u8,
    pub left: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum Size {
    Hug,
    Fill,
    Fixed { px: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sizing {
    pub width: Size,
    pub height: Size,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Style {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bg: Option<ColorToken>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fg: Option<ColorToken>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border: Option<Border>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radius: Option<RadiusToken>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Border {
    pub width: BorderWidth,
    pub color: ColorToken,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BorderWidth {
    None,
    Thin,
    Thick,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Intent {
    Navigate { to: Option<String> },
    Submit,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticDecl {
    pub declared: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proposed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Row,
    Col,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MainAxis {
    Start,
    Center,
    End,
    Between,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CrossAxis {
    Start,
    Center,
    End,
    Stretch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TypeToken {
    Heading,
    Subhead,
    Body,
    Caption,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ColorToken {
    Surface,
    Raised,
    Text,
    Muted,
    Primary,
    OnPrimary,
    Border,
    Danger,
    OnDanger,
    Transparent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RadiusToken {
    None,
    Sm,
    Md,
    Lg,
    Xl,
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ButtonVariant {
    Primary,
    Secondary,
    Ghost,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InputType {
    Text,
    Email,
    Password,
}
