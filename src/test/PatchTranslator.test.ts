import { describe, it } from 'mocha';
import * as assert from 'assert';
import { PatchTranslator, PatchOperation } from '../services/PatchTranslator'; // تأكدي من صحة المسار لملفك

describe('PatchTranslator Unit Test Suite', () => {
    const translator = new PatchTranslator();

    it('should return an empty array if input is null, undefined, or empty object', () => {
        assert.deepStrictEqual(translator.translate(null), []);
        assert.deepStrictEqual(translator.translate(undefined), []);
        assert.deepStrictEqual(translator.translate({}), []);
    });

    it('should return an empty array if operations is not an array', () => {
        const invalidInput = { operations: 'not-an-array' };
        assert.deepStrictEqual(translator.translate(invalidInput), []);
    });

    it('should correctly normalize paths by stripping leading slashes', () => {
        const inputWithAbsolutePaths = {
            operations: [
                { type: 'addFile', path: '///src/app.java', content: 'class App {}' },
                { type: 'deleteFile', path: '/config.json' }
            ]
        };

        const result = translator.translate(inputWithAbsolutePaths);

        assert.strictEqual(result[0].path, 'src/app.java');
        assert.strictEqual(result[1].path, 'config.json');
    });

    it('should correctly translate known operation types (addFile, updateFile, deleteFile, edit)', () => {
        const parsedPatch = {
            operations: [
                { type: 'addFile', path: 'src/Main.java', content: 'public class Main {}' },
                { type: 'updateFile', path: 'pom.xml', content: '<dependencies></dependencies>' },
                { type: 'deleteFile', path: 'old-code.js' },
                { type: 'edit', path: 'README.md', content: '# Updated Docs' }
            ]
        };

        const result = translator.translate(parsedPatch);

        assert.strictEqual(result.length, 4);
        assert.deepStrictEqual(result[0], { type: 'addFile', path: 'src/Main.java', content: 'public class Main {}' });
        assert.deepStrictEqual(result[1], { type: 'updateFile', path: 'pom.xml', content: '<dependencies></dependencies>' });
        assert.deepStrictEqual(result[2], { type: 'deleteFile', path: 'old-code.js' });
        assert.deepStrictEqual(result[3], { type: 'edit', path: 'README.md', content: '# Updated Docs' });
    });

    it('should fallback to "edit" type if an unknown operation type is given', () => {
        const inputWithUnknownType = {
            operations: [
                { type: 'superAIFormat', path: 'src/Utils.java', content: 'new content' }
            ]
        };

        const result = translator.translate(inputWithUnknownType);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].type, 'edit'); // السلوك الافتراضي في الـ switch-case
        assert.strictEqual(result[0].path, 'src/Utils.java');
        assert.strictEqual(result[0].content, 'new content');
    });
});