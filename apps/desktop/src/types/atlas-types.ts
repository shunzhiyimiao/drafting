export type SymbolKind =
  | "class"
  | "interface"
  | "function"
  | "method"
  | "property"
  | "enum"
  | "typeAlias"
  | "variable"
  | "struct"
  | "trait"
  | "impl"
  | "module";

export interface AtlasSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  column: number;
  detail: string | null;
  children: AtlasSymbol[];
}

export interface FileMap {
  path: string;
  language: string;
  symbols: AtlasSymbol[];
  totalLines: number;
  adapterId: string | null;
  fileBlueprintId: string | null;
  isGenerated: boolean;
}
