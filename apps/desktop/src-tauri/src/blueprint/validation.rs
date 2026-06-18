use crate::blueprint::types::*;

/// Lightweight validation (no AI). Triggered on save.
pub fn validate_blueprint(bp: &Blueprint) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // Front matter required fields
    if bp.front_matter.blueprint_id.is_empty() {
        errors.push("Missing blueprintId".to_string());
    }
    if bp.front_matter.display_name.is_empty() {
        errors.push("Missing displayName".to_string());
    }

    match bp.front_matter.blueprint_type {
        BlueprintType::Feature => {
            // Feature must have Acceptance Criteria section
            let ac = bp
                .sections
                .iter()
                .find(|s| s.kind.is_acceptance_criteria());
            match ac {
                None => errors.push(
                    "Feature blueprint must have an Acceptance Criteria section".to_string(),
                ),
                Some(sec) if sec.criteria.is_empty() => {
                    warnings.push("Acceptance Criteria section has no items".to_string())
                }
                _ => {}
            }
        }
        BlueprintType::File => {
            // File blueprint must have targetFile
            if bp.front_matter.target_file.is_none() {
                errors.push("File blueprint must have targetFile in front matter".to_string());
            }
        }
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

    fn make_bp(bp_type: BlueprintType) -> Blueprint {
        Blueprint {
            front_matter: BlueprintFrontMatter {
                blueprint_id: "x".to_string(),
                blueprint_type: bp_type,
                display_name: "test".to_string(),
                ..Default::default()
            },
            sections: vec![],
            raw_md: String::new(),
        }
    }

    #[test]
    fn feature_without_acceptance_criteria_fails() {
        let bp = make_bp(BlueprintType::Feature);
        let result = validate_blueprint(&bp);
        assert!(!result.valid);
        assert!(result
            .errors
            .iter()
            .any(|e| e.contains("Acceptance Criteria")));
    }

    #[test]
    fn file_without_target_file_fails() {
        let bp = make_bp(BlueprintType::File);
        let result = validate_blueprint(&bp);
        assert!(!result.valid);
        assert!(result.errors.iter().any(|e| e.contains("targetFile")));
    }

    #[test]
    fn valid_feature_passes() {
        let mut bp = make_bp(BlueprintType::Feature);
        bp.sections.push(BlueprintSection {
            kind: SectionKind::AcceptanceCriteria,
            heading_text: "Acceptance Criteria".to_string(),
            content: "".to_string(),
            criteria: vec![AcceptanceCriterion {
                id: new_ulid(),
                text: "item".to_string(),
                checked: false,
            }],
        });
        let result = validate_blueprint(&bp);
        assert!(result.valid);
    }
}
