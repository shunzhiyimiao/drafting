use regex::Regex;

use crate::atlas::types::*;

/// Parse a source file into a flat-ish symbol tree.
/// Uses pragmatic regex scanning — not a full AST parser, but fast
/// and good enough for the Atlas File Map v1.
pub fn parse_file(path: &str, content: &str) -> FileMap {
    let language = detect_language(path);
    let total_lines = content.lines().count() as u32;

    let symbols = match language.as_str() {
        "typescript" | "javascript" => parse_ts(content),
        "rust" => parse_rust(content),
        _ => Vec::new(),
    };

    FileMap {
        path: path.to_string(),
        language,
        symbols,
        total_lines,
        adapter_id: None, // set by caller
        file_blueprint_id: None,
        is_generated: false,
    }
}

fn detect_language(path: &str) -> String {
    let ext = path.rsplit('.').next().unwrap_or("");
    match ext {
        "ts" | "tsx" => "typescript".to_string(),
        "js" | "jsx" | "mjs" | "cjs" => "javascript".to_string(),
        "rs" => "rust".to_string(),
        _ => "plaintext".to_string(),
    }
}

// ---------------------------------------------------------------------------
// TypeScript / JavaScript
// ---------------------------------------------------------------------------

fn parse_ts(content: &str) -> Vec<AtlasSymbol> {
    let mut symbols = Vec::new();

    // Top-level declarations
    let class_re = Regex::new(
        r"(?m)^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)",
    )
    .unwrap();
    let interface_re =
        Regex::new(r"(?m)^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)").unwrap();
    let function_re = Regex::new(
        r"(?m)^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)",
    )
    .unwrap();
    let type_re =
        Regex::new(r"(?m)^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)").unwrap();
    let enum_re =
        Regex::new(r"(?m)^\s*(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)").unwrap();
    let const_re = Regex::new(
        r"(?m)^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|<[^>]+>\s*\([^)]*\))\s*=>",
    )
    .unwrap();

    let lines: Vec<&str> = content.lines().collect();

    // Classes with their method bodies
    for caps in class_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let match_start = caps.get(0).unwrap().start();
        let line = byte_offset_to_line(content, match_start);

        let class_body = extract_brace_block(content, match_start);
        let mut children = Vec::new();

        if let Some((body_start_line, body)) = class_body {
            children = parse_ts_class_body(&body, body_start_line);
        }

        symbols.push(AtlasSymbol {
            name,
            kind: SymbolKind::Class,
            line,
            column: 1,
            detail: None,
            children,
        });
    }

    for caps in interface_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let line = byte_offset_to_line(content, caps.get(0).unwrap().start());
        symbols.push(AtlasSymbol {
            name,
            kind: SymbolKind::Interface,
            line,
            column: 1,
            detail: None,
            children: Vec::new(),
        });
    }

    for caps in function_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let line = byte_offset_to_line(content, caps.get(0).unwrap().start());
        symbols.push(AtlasSymbol {
            name,
            kind: SymbolKind::Function,
            line,
            column: 1,
            detail: None,
            children: Vec::new(),
        });
    }

    for caps in const_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let line = byte_offset_to_line(content, caps.get(0).unwrap().start());
        symbols.push(AtlasSymbol {
            name,
            kind: SymbolKind::Function,
            line,
            column: 1,
            detail: Some("arrow".to_string()),
            children: Vec::new(),
        });
    }

    for caps in type_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let line = byte_offset_to_line(content, caps.get(0).unwrap().start());
        symbols.push(AtlasSymbol {
            name,
            kind: SymbolKind::TypeAlias,
            line,
            column: 1,
            detail: None,
            children: Vec::new(),
        });
    }

    for caps in enum_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let line = byte_offset_to_line(content, caps.get(0).unwrap().start());
        symbols.push(AtlasSymbol {
            name,
            kind: SymbolKind::Enum,
            line,
            column: 1,
            detail: None,
            children: Vec::new(),
        });
    }

    let _ = lines;
    symbols.sort_by_key(|s| s.line);
    symbols
}

