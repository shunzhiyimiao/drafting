use regex::Regex;
use serde_json::Value;

use crate::blueprint::error::{BlueprintError, Result};
use crate::blueprint::types::*;

// ---------------------------------------------------------------------------
// Built-in template content
// ---------------------------------------------------------------------------

const FEATURE_CRUD_SERVICE: &str = include_str!("templates/feature/crud-service.template.md");
const FEATURE_API_ENDPOINT: &str = include_str!("templates/feature/api-endpoint.template.md");
const FEATURE_BACKGROUND_JOB: &str = include_str!("templates/feature/background-job.template.md");
const FEATURE_DATA_IMPORT: &str = include_str!("templates/feature/data-import.template.md");
const FEATURE_NOTIFICATION: &str = include_str!("templates/feature/notification.template.md");
const FEATURE_AUTH_FLOW: &str = include_str!("templates/feature/auth-flow.template.md");
const FEATURE_REPORT: &str = include_str!("templates/feature/report.template.md");
const FEATURE_SIMPLE: &str = include_str!("templates/feature/simple-feature.template.md");

const FILE_SERVICE: &str = include_str!("templates/file/service.template.md");
const FILE_REPOSITORY: &str = include_str!("templates/file/repository.template.md");
const FILE_ADAPTER: &str = include_str!("templates/file/adapter.template.md");
const FILE_CONTROLLER: &str = include_str!("templates/file/controller.template.md");
const FILE_VALIDATOR: &str = include_str!("templates/file/validator.template.md");
const FILE_UTILITY: &str = include_str!("templates/file/utility.template.md");

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

pub fn list_templates() -> Vec<TemplateInfo> {
    let mut templates = base_templates();
    // Derive each template's user-facing placeholders from its content so the
    // create dialog can prompt for every one (fixes raw `{{entityName}}`
    // leaking through). blueprintId is excluded inside template_placeholders.
    for tpl in &mut templates {
        if let Ok(content) = get_template_content(&tpl.name) {
            tpl.placeholders = template_placeholders(content);
        }
    }
    templates
}

fn base_templates() -> Vec<TemplateInfo> {
    vec![
        // Feature templates
        TemplateInfo {
            name: "crud-service".to_string(),
            display_name: "CRUD Service".to_string(),
            description: "A feature providing standard create/read/update/delete operations".to_string(),
            template_type: BlueprintType::Feature,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "api-endpoint".to_string(),
            display_name: "API Endpoint".to_string(),
            description: "A REST API endpoint with request/response handling".to_string(),
            template_type: BlueprintType::Feature,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "background-job".to_string(),
            display_name: "Background Job".to_string(),
            description: "A long-running background task or scheduled job".to_string(),
            template_type: BlueprintType::Feature,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "data-import".to_string(),
            display_name: "Data Import".to_string(),
            description: "Import data from external sources".to_string(),
            template_type: BlueprintType::Feature,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "notification".to_string(),
            display_name: "Notification".to_string(),
            description: "Send notifications (email, push, SMS)".to_string(),
            template_type: BlueprintType::Feature,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "auth-flow".to_string(),
            display_name: "Auth Flow".to_string(),
            description: "Authentication or authorization flow".to_string(),
            template_type: BlueprintType::Feature,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "report".to_string(),
            display_name: "Report".to_string(),
            description: "Generate a report from data".to_string(),
            template_type: BlueprintType::Feature,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "simple-feature".to_string(),
            display_name: "Simple Feature".to_string(),
            description: "Blank feature template".to_string(),
            template_type: BlueprintType::Feature,
            placeholders: Vec::new(),
        },
        // File templates
        TemplateInfo {
            name: "service".to_string(),
            display_name: "Service Class".to_string(),
            description: "Business service class".to_string(),
            template_type: BlueprintType::File,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "repository".to_string(),
            display_name: "Repository".to_string(),
            description: "Data access repository".to_string(),
            template_type: BlueprintType::File,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "adapter".to_string(),
            display_name: "Adapter".to_string(),
            description: "Patchboard adapter implementation".to_string(),
            template_type: BlueprintType::File,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "controller".to_string(),
            display_name: "Controller".to_string(),
            description: "HTTP controller".to_string(),
            template_type: BlueprintType::File,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "validator".to_string(),
            display_name: "Validator".to_string(),
            description: "Input validator".to_string(),
            template_type: BlueprintType::File,
            placeholders: Vec::new(),
        },
        TemplateInfo {
            name: "utility".to_string(),
            display_name: "Utility".to_string(),
            description: "Utility function module".to_string(),
            template_type: BlueprintType::File,
            placeholders: Vec::new(),
        },
    ]
}

