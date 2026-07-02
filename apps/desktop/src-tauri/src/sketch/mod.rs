//! Sketch (docs/sketch-design.md) — the v2 界面结构 layer's Rust half.
//!
//! Per the K3 corollary this module is storage-only: Spec serde mirror,
//! heal-on-load, the rebuildable `.sketch-index.json`, and commands. The
//! class core (toIR/emit) lives exclusively in `packages/sketch-core` (TS),
//! shared by the editor canvas and the codegen-server.

pub mod commands;
pub mod index;
pub mod storage;
pub mod types;
