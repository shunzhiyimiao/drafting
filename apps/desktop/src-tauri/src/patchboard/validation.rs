use std::collections::{HashMap, HashSet};

use crate::patchboard::error::{PatchboardError, Result};
use crate::patchboard::types::*;

/// Validate that the wire graph has no cycles using topological sort (Kahn's algorithm).
pub fn validate_no_wire_cycles(canvas: &Canvas) -> Result<Vec<String>> {
    let adapter_ids: HashSet<&str> = canvas.adapters.iter().map(|a| a.id.as_str()).collect();

    // Build adjacency: from_adapter -> [to_adapter]
    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();

    for id in &adapter_ids {
        in_degree.insert(id, 0);
        adj.insert(id, Vec::new());
    }

    for wire in &canvas.wires {
        if adapter_ids.contains(wire.from_adapter_id.as_str())
            && adapter_ids.contains(wire.to_adapter_id.as_str())
        {
            adj.get_mut(wire.from_adapter_id.as_str())
                .unwrap()
                .push(wire.to_adapter_id.as_str());
            *in_degree.get_mut(wire.to_adapter_id.as_str()).unwrap() += 1;
        }
    }

    // Kahn's algorithm
    let mut queue: Vec<&str> = in_degree
        .iter()
        .filter(|(_, &deg)| deg == 0)
        .map(|(&id, _)| id)
        .collect();

    let mut sorted = Vec::new();

    while let Some(node) = queue.pop() {
        sorted.push(node.to_string());
        if let Some(neighbors) = adj.get(node) {
            for &neighbor in neighbors {
                let deg = in_degree.get_mut(neighbor).unwrap();
                *deg -= 1;
                if *deg == 0 {
                    queue.push(neighbor);
                }
            }
        }
    }

    if sorted.len() != adapter_ids.len() {
        return Err(PatchboardError::CycleDetected);
    }

    Ok(sorted)
}

/// Validate that an adapter implements at least one Socket.
pub fn validate_adapter_has_socket(adapter: &AdapterNode) -> Result<()> {
    if adapter.implements.is_empty() {
        return Err(PatchboardError::AdapterNoSocket);
    }
    Ok(())
}

/// Validate full canvas constraints. Returns a ValidationResult.
pub fn validate_canvas(canvas: &Canvas) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // Check adapter constraints
    for adapter in &canvas.adapters {
        if adapter.implements.is_empty() {
            errors.push(format!(
                "Adapter '{}' must implement at least one Socket",
                adapter.name
            ));
        }
    }

    // Check for duplicate adapter names
    let mut seen_names = HashSet::new();
    for adapter in &canvas.adapters {
        if !seen_names.insert(&adapter.name) {
            errors.push(format!(
                "Duplicate adapter name '{}' on canvas",
                adapter.name
            ));
        }
    }

    // Check wire references are valid
    let adapter_ids: HashSet<&str> = canvas.adapters.iter().map(|a| a.id.as_str()).collect();
    for wire in &canvas.wires {
        if !adapter_ids.contains(wire.from_adapter_id.as_str()) {
            errors.push(format!(
                "Wire references unknown source adapter '{}'",
                wire.from_adapter_id
            ));
        }
        if !adapter_ids.contains(wire.to_adapter_id.as_str()) {
            errors.push(format!(
                "Wire references unknown target adapter '{}'",
                wire.to_adapter_id
            ));
        }
    }

    // Check for cycles
    if let Err(PatchboardError::CycleDetected) = validate_no_wire_cycles(canvas) {
        errors.push("Wire graph contains a cycle".to_string());
    }

    // Check entry points reference valid adapters
    for ep in &canvas.entry_points {
        if !adapter_ids.contains(ep.adapter_id.as_str()) {
            errors.push(format!(
                "Entry point references unknown adapter '{}'",
                ep.adapter_id
            ));
        }
    }

    // Warning: canvas has no entry points
    if canvas.entry_points.is_empty() && !canvas.adapters.is_empty() {
        warnings.push("Canvas has no entry points defined".to_string());
    }

    ValidationResult {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_adapter(id: &str, name: &str, implements: Vec<&str>) -> AdapterNode {
        AdapterNode {
            id: id.to_string(),
            name: name.to_string(),
            implements: implements.into_iter().map(|s| s.to_string()).collect(),
            constructor_params: vec![],
            position: Position::default(),
        }
    }

    fn make_wire(id: &str, from: &str, from_socket: &str, to: &str, param: &str) -> Wire {
        Wire {
            id: id.to_string(),
            from_adapter_id: from.to_string(),
            from_socket_id: from_socket.to_string(),
            to_adapter_id: to.to_string(),
            to_param_name: param.to_string(),
        }
    }

    #[test]
    fn no_cycle_with_linear_wires() {
        let canvas = Canvas {
            id: "c1".to_string(),
            name: "test".to_string(),
            socket_refs: vec![],
            adapters: vec![
                make_adapter("a1", "A", vec!["s1"]),
                make_adapter("a2", "B", vec!["s2"]),
                make_adapter("a3", "C", vec!["s3"]),
            ],
            wires: vec![
                make_wire("w1", "a1", "s1", "a2", "dep1"),
                make_wire("w2", "a2", "s2", "a3", "dep2"),
            ],
            entry_points: vec![],
            created_at: 0,
            updated_at: 0,
        };
        let sorted = validate_no_wire_cycles(&canvas).unwrap();
        assert_eq!(sorted.len(), 3);
    }

    #[test]
    fn cycle_detected() {
        let canvas = Canvas {
            id: "c1".to_string(),
            name: "test".to_string(),
            socket_refs: vec![],
            adapters: vec![
                make_adapter("a1", "A", vec!["s1"]),
                make_adapter("a2", "B", vec!["s2"]),
            ],
            wires: vec![
                make_wire("w1", "a1", "s1", "a2", "dep1"),
                make_wire("w2", "a2", "s2", "a1", "dep2"),
            ],
            entry_points: vec![],
            created_at: 0,
            updated_at: 0,
        };
        let result = validate_no_wire_cycles(&canvas);
        assert!(matches!(result, Err(PatchboardError::CycleDetected)));
    }

    #[test]
    fn validate_canvas_catches_multiple_errors() {
        let canvas = Canvas {
            id: "c1".to_string(),
            name: "test".to_string(),
            socket_refs: vec![],
            adapters: vec![
                AdapterNode {
                    id: "a1".to_string(),
                    name: "Bad".to_string(),
                    implements: vec![], // error: no socket
                    constructor_params: vec![],
                    position: Position::default(),
                },
            ],
            wires: vec![],
            entry_points: vec![],
            created_at: 0,
            updated_at: 0,
        };
        let result = validate_canvas(&canvas);
        assert!(!result.valid);
        assert!(result.errors.iter().any(|e| e.contains("must implement")));
    }
}
