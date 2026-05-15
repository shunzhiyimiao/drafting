//! Type Bridge: classify every wire's type compatibility into four levels,
//! per CLAUDE.md Part 2.
//!
//! - L1 Lossless: target expects exactly the socket the source provides, or a
//!   socket the source's socket extends (i.e. upcast). Generated code wires
//!   directly.
//! - L2 Risky: expressible with a cast but needs user confirmation — for
//!   v1 we use this when target is a primitive param but source is a socket
//!   dep that happens to be compatible by name/shape. Generated code inserts
//!   an explicit cast with a TODO marker.
//! - L3 Structural: requires user-provided field mapping (v1 does not
//!   implement — flagged as L4).
//! - L4 Incompatible: canvas rejects the wire; generated code would emit a
//!   `undefined` with an error marker.
//!
//! v1 scope: only L1, L2, and L4 are emitted. L3 is mapped to L4.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use super::types::{
    AdapterNode, AdapterParamType, Canvas, SocketDefinition, Wire,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BridgeLevel {
    /// Direct compatibility; no adapter code needed.
    Lossless,
    /// Representable with a cast; user should confirm. Code emits a comment.
    Risky,
    /// Requires structural mapping; v1 does not emit.
    Structural,
    /// Not expressible; canvas rejects the wire.
    Incompatible,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireBridge {
    pub wire_id: String,
    pub level: BridgeLevel,
    pub reason: String,
    /// If non-empty, the wire cannot be rendered and codegen must emit an
    /// error marker.
    pub blocking: bool,
}

/// Classify every wire on a canvas. Sockets come from the registry.
pub fn classify_wires(canvas: &Canvas, sockets: &[SocketDefinition]) -> Vec<WireBridge> {
    let socket_by_id: HashMap<&str, &SocketDefinition> =
        sockets.iter().map(|s| (s.id.as_str(), s)).collect();
    let adapter_by_id: HashMap<&str, &AdapterNode> =
        canvas.adapters.iter().map(|a| (a.id.as_str(), a)).collect();

    canvas
        .wires
        .iter()
        .map(|w| classify_wire(w, &socket_by_id, &adapter_by_id))
        .collect()
}

fn classify_wire(
    wire: &Wire,
    sockets: &HashMap<&str, &SocketDefinition>,
    adapters: &HashMap<&str, &AdapterNode>,
) -> WireBridge {
    let target = match adapters.get(wire.to_adapter_id.as_str()) {
        Some(a) => a,
        None => return incompatible(wire, "target adapter not found on canvas"),
    };

    let source = match adapters.get(wire.from_adapter_id.as_str()) {
        Some(a) => a,
        None => return incompatible(wire, "source adapter not found on canvas"),
    };

    // Find the constructor param on the target by name.
    let param = match target
        .constructor_params
        .iter()
        .find(|p| p.name == wire.to_param_name)
    {
        Some(p) => p,
        None => {
            return incompatible(
                wire,
                &format!(
                    "target adapter '{}' has no constructor param '{}'",
                    target.name, wire.to_param_name
                ),
            )
        }
    };

    match &param.param_type {
        AdapterParamType::SocketDep { socket_id: expected } => {
            // Source must provide a socket (the wire says which). Also the
            // source adapter must implement that socket (or a descendant).
            if wire.from_socket_id.is_empty() {
                return incompatible(wire, "source socket not specified on wire");
            }
            if !source.implements.iter().any(|s| s == &wire.from_socket_id) {
                return incompatible(
                    wire,
                    &format!(
                        "source adapter '{}' does not implement socket '{}'",
                        source.name, wire.from_socket_id
                    ),
                );
            }

            // Exact match is L1.
            if &wire.from_socket_id == expected {
                return lossless(wire, "exact socket match");
            }

            // Upcast: `expected` is in the `extends` chain of from_socket.
            if is_ancestor(sockets, &wire.from_socket_id, expected) {
                return lossless(
                    wire,
                    &format!(
                        "upcast: source socket extends target socket '{}'",
                        expected
                    ),
                );
            }

            // Reverse direction is a downcast — not safe.
            if is_ancestor(sockets, expected, &wire.from_socket_id) {
                return WireBridge {
                    wire_id: wire.id.clone(),
                    level: BridgeLevel::Risky,
                    reason: format!(
                        "downcast: target '{}' is a subtype of source '{}'; verify at runtime",
                        expected, wire.from_socket_id
                    ),
                    blocking: false,
                };
            }

            incompatible(
                wire,
                &format!(
                    "socket '{}' cannot be assigned to parameter of type '{}'",
                    wire.from_socket_id, expected
                ),
            )
        }

        AdapterParamType::Primitive { type_name } => {
            // Wiring a Socket into a primitive param is always risky in v1:
            // there's no way to know without user confirmation. Allow as L2.
            WireBridge {
                wire_id: wire.id.clone(),
                level: BridgeLevel::Risky,
                reason: format!(
                    "wiring a socket into primitive parameter of type '{}' — confirm conversion",
                    type_name
                ),
                blocking: false,
            }
        }
    }
}

fn lossless(wire: &Wire, reason: &str) -> WireBridge {
    WireBridge {
        wire_id: wire.id.clone(),
        level: BridgeLevel::Lossless,
        reason: reason.into(),
        blocking: false,
    }
}

fn incompatible(wire: &Wire, reason: &str) -> WireBridge {
    WireBridge {
        wire_id: wire.id.clone(),
        level: BridgeLevel::Incompatible,
        reason: reason.into(),
        blocking: true,
    }
}

/// Is `ancestor` reachable by following `extends` from `child`?
fn is_ancestor(
    sockets: &HashMap<&str, &SocketDefinition>,
    child: &str,
    ancestor: &str,
) -> bool {
    if child == ancestor {
        return true;
    }
    let mut visited: HashSet<&str> = HashSet::new();
    let mut frontier: Vec<&str> = vec![child];
    while let Some(node) = frontier.pop() {
        if !visited.insert(node) {
            continue;
        }
        let def = match sockets.get(node) {
            Some(d) => d,
            None => continue,
        };
        for parent in &def.extends {
            if parent == ancestor {
                return true;
            }
            frontier.push(parent.as_str());
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::patchboard::types::*;

    fn socket(id: &str, full_name: &str, extends: Vec<&str>) -> SocketDefinition {
        SocketDefinition {
            id: id.into(),
            full_name: full_name.into(),
            display_name: full_name.into(),
            lifecycle: SocketLifecycle::Draft,
            extends: extends.into_iter().map(String::from).collect(),
            methods: vec![],
            created_at: 0,
            updated_at: 0,
        }
    }

    fn adapter(
        id: &str,
        name: &str,
        implements: Vec<&str>,
        params: Vec<AdapterConstructorParam>,
    ) -> AdapterNode {
        AdapterNode {
            id: id.into(),
            name: name.into(),
            implements: implements.into_iter().map(String::from).collect(),
            constructor_params: params,
            position: Position::default(),
        }
    }

    fn socket_param(name: &str, socket_id: &str) -> AdapterConstructorParam {
        AdapterConstructorParam {
            name: name.into(),
            param_type: AdapterParamType::SocketDep {
                socket_id: socket_id.into(),
            },
        }
    }

    fn prim_param(name: &str, ty: &str) -> AdapterConstructorParam {
        AdapterConstructorParam {
            name: name.into(),
            param_type: AdapterParamType::Primitive {
                type_name: ty.into(),
            },
        }
    }

    fn wire(id: &str, from: &str, from_socket: &str, to: &str, param: &str) -> Wire {
        Wire {
            id: id.into(),
            from_adapter_id: from.into(),
            from_socket_id: from_socket.into(),
            to_adapter_id: to.into(),
            to_param_name: param.into(),
        }
    }

    fn canvas(adapters: Vec<AdapterNode>, wires: Vec<Wire>) -> Canvas {
        Canvas {
            id: "c1".into(),
            name: "test".into(),
            socket_refs: vec![],
            adapters,
            wires,
            entry_points: vec![],
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn l1_exact_match() {
        let sockets = vec![socket("s1", "IFoo", vec![])];
        let c = canvas(
            vec![
                adapter("a1", "FooImpl", vec!["s1"], vec![]),
                adapter("a2", "Consumer", vec!["s1"], vec![socket_param("foo", "s1")]),
            ],
            vec![wire("w1", "a1", "s1", "a2", "foo")],
        );
        let result = classify_wires(&c, &sockets);
        assert_eq!(result[0].level, BridgeLevel::Lossless);
    }

    #[test]
    fn l1_upcast_via_extends() {
        let sockets = vec![
            socket("sbase", "IBase", vec![]),
            socket("sext", "IExtended", vec!["sbase"]),
        ];
        let c = canvas(
            vec![
                adapter("a1", "ExtImpl", vec!["sext"], vec![]),
                adapter(
                    "a2",
                    "BaseConsumer",
                    vec!["sbase"],
                    vec![socket_param("base", "sbase")],
                ),
            ],
            vec![wire("w1", "a1", "sext", "a2", "base")],
        );
        let result = classify_wires(&c, &sockets);
        assert_eq!(result[0].level, BridgeLevel::Lossless);
    }

    #[test]
    fn l2_downcast() {
        let sockets = vec![
            socket("sbase", "IBase", vec![]),
            socket("sext", "IExtended", vec!["sbase"]),
        ];
        let c = canvas(
            vec![
                adapter("a1", "BaseImpl", vec!["sbase"], vec![]),
                adapter(
                    "a2",
                    "ExtConsumer",
                    vec!["sext"],
                    vec![socket_param("ext", "sext")],
                ),
            ],
            vec![wire("w1", "a1", "sbase", "a2", "ext")],
        );
        let result = classify_wires(&c, &sockets);
        assert_eq!(result[0].level, BridgeLevel::Risky);
    }

    #[test]
    fn l2_socket_into_primitive() {
        let sockets = vec![socket("s1", "IFoo", vec![])];
        let c = canvas(
            vec![
                adapter("a1", "FooImpl", vec!["s1"], vec![]),
                adapter(
                    "a2",
                    "Consumer",
                    vec!["s1"],
                    vec![prim_param("cfg", "Config")],
                ),
            ],
            vec![wire("w1", "a1", "s1", "a2", "cfg")],
        );
        let result = classify_wires(&c, &sockets);
        assert_eq!(result[0].level, BridgeLevel::Risky);
    }

    #[test]
    fn l4_unrelated_sockets() {
        let sockets = vec![
            socket("sa", "IA", vec![]),
            socket("sb", "IB", vec![]),
        ];
        let c = canvas(
            vec![
                adapter("a1", "AImpl", vec!["sa"], vec![]),
                adapter(
                    "a2",
                    "BConsumer",
                    vec!["sb"],
                    vec![socket_param("b", "sb")],
                ),
            ],
            vec![wire("w1", "a1", "sa", "a2", "b")],
        );
        let result = classify_wires(&c, &sockets);
        assert_eq!(result[0].level, BridgeLevel::Incompatible);
        assert!(result[0].blocking);
    }

    #[test]
    fn l4_source_doesnt_implement_claimed_socket() {
        let sockets = vec![socket("s1", "IFoo", vec![])];
        let c = canvas(
            vec![
                adapter("a1", "NotFoo", vec![], vec![]),
                adapter("a2", "Consumer", vec!["s1"], vec![socket_param("foo", "s1")]),
            ],
            vec![wire("w1", "a1", "s1", "a2", "foo")],
        );
        let result = classify_wires(&c, &sockets);
        assert_eq!(result[0].level, BridgeLevel::Incompatible);
    }

    #[test]
    fn l4_missing_param_on_target() {
        let sockets = vec![socket("s1", "IFoo", vec![])];
        let c = canvas(
            vec![
                adapter("a1", "FooImpl", vec!["s1"], vec![]),
                adapter("a2", "Consumer", vec!["s1"], vec![]),
            ],
            vec![wire("w1", "a1", "s1", "a2", "nonexistent")],
        );
        let result = classify_wires(&c, &sockets);
        assert_eq!(result[0].level, BridgeLevel::Incompatible);
    }
}
