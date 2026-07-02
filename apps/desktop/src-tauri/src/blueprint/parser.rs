use regex::Regex;

use crate::blueprint::error::{BlueprintError, Result};
use crate::blueprint::types::*;

/// Parse a Blueprint from raw Markdown text.
///
/// Round-trip safety: parse → serialize → parse preserves all content including
/// unknown front matter fields and unknown sections.
pub fn parse(raw_md: &str) -> Result<Blueprint> {
    let (front_matter, body) = split_front_matter(raw_md)?;
    let parsed_fm = parse_front_matter(&front_matter)?;
    let sections = parse_sections(body);

    Ok(Blueprint {
        front_matter: parsed_fm,
        sections,
        raw_md: raw_md.to_string(),
    })
}

/// Serialize a Blueprint back to Markdown.
pub fn serialize(blueprint: &Blueprint) -> Result<String> {
    let mut out = String::new();
    out.push_str("---\n");
    out.push_str(&serialize_front_matter(&blueprint.front_matter)?);
    out.push_str("---\n\n");

    for section in &blueprint.sections {
        out.push_str("## ");
        out.push_str(&section.heading_text);
        out.push_str("\n\n");

        if section.kind.is_acceptance_criteria() {
            // Reconstruct task list from criteria
            for crit in &section.criteria {
                out.push_str(if crit.checked { "- [x] " } else { "- [ ] " });
                out.push_str(&crit.text);
                // Persist the stable id as an invisible (non-rendering) marker.
                // Field grammar (docs/sketch-design.md §6): `#<id> [key:value]*`,
                // canonical order = id, sk, then unknown fields verbatim in
                // their original order.
                out.push_str(" <!-- #");
                out.push_str(&crit.id);
                if let Some(sk) = &crit.sketch_node {
                    out.push_str(" sk:");
                    out.push_str(&sk.sketch_id);
                    out.push('/');
                    out.push_str(&sk.node_id);
                }
                for extra in &crit.marker_extras {
                    out.push(' ');
                    out.push_str(extra);
                }
                out.push_str(" -->");
                out.push('\n');
            }
            // Plus any extra non-criteria content (trailing prose if present)
            let extra = strip_task_list_lines(&section.content);
            if !extra.trim().is_empty() {
                out.push('\n');
                out.push_str(&extra);
                if !extra.ends_with('\n') {
                    out.push('\n');
                }
            }
        } else {
            out.push_str(&section.content);
            if !section.content.ends_with('\n') {
                out.push('\n');
            }
        }
        out.push('\n');
    }

    Ok(out)
}

/// Split raw MD into (front_matter_yaml, body).
fn split_front_matter(raw: &str) -> Result<(String, &str)> {
    let trimmed = raw.trim_start_matches('\u{feff}'); // strip BOM

    if !trimmed.starts_with("---") {
        return Err(BlueprintError::ParseError(
            "Expected front matter starting with ---".to_string(),
        ));
    }

    // Find end of front matter
    let after_first = &trimmed[3..];
    // Must be followed by newline
    let body_start = after_first
        .find("\n---")
        .ok_or_else(|| BlueprintError::ParseError("Unterminated front matter".to_string()))?;

    let yaml_part = &after_first[..body_start];
    let yaml = yaml_part.trim_start_matches('\n').to_string();

    // Body is after the closing ---\n
    let rest = &after_first[body_start + 4..]; // skip "\n---"
    let body = rest.trim_start_matches('\n');

    Ok((yaml, body))
}

/// Two-pass parse: first into serde_yaml::Value, then extract known fields,
/// remainder goes into `extras`.
fn parse_front_matter(yaml: &str) -> Result<BlueprintFrontMatter> {
    if yaml.trim().is_empty() {
        return Ok(BlueprintFrontMatter::default());
    }

    // First pass: generic Value
    let value: serde_yaml::Value = serde_yaml::from_str(yaml)?;
    let map = match value {
        serde_yaml::Value::Mapping(m) => m,
        _ => {
            return Err(BlueprintError::InvalidFrontMatter(
                "front matter must be a mapping".to_string(),
            ))
        }
    };

    // Known fields
    let known: &[&str] = &[
        "blueprintId",
        "type",
        "displayName",
        "status",
        "priority",
        "owner",
        "relatedSockets",
        "relatedAdapters",
        "relatedFiles",
        "relatedBlueprints",
        "tags",
        "lastCheckedAt",
        "lastCheckedBy",
        "checkVersion",
        "targetFile",
        "parentBlueprints",
    ];

    let mut known_map = serde_yaml::Mapping::new();
    let mut extras = std::collections::HashMap::new();

    for (k, v) in map {
        if let serde_yaml::Value::String(key_str) = &k {
            if known.contains(&key_str.as_str()) {
                known_map.insert(k.clone(), v);
            } else {
                // Convert to serde_json::Value for extras
                let json_val = yaml_to_json(&v);
                extras.insert(key_str.clone(), json_val);
            }
        }
    }

    // Deserialize known fields into BlueprintFrontMatter
    let known_value = serde_yaml::Value::Mapping(known_map);
    let mut fm: BlueprintFrontMatter = serde_yaml::from_value(known_value)?;
    fm.extras = extras;

    Ok(fm)
}

