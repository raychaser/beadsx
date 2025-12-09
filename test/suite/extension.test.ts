import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    const extension = vscode.extensions.getExtension('raychaser.beadsx');
    assert.ok(extension, 'Extension not found');
  });

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('raychaser.beadsx');
    assert.ok(extension, 'Extension not found');

    await extension.activate();
    assert.strictEqual(extension.isActive, true, 'Extension did not activate');
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes('beadsx.refresh'), 'beadsx.refresh command not registered');
    assert.ok(commands.includes('beadsx.filter'), 'beadsx.filter command not registered');
    assert.ok(commands.includes('beadsx.showDetail'), 'beadsx.showDetail command not registered');
  });

  test('Configuration should have default values', () => {
    const config = vscode.workspace.getConfiguration('beadsx');

    assert.strictEqual(
      config.get('autoReloadInterval'),
      10,
      'Default autoReloadInterval should be 10',
    );
    assert.strictEqual(config.get('shortIds'), false, 'Default shortIds should be false');
    assert.strictEqual(config.get('autoExpandOpen'), true, 'Default autoExpandOpen should be true');
  });

  test('Tree view should be registered', async () => {
    // Wait a moment for tree view to register
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check that the view container exists by trying to focus on it
    try {
      await vscode.commands.executeCommand('beadsxIssues.focus');
      assert.ok(true, 'Tree view exists and can be focused');
    } catch {
      assert.fail('Tree view beadsxIssues not found');
    }
  });
});