pub fn get_template_content(name: &str) -> Result<&'static str> {
    match name {
        "crud-service" => Ok(FEATURE_CRUD_SERVICE),
        "api-endpoint" => Ok(FEATURE_API_ENDPOINT),
        "background-job" => Ok(FEATURE_BACKGROUND_JOB),
        "data-import" => Ok(FEATURE_DATA_IMPORT),
        "notification" => Ok(FEATURE_NOTIFICATION),
        "auth-flow" => Ok(FEATURE_AUTH_FLOW),
        "report" => Ok(FEATURE_REPORT),
        "simple-feature" => Ok(FEATURE_SIMPLE),
        "service" => Ok(FILE_SERVICE),
        "repository" => Ok(FILE_REPOSITORY),
        "adapter" => Ok(FILE_ADAPTER),
        "controller" => Ok(FILE_CONTROLLER),
        "validator" => Ok(FILE_VALIDATOR),
        "utility" => Ok(FILE_UTILITY),
        _ => Err(BlueprintError::TemplateNotFound(name.to_string())),
    }
}

/// The distinct `{{placeholder}}` keys a template declares, in first-seen
/// order. `blueprintId` is excluded — it's always auto-minted, never a
/// user-facing field. Lets the create dialog render an input per placeholder
/// so nothing is left unsubstituted (the `{{entityName}}` UX gap).
pub fn template_placeholders(content: &str) -> Vec<String> {
    let re = Regex::new(r"\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}").unwrap();
    let mut seen = Vec::new();
    for caps in re.captures_iter(content) {
        let key = caps[1].to_string();
        if key != "blueprintId" && !seen.contains(&key) {
            seen.push(key);
        }
    }
    seen
}

/// Simple Mustache-style `{{key}}` substitution. Any placeholder the caller
/// didn't supply falls back to `displayName` (or a humanized form of the key)
/// so a rendered Blueprint never ships raw `{{…}}` markers.
pub fn render_template(content: &str, variables: &Value) -> String {
    let mut result = content.to_string();

    // Auto-populate blueprintId if not provided
    let default_id = new_ulid();
    let bp_id = variables
        .get("blueprintId")
        .and_then(|v| v.as_str())
        .unwrap_or(&default_id);
    result = result.replace("{{blueprintId}}", bp_id);

    if let Value::Object(map) = variables {
        for (key, value) in map {
            let placeholder = format!("{{{{{}}}}}", key);
            let string_val = match value {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            result = result.replace(&placeholder, &string_val);
        }
    }

    // Backstop: fill any placeholder still present so no `{{…}}` leaks into
    // the saved Blueprint.
    let display = variables
        .get("displayName")
        .and_then(|v| v.as_str())
        .unwrap_or("New Blueprint")
        .to_string();
    for key in template_placeholders(&result) {
        result = result.replace(&format!("{{{{{}}}}}", key), &display);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_templates_listed() {
        let templates = list_templates();
        assert_eq!(templates.len(), 14);
        assert_eq!(
            templates
                .iter()
                .filter(|t| matches!(t.template_type, BlueprintType::Feature))
                .count(),
            8
        );
        assert_eq!(
            templates
                .iter()
                .filter(|t| matches!(t.template_type, BlueprintType::File))
                .count(),
            6
        );
    }

    #[test]
    fn all_templates_have_content() {
        for t in list_templates() {
            let content = get_template_content(&t.name).unwrap();
            assert!(!content.is_empty(), "template {} is empty", t.name);
            assert!(content.contains("---"), "template {} missing front matter", t.name);
        }
    }

    #[test]
    fn render_substitutes_variables() {
        let template = "name={{displayName}}, id={{blueprintId}}";
        let vars = serde_json::json!({
            "displayName": "Hello",
            "blueprintId": "TEST01",
        });
        let result = render_template(template, &vars);
        assert_eq!(result, "name=Hello, id=TEST01");
    }

    #[test]
    fn placeholders_are_distinct_ordered_and_exclude_blueprint_id() {
        let t = "{{displayName}} uses {{entityName}} and {{entityName}} again; {{blueprintId}} {{dataSource}}";
        assert_eq!(
            template_placeholders(t),
            vec![
                "displayName".to_string(),
                "entityName".to_string(),
                "dataSource".to_string()
            ]
        );
    }

    #[test]
    fn render_backstops_unsupplied_placeholders_to_display_name() {
        // The {{entityName}} UX gap: a placeholder the dialog didn't fill must
        // never leak as raw `{{…}}` — it falls back to displayName.
        let template = "# {{displayName}}\nEntity: {{entityName}}, Source: {{dataSource}}";
        let vars = serde_json::json!({ "displayName": "Orders" });
        let result = render_template(template, &vars);
        assert!(!result.contains("{{"), "no raw placeholder may survive: {result}");
        assert_eq!(result, "# Orders\nEntity: Orders, Source: Orders");
    }

    #[test]
    fn every_template_exposes_its_placeholders() {
        for t in list_templates() {
            let content = get_template_content(&t.name).unwrap();
            // list_templates must have populated them, and displayName is
            // present in every template.
            assert_eq!(t.placeholders, template_placeholders(content));
            assert!(
                t.placeholders.contains(&"displayName".to_string()),
                "template {} should surface displayName",
                t.name
            );
        }
    }
}