fn parse_ts_class_body(body: &str, body_start_line: u32) -> Vec<AtlasSymbol> {
    let mut children = Vec::new();
    // Methods: `methodName(...)` at top-level of the class body.
    // This is approximate — we split on lines that match a method
    // signature and skip nested blocks.
    let method_re = Regex::new(
        r"(?m)^\s*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+|abstract\s+|override\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(",
    )
    .unwrap();

    // Track brace depth so we only match at depth 0 (class level)
    let mut depth = 0i32;
    for (line_idx, line) in body.lines().enumerate() {
        if depth == 0 {
            if let Some(caps) = method_re.captures(line) {
                let name = caps.get(1).unwrap().as_str().to_string();
                // Skip keywords that can match the regex
                if matches!(
                    name.as_str(),
                    "if" | "for"
                        | "while"
                        | "switch"
                        | "catch"
                        | "return"
                        | "throw"
                        | "new"
                        | "typeof"
                        | "delete"
                        | "void"
                        | "do"
                ) {
                    // fall through to depth tracking
                } else {
                    children.push(AtlasSymbol {
                        name,
                        kind: SymbolKind::Method,
                        line: body_start_line + line_idx as u32,
                        column: 1,
                        detail: None,
                        children: Vec::new(),
                    });
                }
            }
        }
        for ch in line.chars() {
            match ch {
                '{' => depth += 1,
                '}' => depth -= 1,
                _ => {}
            }
        }
    }

    children
}

/// Given a starting byte offset in `content`, walk forward to find the
/// first `{` and return the body text between the matching `{` and `}`
/// along with the line number of the opening brace + 1.
fn extract_brace_block(content: &str, start: usize) -> Option<(u32, String)> {
    let bytes = content.as_bytes();
    let mut i = start;
    while i < bytes.len() && bytes[i] != b'{' {
        i += 1;
    }
    if i >= bytes.len() {
        return None;
    }
    let open = i;
    let mut depth = 1i32;
    i += 1;
    while i < bytes.len() && depth > 0 {
        match bytes[i] {
            b'{' => depth += 1,
            b'}' => depth -= 1,
            _ => {}
        }
        i += 1;
    }
    if depth != 0 {
        return None;
    }
    let close = i - 1;
    let open_line = byte_offset_to_line(content, open);
    let body = String::from_utf8_lossy(&bytes[open + 1..close]).to_string();
    Some((open_line + 1, body))
}

// ---------------------------------------------------------------------------
// Rust
// ---------------------------------------------------------------------------

