import type * as monaco from "monaco-editor";

/** The five Drafting Monaco themes — shared by the code editor panel and
 *  the Sketch text panel (defineTheme is idempotent). */
export function defineDraftingThemes(m: typeof monaco): void {

            // Dark variant
            m.editor.defineTheme("drafting-dark", {
              base: "vs-dark",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#0a0b1300",
                "editor.foreground": "#e8ecf5",
                "editor.lineHighlightBackground": "#ffffff08",
                "editor.selectionBackground": "#a8c6ff33",
                "editorCursor.foreground": "#a8c6ff",
                "editorLineNumber.foreground": "#7d859e66",
                "editorLineNumber.activeForeground": "#b5bdd4",
                "editorIndentGuide.background": "#ffffff0a",
                "editorIndentGuide.activeBackground": "#ffffff1a",
                "editorWhitespace.foreground": "#ffffff14",
                "editor.selectionHighlightBackground": "#a8c6ff1a",
                "editor.wordHighlightBackground": "#ffffff0f",
                "editorBracketMatch.background": "#a8c6ff22",
                "editorBracketMatch.border": "#a8c6ff66",
                "scrollbarSlider.background": "#ffffff10",
                "scrollbarSlider.hoverBackground": "#ffffff20",
                "scrollbarSlider.activeBackground": "#ffffff30",
              },
            });

            // Light variant
            m.editor.defineTheme("drafting-light", {
              base: "vs",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#ffffff00",
                "editor.foreground": "#1a2140",
                "editor.lineHighlightBackground": "#1a214008",
                "editor.selectionBackground": "#5b7cff33",
                "editorCursor.foreground": "#5b7cff",
                "editorLineNumber.foreground": "#8591ab80",
                "editorLineNumber.activeForeground": "#4a5577",
                "editorIndentGuide.background": "#1a214010",
                "editorIndentGuide.activeBackground": "#1a214022",
                "editor.selectionHighlightBackground": "#5b7cff1a",
                "editor.wordHighlightBackground": "#1a21400a",
                "editorBracketMatch.background": "#5b7cff22",
                "editorBracketMatch.border": "#5b7cff66",
                "scrollbarSlider.background": "#1a214018",
                "scrollbarSlider.hoverBackground": "#1a214028",
                "scrollbarSlider.activeBackground": "#1a214038",
              },
            });

            // Soft variant
            m.editor.defineTheme("drafting-soft", {
              base: "vs-dark",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#1e203000",
                "editor.foreground": "#e8e2f0",
                "editor.lineHighlightBackground": "#ffffff0a",
                "editor.selectionBackground": "#c9c0e433",
                "editorCursor.foreground": "#c9c0e4",
                "editorLineNumber.foreground": "#8a85a066",
                "editorLineNumber.activeForeground": "#c5bed4",
                "editorIndentGuide.background": "#ffffff0c",
                "editorIndentGuide.activeBackground": "#ffffff1a",
                "editorWhitespace.foreground": "#ffffff14",
                "editor.selectionHighlightBackground": "#c9c0e41a",
                "editor.wordHighlightBackground": "#ffffff0f",
                "editorBracketMatch.background": "#c9c0e422",
                "editorBracketMatch.border": "#c9c0e466",
                "scrollbarSlider.background": "#ffffff10",
                "scrollbarSlider.hoverBackground": "#ffffff20",
                "scrollbarSlider.activeBackground": "#ffffff30",
              },
            });

            // Blossom variant (rose pink)
            m.editor.defineTheme("drafting-blossom", {
              base: "vs",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#ffdee700",
                "editor.foreground": "#4a1929",
                "editor.lineHighlightBackground": "#4a192908",
                "editor.selectionBackground": "#d6477233",
                "editorCursor.foreground": "#d64772",
                "editorLineNumber.foreground": "#a8607a80",
                "editorLineNumber.activeForeground": "#7c3248",
                "editorIndentGuide.background": "#4a192910",
                "editorIndentGuide.activeBackground": "#4a192922",
                "editor.selectionHighlightBackground": "#d647721a",
                "editor.wordHighlightBackground": "#4a19290a",
                "editorBracketMatch.background": "#d6477222",
                "editorBracketMatch.border": "#d6477266",
                "scrollbarSlider.background": "#4a192918",
                "scrollbarSlider.hoverBackground": "#4a192928",
                "scrollbarSlider.activeBackground": "#4a192938",
              },
            });

            // Mist variant (lavender blue)
            m.editor.defineTheme("drafting-mist", {
              base: "vs",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#c5cef900",
                "editor.foreground": "#1a2457",
                "editor.lineHighlightBackground": "#1a245708",
                "editor.selectionBackground": "#4a60d833",
                "editorCursor.foreground": "#4a60d8",
                "editorLineNumber.foreground": "#6b75a880",
                "editorLineNumber.activeForeground": "#3a4780",
                "editorIndentGuide.background": "#1a245710",
                "editorIndentGuide.activeBackground": "#1a245722",
                "editor.selectionHighlightBackground": "#4a60d81a",
                "editor.wordHighlightBackground": "#1a24570a",
                "editorBracketMatch.background": "#4a60d822",
                "editorBracketMatch.border": "#4a60d866",
                "scrollbarSlider.background": "#1a245718",
                "scrollbarSlider.hoverBackground": "#1a245728",
                "scrollbarSlider.activeBackground": "#1a245738",
              },
            });
}
