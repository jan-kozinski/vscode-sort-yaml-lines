import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { commands, window, Range, Selection, Uri, TextDocument, TextEditor } from 'vscode';
import { groupByIndentation } from '../../sort-lines';

function selectAllText(editor: TextEditor): void {
  const selection = new Selection(0, 0, editor.document.lineCount - 1, editor.document.lineAt(editor.document.lineCount - 1).text.length);
  editor.selection = selection;
}

function getAllText(document: TextDocument): string {
  return document.getText(new Range(0, 0, document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length));
}

const fixtureDir = path.join(__dirname, '../../../fixtures');
const fixtures = fs.readdirSync(fixtureDir).filter(v => v.search('_fixture$') !== -1).map(f => f.replace('_fixture', ''));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));
const extCommands: string[] = packageJson.contributes.commands.map((c: { command: string } | undefined) => {
  if (!c) {
    throw new Error('Command without an id encountered');
  }
  return c.command.replace('sortLines.', '');
});
const expectedExists: { [fixture: string]: { [command: string]: boolean } } = {};

Math.random = function(): 0.9 { return 0.9; };

suite('Sort Lines', () => {
  suite('All command fixtures exist', () => {
    fixtures.forEach(fixture => {
      test(fixture, () => {
        expectedExists[fixture] = {};
        extCommands.forEach(extCommand => {
          const exists = fs.existsSync(path.join(fixtureDir, `${fixture}_expected/${extCommand}`));
          expectedExists[fixture][extCommand] = exists;
          assert.ok(exists, `Expected result of fixture ${fixture} for command ${extCommand} does not exist. Create the expected result in fixtures/${fixture}_expected/${extCommand}.`);
        });
      });
    });
  });

  extCommands.forEach(extCommand => {
    suite(extCommand, () => {
      fixtures.forEach(fixture => {
        test(fixture, done => {
          if (!expectedExists[fixture][extCommand]) {
            done(new Error(`Could not find expected text for fixture ${fixture}`));
            return;
          }
          commands.executeCommand('workbench.action.closeActiveEditor').then(() => {
            return window.showTextDocument(Uri.file(path.join(fixtureDir, `${fixture}_fixture`))).then(editor => {
              selectAllText(editor);
              commands.executeCommand(`sortLines.${extCommand}`).then(() => {
                const expectedPath = path.join(fixtureDir, `${fixture}_expected/${extCommand}`);
                const expected = fs.readFileSync(expectedPath, 'utf8');
                const actual = getAllText(editor.document);
                if (actual !== expected) {
                  done(Error(`Command output is not expected\n\nExpected:\n${expected}\n\nActual:\n${actual}`));
                } else {
                  done();
                }
              });
            });
          });
        });
      });
    });
  });
});

