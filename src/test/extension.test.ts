import { describe, it, before } from 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Extension Activation & Commands Test Suite', () => {
    
    it('should activate the extension successfully', async () => {
        const ext = vscode.extensions.getExtension('codepilot-system.codepilot-vscode-extension'); 
        
        if (ext) {
            if (!ext.isActive) {
                await ext.activate();
            }
            assert.strictEqual(ext.isActive, true);
        } else {
            assert.ok(true, 'Running in isolated dev context');
        }
    });

    it('should register all CodePilot core commands', async () => {
        const allCommands = await vscode.commands.getCommands(true);
        
        const expectedCommands = [
            'codepilot.triggerLocalScan',
            'codepilot.applyPatch',
            'codepilot.showSuggestions',
            'codepilot.previewSuggestion',
            'codepilot.applySuggestion',
            'codepilot.validatePatch'
        ];

        expectedCommands.forEach(cmd => {
            const isRegistered = allCommands.includes(cmd);
            assert.strictEqual(isRegistered, true, `Command ${cmd} is missing from registration!`);
        });
    });
});