fn yaml_to_json(v: &serde_yaml::Value) -> serde_json::Value {
    match v {
        serde_yaml::Value::Null => serde_json::Value::Null,
        serde_yaml::Value::Bool(b) => serde_json::Value::Bool(*b),
        serde_yaml::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                serde_json::Value::Number(i.into())
            } else if let Some(f) = n.as_f64() {
                serde_json::Number::from_f64(f)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null)
            } else {
                serde_json::Value::Null
            }
        }
        serde_yaml::Value::String(s) => serde_json::Value::String(s.clone()),
        serde_yaml::Value::Sequence(seq) => {
            serde_json::Value::Array(seq.iter().map(yaml_to_json).collect())
        }
        serde_yaml::Value::Mapping(m) => {
            let mut obj = serde_json::Map::new();
            for (k, v) in m {
                if let serde_yaml::Value::String(key) = k {
                    obj.insert(key.clone(), yaml_to_json(v));
                }
            }
            serde_json::Value::Object(obj)
        }
        serde_yaml::Value::Tagged(_) => serde_json::Value::Null,
    }
}

fn serialize_front_matter(fm: &BlueprintFrontMatter) -> Result<String> {
    // Serialize known fields to Value
    let mut value = serde_yaml::to_value(fm)?;

    // Remove "extras" field from serialized output (it's handled specially)
    if let serde_yaml::Value::Mapping(ref mut m) = value {
        m.remove(serde_yaml::Value::String("extras".to_string()));

        // Merge extras back in
        for (k, v) in &fm.extras {
            let yaml_val = json_to_yaml(v);
            m.insert(serde_yaml::Value::String(k.clone()), yaml_val);
        }
    }

    let yaml = serde_yaml::to_string(&value)?;
    Ok(yaml)
}

fn json_to_yaml(v: &serde_json::Value) -> serde_yaml::Value {
    match v {
        serde_json::Value::Null => serde_yaml::Value::Null,
        serde_json::Value::Bool(b) => serde_yaml::Value::Bool(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                serde_yaml::Value::Number(i.into())
            } else if let Some(f) = n.as_f64() {
                serde_yaml::Value::Number(f.into())
            } else {
                serde_yaml::Value::Null
            }
        }
        serde_json::Value::String(s) => serde_yaml::Value::String(s.clone()),
        serde_json::Value::Array(arr) => {
            serde_yaml::Value::Sequence(arr.iter().map(json_to_yaml).collect())
        }
        serde_json::Value::Object(obj) => {
            let mut m = serde_yaml::Mapping::new();
            for (k, v) in obj {
                m.insert(serde_yaml::Value::String(k.clone()), json_to_yaml(v));
            }
            serde_yaml::Value::Mapping(m)
        }
    }
}

/// Parse body into sections by `## Heading` markers.
fn parse_sections(body: &str) -> Vec<BlueprintSection> {
    let mut sections = Vec::new();
    let mut current_heading: Option<String> = None;
    let mut current_content = String::new();

    for line in body.lines() {
        if let Some(stripped) = line.strip_prefix("## ") {
            // Flush previous section
            if let Some(heading) = current_heading.take() {
                sections.push(make_section(heading, current_content.clone()));
                current_content.clear();
            }
            current_heading = Some(stripped.trim().to_string());
        } else if current_heading.is_some() {
            current_content.push_str(line);
            current_content.push('\n');
        }
        // Content before first ## is dropped (could store as preamble but not needed for v1)
    }

    // Flush last section
    if let Some(heading) = current_heading {
        sections.push(make_section(heading, current_content));
    }

    sections
}