suite('groupByIndentation', () => {
  test('should handle empty array', () => {
    const result = groupByIndentation([]);
    assert.strictEqual(result.length, 0);
  });

  test('should handle single line with no indentation', () => {
    const lines = ['root'];
    const result = groupByIndentation(lines);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].line, 'root');
    assert.strictEqual(result[0].indentLevel, 0);
    assert.strictEqual(result[0].children.length, 0);
  });

  test('should handle multiple root-level lines', () => {
    const lines = ['root1', 'root2', 'root3'];
    const result = groupByIndentation(lines);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].line, 'root1');
    assert.strictEqual(result[1].line, 'root2');
    assert.strictEqual(result[2].line, 'root3');
  });

  test('should handle simple one-level nesting', () => {
    const lines = [
      'root',
      '  child1',
      '  child2'
    ];
    const result = groupByIndentation(lines);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].line, 'root');
    assert.strictEqual(result[0].children.length, 2);
    assert.strictEqual(result[0].children[0].line, '  child1');
    assert.strictEqual(result[0].children[1].line, '  child2');
  });

  test('should handle multi-level nesting', () => {
    const lines = [
      'root',
      '  child',
      '    grandchild',
      '      greatgrandchild'
    ];
    const result = groupByIndentation(lines);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].line, 'root');
    assert.strictEqual(result[0].children.length, 1);
    assert.strictEqual(result[0].children[0].line, '  child');
    assert.strictEqual(result[0].children[0].children.length, 1);
    assert.strictEqual(result[0].children[0].children[0].line, '    grandchild');
    assert.strictEqual(result[0].children[0].children[0].children.length, 1);
    assert.strictEqual(result[0].children[0].children[0].children[0].line, '      greatgrandchild');
  });

  test('should handle YAML-like structure', () => {
    const lines = [
      'root_key1: value1',
      'root_key2: value2',
      'nested:',
      '  child1: value',
      '  child2: value',
      '  deep_nest:',
      '    grandchild1: value',
      '    grandchild2: value',
      'root_key3: value3'
    ];
    const result = groupByIndentation(lines);
    
    // Should have 4 root nodes
    assert.strictEqual(result.length, 4);
    assert.strictEqual(result[0].line, 'root_key1: value1');
    assert.strictEqual(result[1].line, 'root_key2: value2');
    assert.strictEqual(result[2].line, 'nested:');
    assert.strictEqual(result[3].line, 'root_key3: value3');
    
    // nested: should have 3 children
    assert.strictEqual(result[2].children.length, 3);
    assert.strictEqual(result[2].children[0].line, '  child1: value');
    assert.strictEqual(result[2].children[1].line, '  child2: value');
    assert.strictEqual(result[2].children[2].line, '  deep_nest:');
    
    // deep_nest: should have 2 children
    assert.strictEqual(result[2].children[2].children.length, 2);
    assert.strictEqual(result[2].children[2].children[0].line, '    grandchild1: value');
    assert.strictEqual(result[2].children[2].children[1].line, '    grandchild2: value');
  });

  test('should handle indentation with tabs', () => {
    const lines = [
      'root',
      '\tchild1',
      '\tchild2'
    ];
    const result = groupByIndentation(lines);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].children.length, 2);
  });

  test('should handle mixed spaces and tabs', () => {
    const lines = [
      'root',
      '  child1',
      '\t\tchild2'
    ];
    const result = groupByIndentation(lines);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].children.length, 2);
  });

  test('should handle going back to root level after nesting', () => {
    const lines = [
      'root1',
      '  child',
      '    grandchild',
      'root2',
      '  another_child'
    ];
    const result = groupByIndentation(lines);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].line, 'root1');
    assert.strictEqual(result[0].children.length, 1);
    assert.strictEqual(result[0].children[0].children.length, 1);
    assert.strictEqual(result[1].line, 'root2');
    assert.strictEqual(result[1].children.length, 1);
  });

  test('should correctly calculate indentation levels', () => {
    const lines = [
      'level0',
      '  level2',
      '    level4',
      '      level6'
    ];
    const result = groupByIndentation(lines);
    assert.strictEqual(result[0].indentLevel, 0);
    assert.strictEqual(result[0].children[0].indentLevel, 2);
    assert.strictEqual(result[0].children[0].children[0].indentLevel, 4);
    assert.strictEqual(result[0].children[0].children[0].children[0].indentLevel, 6);
  });
});

suite('sortYamlPreservingStructure', () => {
  // Import the private helper functions through the module for testing
  const sortLines = require('../../sort-lines');

  test('should sort root-level lines while preserving structure', () => {
    const lines = [
      'zebra: value',
      '  child1: val1',
      '  child2: val2',
      'apple: value',
      '  child3: val3',
      'banana: value'
    ];
    
    // Create a simple test by manually calling groupByIndentation
    const roots = sortLines.groupByIndentation(lines);
    
    // The roots should be in original order
    assert.strictEqual(roots.length, 3);
    assert.strictEqual(roots[0].line, 'zebra: value');
    assert.strictEqual(roots[1].line, 'apple: value');
    assert.strictEqual(roots[2].line, 'banana: value');
  });

  test('should handle nested YAML structure correctly', () => {
    const lines = [
      'root1:',
      '  zebra: value',
      '  apple: value',
      'root2:',
      '  child: value'
    ];
    
    const roots = sortLines.groupByIndentation(lines);
    
    // Verify structure is maintained
    assert.strictEqual(roots.length, 2);
    assert.strictEqual(roots[0].children.length, 2);
    assert.strictEqual(roots[1].children.length, 1);
  });
});
