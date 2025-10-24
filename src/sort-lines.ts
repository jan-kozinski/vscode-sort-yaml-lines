import * as vscode from 'vscode';

type ArrayTransformer = (lines: string[]) => string[];
type SortingAlgorithm = (a: string, b: string) => number;

/**
 * Represents a node in the indentation tree structure
 */
export interface IndentationNode {
  /** The text content of this line */
  line: string;
  /** The indentation level (number of leading spaces/tabs) */
  indentLevel: number;
  /** Child nodes with greater indentation */
  children: IndentationNode[];
}

function makeSorter(algorithm?: SortingAlgorithm): ArrayTransformer {
  return function(lines: string[]): string[] {
    return lines.sort(algorithm);
  };
}

function sortActiveSelection(transformers: ArrayTransformer[]): Thenable<boolean> | undefined {
  const textEditor = vscode.window.activeTextEditor;
  if (!textEditor) {
    return undefined;
  }
  const selection = textEditor.selection;

  if (selection.isEmpty && vscode.workspace.getConfiguration('sortLines').get('sortEntireFile') === true) {
    return sortLines(textEditor, 0, textEditor.document.lineCount - 1, transformers);
  }

  if (selection.isSingleLine) {
    return undefined;
  }

  let endLine = selection.end.line;

  // Ignore unselected last line
  if (selection.end.character === 0 && vscode.workspace.getConfiguration('sortLines').get('ignoreUnselectedLastLine') === true) {
    endLine -= 1;
  }
  return sortLines(textEditor, selection.start.line, endLine, transformers);
}

function sortLines(textEditor: vscode.TextEditor, startLine: number, endLine: number, transformers: ArrayTransformer[]): Thenable<boolean> {
  let lines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    lines.push(textEditor.document.lineAt(i).text);
  }

  // Remove blank lines in selection
  if (vscode.workspace.getConfiguration('sortLines').get('filterBlankLines') === true) {
    removeBlanks(lines);
  }

  lines = transformers.reduce((currentLines, transform) => transform(currentLines), lines);

  return textEditor.edit(editBuilder => {
    const range = new vscode.Range(startLine, 0, endLine, textEditor.document.lineAt(endLine).text.length);
    editBuilder.replace(range, lines.join('\n'));
  });
}

function removeDuplicates(lines: string[]): string[] {
  return Array.from(new Set(lines));
}

function keepOnlyDuplicates(lines: string[]): string[] {
  return Array.from(new Set(lines.filter((element, index, array) => array.indexOf(element) !== index)));
}

function keepOnlyNotDuplicates(lines: string[]): string[] {
  return Array.from(new Set(lines.filter((element, index, array) => (array.lastIndexOf(element) === array.indexOf(element)))));
}

function removeBlanks(lines: string[]): void {
  for (let i = 0; i < lines.length; ++i) {
    if (lines[i].trim() === '') {
      lines.splice(i, 1);
      i--;
    }
  }
}

function reverseCompare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? 1 : -1;
}

function caseInsensitiveCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, {sensitivity: 'base'});
}

function lineLengthCompare(a: string, b: string): number {
  // Use Array.from so that multi-char characters count as 1 each
  const aLength = Array.from(a).length;
  const bLength = Array.from(b).length;
  if (aLength === bLength) {
    return 0;
  }
  return aLength > bLength ? 1 : -1;
}

function lineLengthReverseCompare(a: string, b: string): number {
  return lineLengthCompare(a, b) * -1;
}

function variableLengthCompare(a: string, b: string): number {
  return lineLengthCompare(getVariableCharacters(a), getVariableCharacters(b));
}

function variableLengthReverseCompare(a: string, b: string): number {
  return variableLengthCompare(a, b) * -1;
}

let intlCollator: Intl.Collator;
function naturalCompare(a: string, b: string): number {
  if (!intlCollator) {
    intlCollator = new Intl.Collator(undefined, {numeric: true});
  }
  return intlCollator.compare(a, b);
}

function getVariableCharacters(line: string): string {
  const match = line.match(/(.*)=/);
  if (!match) {
    return line;
  }
  const last = match.pop();
  if (!last) {
    return line;
  }
  return last;
}

function shuffleSorter(lines: string[]): string[] {
    for (let i = lines.length - 1; i > 0; i--) {
        const rand = Math.floor(Math.random() * (i + 1));
        [lines[i], lines[rand]] = [lines[rand], lines[i]];
    }
    return lines;
}