fn make_section(heading: String, mut content: String) -> BlueprintSection {
    // Trim trailing whitespace but keep structure
    while content.ends_with('\n') {
        content.pop();
    }
    content.push('\n');

    let kind = SectionKind::from_heading(&heading);
    let criteria = if kind.is_acceptance_criteria() {
        parse_task_list(&content)
    } else {
        Vec::new()
    };

    BlueprintSection {
        kind,
        heading_text: heading,
        content,
        criteria,
    }
}

fn parse_task_list(content: &str) -> Vec<AcceptanceCriterion> {
    let re = Regex::new(r"^\s*-\s*\[([ xX])\]\s*(.+)$").unwrap();
    // Trailing `<!-- #ULID [key:value]* -->` marker: the stable criterion id
    // plus optional fields (§6 grammar). Known field: `sk:<sketch>/<node>`.
    // Unknown fields are carried verbatim so future writers don't lose data
    // through older parsers.
    let id_re =
        Regex::new(r"\s*<!--\s*#([0-9A-Za-z]{26})((?:\s+[^\s>]+)*)\s*-->\s*$").unwrap();
    let mut criteria = Vec::new();

    for line in content.lines() {
        if let Some(caps) = re.captures(line) {
            let checked = matches!(&caps[1], "x" | "X");
            let raw = caps[2].trim();
            // Pull a stable id from the trailing marker, or mint one for legacy lines.
            let crit = match id_re.captures(raw) {
                Some(m) => {
                    let id = m[1].to_string();
                    let mut sketch_node = None;
                    let mut marker_extras = Vec::new();
                    for token in m[2].split_whitespace() {
                        let parsed = token.strip_prefix("sk:").and_then(|rest| {
                            rest.split_once('/').filter(|(s, n)| !s.is_empty() && !n.is_empty())
                        });
                        match parsed {
                            Some((sketch_id, node_id)) => {
                                sketch_node = Some(crate::blueprint::types::SketchNodeRef {
                                    sketch_id: sketch_id.to_string(),
                                    node_id: node_id.to_string(),
                                });
                            }
                            // Malformed sk (or any unknown field): preserve
                            // verbatim rather than silently dropping it.
                            None => marker_extras.push(token.to_string()),
                        }
                    }
                    let text = id_re.replace(raw, "").trim().to_string();
                    AcceptanceCriterion {
                        id,
                        text,
                        checked,
                        sketch_node,
                        marker_extras,
                    }
                }
                None => AcceptanceCriterion {
                    text: raw.to_string(),
                    checked,
                    ..Default::default()
                },
            };
            criteria.push(crit);
        }
    }

    criteria
}

