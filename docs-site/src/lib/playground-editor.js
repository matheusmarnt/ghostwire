// CodeMirror 6 setup for the playground's markup editor. Colors are all
// var(--gw-*)/var(--sl-color-*) references (not fixed hex) so the editor
// repaints automatically with the site's existing data-theme toggle —
// no separate light/dark theme objects or reactive swap code needed.
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const theme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--gw-code-bg)',
    color: 'var(--gw-code-fg)',
    fontFamily: 'var(--gw-font-mono)',
    fontSize: '0.85rem',
    height: '340px',
    border: '1px solid var(--gw-border)',
    borderRadius: '0.5rem',
  },
  '&.cm-focused': { outline: '1px solid var(--sl-color-accent)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
  '.cm-gutters': {
    backgroundColor: 'var(--gw-code-bg)',
    color: 'var(--gw-muted)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--sl-color-accent) 8%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--sl-color-accent) 8%, transparent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--sl-color-accent) 25%, transparent) !important',
  },
  '.cm-cursor': { borderLeftColor: 'var(--sl-color-accent)' },
});

const highlightStyle = HighlightStyle.define([
  { tag: tags.tagName, color: 'var(--sl-color-accent)' },
  { tag: tags.attributeName, color: 'var(--gw-violet-high)' },
  { tag: tags.attributeValue, color: 'var(--gw-code-fg)' },
  { tag: tags.angleBracket, color: 'var(--gw-muted)' },
  { tag: tags.comment, color: 'var(--gw-muted)', fontStyle: 'italic' },
  { tag: tags.string, color: 'var(--gw-code-fg)' },
]);

/**
 * @param {HTMLElement} parent
 * @param {string} doc
 * @param {() => void} [onChange]
 */
export function createPlaygroundEditor(parent, doc, onChange) {
  let debounceTimer = null;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        history(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        html(),
        theme,
        syntaxHighlighting(highlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || !onChange) return;
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(onChange, 250);
        }),
      ],
    }),
  });

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue(next) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    },
  };
}
