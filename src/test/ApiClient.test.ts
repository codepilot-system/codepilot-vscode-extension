import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ApiClient } from '../services/ApiClient';
import { suite, test, setup, teardown } from 'mocha';

suite('ApiClient Unit Test Suite', () => {
    let apiClient: ApiClient;
    let contextMock: vscode.ExtensionContext;
    let axiosGetStub: sinon.SinonStub;

    setup(() => {
        // Mock لـ VS Code Extension Context
        contextMock = {
            globalState: { get: () => undefined, update: () => Promise.resolve() },
            workspaceState: { get: () => undefined, update: () => Promise.resolve() },
            secrets: { store: () => Promise.resolve(), get: () => Promise.resolve(undefined) }
        } as any;

        apiClient = new ApiClient(contextMock);
        
        axiosGetStub = sinon.stub((apiClient as any).client, 'get');
    });

    teardown(() => {
        sinon.restore(); 
    });

    test('getSuggestions should successfully return an array of suggestions when API responds with success wrapper', async () => {
        const mockApiResponse = {
            status: 'success',
            data: [
                { id: 1, title: 'SQL Injection Vulnerability', line: 12 },
                { id: 2, title: 'Hardcoded Credentials', line: 45 }
            ]
        };

        axiosGetStub.resolves({ data: mockApiResponse });

        const suggestions = await apiClient.getSuggestions('mock-local-repo-id');

        assert.strictEqual(Array.isArray(suggestions), true);
        assert.strictEqual(suggestions!.length, 2);
        assert.strictEqual(suggestions![0].title, 'SQL Injection Vulnerability');
    });

    test('getSuggestions should return an empty array if the response format is unexpected', async () => {
        axiosGetStub.resolves({ data: { status: 'success', data: null } });

        const suggestions = await apiClient.getSuggestions('mock-local-repo-id');

        assert.deepStrictEqual(suggestions, []);
    });
});