function sortYamlPreservingStructure(lines: string[]): string[] {
  // Group lines by indentation to create tree structure
  const roots = groupByIndentation(lines);
  
  // Sort nodes recursively while preserving structure
  sortNodesRecursively(roots);
  
  // Flatten back to array of lines
  return flattenNodes(roots);
}

function sortNodesRecursively(nodes: IndentationNode[]): void {
  // Sort nodes at current level
  nodes.sort((a, b) => a.line.localeCompare(b.line));
  
  // Recursively sort children of each node
  for (const node of nodes) {
    if (node.children.length > 0) {
      sortNodesRecursively(node.children);
    }
  }
}

function flattenNodes(nodes: IndentationNode[]): string[] {
  const result: string[] = [];
  
  for (const node of nodes) {
    result.push(node.line);
    if (node.children.length > 0) {
      result.push(...flattenNodes(node.children));
    }
  }
  
  return result;
}

const transformerSequences = {
  sortNormal: [makeSorter()],
  sortUnique: [makeSorter(), removeDuplicates],
  sortReverse: [makeSorter(reverseCompare)],
  sortCaseInsensitive: [makeSorter(caseInsensitiveCompare)],
  sortCaseInsensitiveUnique: [makeSorter(caseInsensitiveCompare), removeDuplicates],
  sortLineLength: [makeSorter(lineLengthCompare)],
  sortLineLengthReverse: [makeSorter(lineLengthReverseCompare)],
  sortVariableLength: [makeSorter(variableLengthCompare)],
  sortVariableLengthReverse: [makeSorter(variableLengthReverseCompare)],
  sortNatural: [makeSorter(naturalCompare)],
  sortShuffle: [shuffleSorter],
  sortYamlPreservingStructure: [sortYamlPreservingStructure],
  removeDuplicateLines: [removeDuplicates],
  keepOnlyDuplicateLines: [keepOnlyDuplicates],
  keepOnlyNotDuplicateLines: [keepOnlyNotDuplicates]
};

export const sortNormal = () => sortActiveSelection(transformerSequences.sortNormal);
export const sortUnique = () => sortActiveSelection(transformerSequences.sortUnique);
export const sortReverse = () => sortActiveSelection(transformerSequences.sortReverse);
export const sortCaseInsensitive = () => sortActiveSelection(transformerSequences.sortCaseInsensitive);
export const sortCaseInsensitiveUnique = () => sortActiveSelection(transformerSequences.sortCaseInsensitiveUnique);
export const sortLineLength = () => sortActiveSelection(transformerSequences.sortLineLength);
export const sortLineLengthReverse = () => sortActiveSelection(transformerSequences.sortLineLengthReverse);
export const sortVariableLength = () => sortActiveSelection(transformerSequences.sortVariableLength);
export const sortVariableLengthReverse = () => sortActiveSelection(transformerSequences.sortVariableLengthReverse);
export const sortNatural = () => sortActiveSelection(transformerSequences.sortNatural);
export const sortShuffle = () => sortActiveSelection(transformerSequences.sortShuffle);
export const sortYaml = () => sortActiveSelection(transformerSequences.sortYamlPreservingStructure);
export const removeDuplicateLines = () => sortActiveSelection(transformerSequences.removeDuplicateLines);
export const keepOnlyDuplicateLines = () => sortActiveSelection(transformerSequences.keepOnlyDuplicateLines);
export const keepOnlyNotDuplicateLines = () => sortActiveSelection(transformerSequences.keepOnlyNotDuplicateLines);

/**
 * Groups file content by indentation level into a tree structure.
 * Each node represents a line and its children are lines with greater indentation.
 * 
 * @param lines - Array of strings representing file lines
 * @returns Array of root-level IndentationNodes
 */
export function groupByIndentation(lines: string[]): IndentationNode[] {
  const roots: IndentationNode[] = [];
  const stack: IndentationNode[] = [];

  for (const line of lines) {
    // Calculate indentation level (counting leading spaces)
    // Note: Tabs are normalized to single spaces for consistent indentation comparison
    const match = line.match(/^(\s*)/);
    const indentStr = match ? match[1] : '';
    const indentLevel = indentStr.replace(/\t/g, ' ').length;

    const node: IndentationNode = {
      line,
      indentLevel,
      children: []
    };

    // Pop stack until we find the parent (node with indentation less than current)
    while (stack.length > 0 && stack[stack.length - 1].indentLevel >= indentLevel) {
      stack.pop();
    }

    // If stack is empty, this is a root node
    if (stack.length === 0) {
      roots.push(node);
    } else {
      // Otherwise, add as child to the node at top of stack
      stack[stack.length - 1].children.push(node);
    }

    // Push current node to stack
    stack.push(node);
  }

  return roots;
}