fn parse_rust(content: &str) -> Vec<AtlasSymbol> {
    let mut symbols = Vec::new();

    let struct_re =
        Regex::new(r"(?m)^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?struct\s+([A-Za-z_][\w]*)")
            .unwrap();
    let enum_re =
        Regex::new(r"(?m)^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?enum\s+([A-Za-z_][\w]*)").unwrap();
    let trait_re =
        Regex::new(r"(?m)^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?trait\s+([A-Za-z_][\w]*)").unwrap();
    let fn_re = Regex::new(
        r"(?m)^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)",
    )
    .unwrap();
    let impl_re =
        Regex::new(r"(?m)^\s*impl(?:\s*<[^>]+>)?\s+([A-Za-z_][\w<>, :]*?)\s*\{").unwrap();
    let mod_re =
        Regex::new(r"(?m)^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?mod\s+([A-Za-z_][\w]*)\s*[{;]")
            .unwrap();
    let type_re =
        Regex::new(r"(?m)^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?type\s+([A-Za-z_][\w]*)").unwrap();

    for caps in struct_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let line = byte_offset_to_line(content, caps.get(0).unwrap().start());
        symbols.push(AtlasSymbol {
            name,
            kind: SymbolKind::Struct,
            line,
            column: 1,
            detail: None,
            children: Vec::new(),
        });
    }

    for caps in enum_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let line = byte_offset_to_line(content, caps.get(0).unwrap().start());
        symbols.push(AtlasSymbol {
            name,
            kind: SymbolKind::Enum,
            line,
            column: 1,
            detail: None,
            children: Vec::new(),
        });
    }

    for caps in trait_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let line = byte_offset_to_line(content, caps.get(0).unwrap().start());
        symbols.push(AtlasSymbol {
            name,
            kind: SymbolKind::Trait,
            line,
            column: 1,
            detail: None,
            children: Vec::new(),
        });
    }

    // Impl blocks: parse child fn's inside the brace block
    for caps in impl_re.captures_iter(content) {
        let header = caps.get(1).unwrap().as_str().trim().to_string();
        let match_start = caps.get(0).unwrap().start();
        let line = byte_offset_to_line(content, match_start);
        let mut children = Vec::new();
        if let Some((body_start_line, body)) = extract_brace_block(content, match_start) {
            let fn_method_re =
                Regex::new(r"(?m)^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)").unwrap();
            for fcaps in fn_method_re.captures_iter(&body) {
                let name = fcaps.get(1).unwrap().as_str().to_string();
                let fn_line = body_start_line + byte_offset_to_line(&body, fcaps.get(0).unwrap().start()) - 1;
                children.push(AtlasSymbol {
                    name,
                    kind: SymbolKind::Method,
                    line: fn_line,
                    column: 1,
                    detail: None,
                    children: Vec::new(),
                });
            }
        }
        symbols.push(AtlasSymbol {
            name: header,
            kind: SymbolKind::Impl,
            line,
            column: 1,
            detail: None,
            children,
        });
    }

    // Top-level fns (not inside impl — we still include all, Atlas can dedupe by line)
    for caps in fn_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let line = byte_offset_to_line(content, caps.get(0).unwrap().start());
        // Skip if already inside an impl we indexed
        if !symbols.iter().any(|s| {
            matches!(s.kind, SymbolKind::Impl) && s.children.iter().any(|c| c.line == line)
        }) {
            symbols.push(AtlasSymbol {
                name,
                kind: SymbolKind::Function,
                line,
                column: 1,
                detail: None,
                children: Vec::new(),
            });
        }
    }

    for caps in mod_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let line = byte_offset_to_line(content, caps.get(0).unwrap().start());
        symbols.push(AtlasSymbol {
            name,
            kind: SymbolKind::Module,
            line,
            column: 1,
            detail: None,
            children: Vec::new(),
        });
    }

    for caps in type_re.captures_iter(content) {
        let name = caps.get(1).unwrap().as_str().to_string();
        let line = byte_offset_to_line(content, caps.get(0).unwrap().start());
        symbols.push(AtlasSymbol {
            name,
            kind: SymbolKind::TypeAlias,
            line,
            column: 1,
            detail: None,
            children: Vec::new(),
        });
    }

    symbols.sort_by_key(|s| s.line);
    symbols
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn byte_offset_to_line(content: &str, offset: usize) -> u32 {
    let mut line = 1u32;
    for (i, byte) in content.bytes().enumerate() {
        if i >= offset {
            break;
        }
        if byte == b'\n' {
            line += 1;
        }
    }
    line
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ts_class_with_methods() {
        let src = r#"
export class UserService {
  constructor(private db: IDatabase) {}

  async findById(id: string): Promise<User> {
    return this.db.query(id);
  }

  update(user: User): void {
    this.db.save(user);
  }
}
"#;
        let map = parse_file("foo.ts", src);
        assert_eq!(map.language, "typescript");
        assert_eq!(map.symbols.len(), 1);
        assert_eq!(map.symbols[0].name, "UserService");
        assert!(matches!(map.symbols[0].kind, SymbolKind::Class));
        assert!(map.symbols[0].children.len() >= 2);
    }

    #[test]
    fn parse_ts_interface_and_function() {
        let src = r#"
export interface IAuth {
  login(): Promise<boolean>;
}

export function helper(x: number): number {
  return x * 2;
}

export const arrow = (a: string) => a.length;

type MyType = string | number;

enum Status {
  Active,
  Inactive,
}
"#;
        let map = parse_file("foo.ts", src);
        assert!(map.symbols.iter().any(|s| s.name == "IAuth" && matches!(s.kind, SymbolKind::Interface)));
        assert!(map.symbols.iter().any(|s| s.name == "helper" && matches!(s.kind, SymbolKind::Function)));
        assert!(map.symbols.iter().any(|s| s.name == "arrow"));
        assert!(map.symbols.iter().any(|s| s.name == "MyType"));
        assert!(map.symbols.iter().any(|s| s.name == "Status"));
    }

    #[test]
    fn parse_rust_struct_impl_fn() {
        let src = r#"
pub struct Foo {
    x: i32,
}

impl Foo {
    pub fn new() -> Self {
        Foo { x: 0 }
    }

    pub fn get(&self) -> i32 {
        self.x
    }
}

pub fn standalone() {}
"#;
        let map = parse_file("foo.rs", src);
        assert_eq!(map.language, "rust");
        let struct_sym = map.symbols.iter().find(|s| s.name == "Foo").unwrap();
        assert!(matches!(struct_sym.kind, SymbolKind::Struct));

        let impl_sym = map.symbols.iter().find(|s| matches!(s.kind, SymbolKind::Impl)).unwrap();
        assert_eq!(impl_sym.children.len(), 2);
        assert!(impl_sym.children.iter().any(|c| c.name == "new"));
        assert!(impl_sym.children.iter().any(|c| c.name == "get"));

        assert!(map.symbols.iter().any(|s| s.name == "standalone"));
    }

    #[test]
    fn line_numbers_are_correct() {
        let src = "line1\nline2\nexport class Foo {}\nline4\n";
        let map = parse_file("foo.ts", src);
        assert_eq!(map.symbols.len(), 1);
        assert_eq!(map.symbols[0].line, 3);
    }
}