fn strip_task_list_lines(content: &str) -> String {
    let re = Regex::new(r"^\s*-\s*\[([ xX])\]\s*.+$").unwrap();
    content
        .lines()
        .filter(|line| !re.is_match(line))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIMPLE_MD: &str = r#"---
blueprintId: 01HX123
type: feature
displayName: Test Feature
status: draft
priority: high
tags:
  - backend
  - api
---

## Goal

Build a thing.

## Acceptance Criteria

- [ ] Item one
- [x] Item two
- [ ] Item three

## Notes

Some notes.
"#;

    #[test]
    fn parse_simple_blueprint() {
        let bp = parse(SIMPLE_MD).unwrap();
        assert_eq!(bp.front_matter.blueprint_id, "01HX123");
        assert_eq!(bp.front_matter.display_name, "Test Feature");
        assert_eq!(bp.front_matter.tags, vec!["backend", "api"]);
        assert_eq!(bp.sections.len(), 3);
        assert!(matches!(bp.sections[0].kind, SectionKind::Goal));
        assert!(bp.sections[1].kind.is_acceptance_criteria());
        assert_eq!(bp.sections[1].criteria.len(), 3);
        assert_eq!(bp.sections[1].criteria[0].checked, false);
        assert_eq!(bp.sections[1].criteria[1].checked, true);
    }

    #[test]
    fn unknown_section_preserved() {
        let md = r#"---
blueprintId: x
type: feature
displayName: t
---

## Goal

g

## Custom Section

stuff
"#;
        let bp = parse(md).unwrap();
        assert_eq!(bp.sections.len(), 2);
        assert!(matches!(bp.sections[1].kind, SectionKind::Unknown { .. }));
        assert_eq!(bp.sections[1].heading_text, "Custom Section");
    }

    #[test]
    fn unknown_front_matter_preserved() {
        let md = r#"---
blueprintId: x
type: feature
displayName: t
customField: hello
anotherOne: 42
---

## Goal

g
"#;
        let bp = parse(md).unwrap();
        assert_eq!(bp.front_matter.extras.len(), 2);
        assert!(bp.front_matter.extras.contains_key("customField"));
        assert!(bp.front_matter.extras.contains_key("anotherOne"));
    }

    #[test]
    fn round_trip_preserves_structure() {
        let bp = parse(SIMPLE_MD).unwrap();
        let serialized = serialize(&bp).unwrap();
        let bp2 = parse(&serialized).unwrap();

        assert_eq!(bp.front_matter.blueprint_id, bp2.front_matter.blueprint_id);
        assert_eq!(bp.front_matter.display_name, bp2.front_matter.display_name);
        assert_eq!(bp.sections.len(), bp2.sections.len());
        assert_eq!(
            bp.sections[1].criteria.len(),
            bp2.sections[1].criteria.len()
        );
        assert_eq!(
            bp.sections[1].criteria[1].checked,
            bp2.sections[1].criteria[1].checked
        );
    }

    #[test]
    fn round_trip_preserves_unknown_fields() {
        let md = r#"---
blueprintId: x
type: feature
displayName: t
mysteryField: mysteryValue
---

## Goal

g
"#;
        let bp = parse(md).unwrap();
        let serialized = serialize(&bp).unwrap();
        assert!(serialized.contains("mysteryField"));
        assert!(serialized.contains("mysteryValue"));
    }

    #[test]
    fn task_list_mixed_states() {
        let md = r#"---
blueprintId: x
type: feature
displayName: t
---

## Acceptance Criteria

- [ ] Not done
- [x] Done lowercase
- [X] Done uppercase
- [ ] Another undone
"#;
        let bp = parse(md).unwrap();
        assert_eq!(bp.sections[0].criteria.len(), 4);
        assert_eq!(bp.sections[0].criteria[0].checked, false);
        assert_eq!(bp.sections[0].criteria[1].checked, true);
        assert_eq!(bp.sections[0].criteria[2].checked, true);
        assert_eq!(bp.sections[0].criteria[3].checked, false);
    }

    #[test]
    fn file_level_blueprint() {
        let md = r#"---
blueprintId: x
type: file
displayName: Auth Adapter
targetFile: packages/adapters/src/AuthAdapter.ts
parentBlueprints:
  - 01HPARENT
---

## Purpose

Implement auth.

## Responsibilities

Handle tokens.
"#;
        let bp = parse(md).unwrap();
        assert!(matches!(bp.front_matter.blueprint_type, BlueprintType::File));
        assert_eq!(
            bp.front_matter.target_file,
            Some("packages/adapters/src/AuthAdapter.ts".to_string())
        );
        assert_eq!(bp.front_matter.parent_blueprints.len(), 1);
        assert!(matches!(bp.sections[0].kind, SectionKind::Purpose));
        assert!(matches!(bp.sections[1].kind, SectionKind::Responsibilities));
    }

    // ----- S0.1: stable criterion ids -----

    const CRIT_MD: &str = r#"---
blueprintId: 01HX999
type: feature
displayName: Crit Test
status: draft
priority: high
---

## Acceptance Criteria

- [ ] First item
- [x] Second item
"#;

    fn is_ulid(s: &str) -> bool {
        regex::Regex::new(r"^[0-9A-Za-z]{26}$").unwrap().is_match(s)
    }

    #[test]
    fn criterion_id_minted_for_legacy() {
        let bp = parse(CRIT_MD).unwrap();
        let crits = &bp.sections[0].criteria;
        assert_eq!(crits.len(), 2);
        for c in crits {
            assert!(is_ulid(&c.id), "id should be a 26-char ulid: {:?}", c.id);
            assert!(!c.text.contains("<!--"), "text must be clean of marker: {:?}", c.text);
        }
    }

    #[test]
    fn criterion_id_persisted_on_serialize() {
        let bp = parse(CRIT_MD).unwrap();
        let out = serialize(&bp).unwrap();
        assert_eq!(out.matches("<!-- #").count(), 2, "serialized:\n{out}");
    }

    #[test]
    fn criterion_id_stable_round_trip() {
        let bp1 = parse(CRIT_MD).unwrap();
        let md2 = serialize(&bp1).unwrap();
        let bp2 = parse(&md2).unwrap();

        let ids1: Vec<_> = bp1.sections[0].criteria.iter().map(|c| c.id.clone()).collect();
        let ids2: Vec<_> = bp2.sections[0].criteria.iter().map(|c| c.id.clone()).collect();
        assert_eq!(ids1, ids2, "ids must survive parse -> serialize -> parse");

        // Once ids are stamped, serialization is a fixed point.
        let md3 = serialize(&bp2).unwrap();
        assert_eq!(md2, md3, "serialization must be idempotent after ids are stamped");
    }

    #[test]
    fn criterion_id_honored_when_present() {
        let md = "---\nblueprintId: 01HX998\ntype: feature\ndisplayName: X\nstatus: draft\npriority: high\n---\n\n## Acceptance Criteria\n\n- [ ] Keep my id <!-- #01ARZ3NDEKTSV4RRFFQ69G5FAV -->\n";
        let bp = parse(md).unwrap();
        let c = &bp.sections[0].criteria[0];
        assert_eq!(c.id, "01ARZ3NDEKTSV4RRFFQ69G5FAV", "existing id must not be re-minted");
        assert_eq!(c.text, "Keep my id", "marker must be stripped from text");
    }

    #[test]
    fn marker_sk_binding_round_trips() {
        let md = "---\nblueprintId: 01HX998\ntype: feature\ndisplayName: X\nstatus: draft\npriority: high\n---\n\n## Acceptance Criteria\n\n- [ ] Has a submit button <!-- #01ARZ3NDEKTSV4RRFFQ69G5FAV sk:sk_login/btn_8f3a -->\n";
        let bp = parse(md).unwrap();
        let c = &bp.sections[0].criteria[0];
        assert_eq!(c.text, "Has a submit button", "fields must not leak into text");
        assert_eq!(
            c.sketch_node,
            Some(SketchNodeRef {
                sketch_id: "sk_login".to_string(),
                node_id: "btn_8f3a".to_string(),
            })
        );

        let out = serialize(&bp).unwrap();
        assert!(
            out.contains("<!-- #01ARZ3NDEKTSV4RRFFQ69G5FAV sk:sk_login/btn_8f3a -->"),
            "serialized:\n{out}"
        );
        // Idempotent: reparse yields the same binding.
        let again = parse(&out).unwrap();
        assert_eq!(again.sections[0].criteria[0].sketch_node, c.sketch_node);
    }

    #[test]
    fn marker_unknown_fields_survive_round_trip_verbatim() {
        // §6 obligation 1: fields we don't understand yet ride through us
        // byte-identically (canonical order: id, sk, then extras as given).
        let md = "---\nblueprintId: 01HX998\ntype: feature\ndisplayName: X\nstatus: draft\npriority: high\n---\n\n## Acceptance Criteria\n\n- [ ] Future-proof <!-- #01ARZ3NDEKTSV4RRFFQ69G5FAV zz:future sk:s1/n1 aa:1 -->\n";
        let bp = parse(md).unwrap();
        let c = &bp.sections[0].criteria[0];
        assert!(c.sketch_node.is_some());
        assert_eq!(c.marker_extras, vec!["zz:future", "aa:1"]);

        let out = serialize(&bp).unwrap();
        assert!(
            out.contains("<!-- #01ARZ3NDEKTSV4RRFFQ69G5FAV sk:s1/n1 zz:future aa:1 -->"),
            "serialized:\n{out}"
        );
        let again = parse(&out).unwrap();
        assert_eq!(again.sections[0].criteria[0].marker_extras, c.marker_extras);
        assert_eq!(again.sections[0].criteria[0].sketch_node, c.sketch_node);
    }

    #[test]
    fn marker_malformed_sk_is_preserved_not_dropped() {
        // A malformed sk token isn't understood → it is freight, not garbage.
        let md = "---\nblueprintId: 01HX998\ntype: feature\ndisplayName: X\nstatus: draft\npriority: high\n---\n\n## Acceptance Criteria\n\n- [ ] T <!-- #01ARZ3NDEKTSV4RRFFQ69G5FAV sk:broken -->\n";
        let bp = parse(md).unwrap();
        let c = &bp.sections[0].criteria[0];
        assert_eq!(c.sketch_node, None);
        assert_eq!(c.marker_extras, vec!["sk:broken"]);
        let out = serialize(&bp).unwrap();
        assert!(out.contains("sk:broken"), "serialized:\n{out}");
    }
}
