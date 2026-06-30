import { describe, it } from 'mocha';
import * as assert from 'assert';
import { PatchValidator } from '../services/PatchValidator'; // تأكدي من صحة المسار لملفك

describe('PatchValidator Unit Test Suite', () => {
    const validator = new PatchValidator();

    it('should fail validation if raw patch is empty or whitespace', () => {
        const resultEmpty = validator.validate('');
        const resultWhitespace = validator.validate('   ');

        assert.strictEqual(resultEmpty.valid, false);
        assert.deepStrictEqual(resultEmpty.errors, ['Patch is empty']);

        assert.strictEqual(resultWhitespace.valid, false);
        assert.deepStrictEqual(resultWhitespace.errors, ['Patch is empty']);
    });

    it('should fail validation if raw patch is invalid JSON', () => {
        const invalidJson = '{ operations: [ }'; // JSON مكسور
        const result = validator.validate(invalidJson);

        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].startsWith('Invalid JSON:'), true);
    });

    it('should fail validation if top-level operations is missing or not an array', () => {
        const missingOps = JSON.stringify({ project: 'test' });
        const invalidOpsType = JSON.stringify({ operations: 'not-an-array' });

        const resultMissing = validator.validate(missingOps);
        const resultInvalidType = validator.validate(invalidOpsType);

        assert.strictEqual(resultMissing.valid, false);
        assert.deepStrictEqual(resultMissing.errors, ["Top-level 'operations' array is required."]);

        assert.strictEqual(resultInvalidType.valid, false);
        assert.deepStrictEqual(resultInvalidType.errors, ["Top-level 'operations' array is required."]);
    });

    it('should fail validation if operation properties (type, path) are missing', () => {
        const rawPatch = JSON.stringify({
            operations: [
                { path: 'src/Main.java' }, // missing 'type'
                { type: 'deleteFile' }     // missing 'path'
            ]
        });

        const result = validator.validate(rawPatch);

        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors.length, 2);
        assert.strictEqual(result.errors[0], "op[0]: missing 'type'");
        assert.strictEqual(result.errors[1], "op[1]: missing 'path'");
    });

    it('should fail validation if content is missing or not a string for addFile, updateFile, or edit', () => {
        const rawPatch = JSON.stringify({
            operations: [
                { type: 'addFile', path: 'src/Main.java' }, // missing content completely
                { type: 'updateFile', path: 'pom.xml', content: 12345 } // content is a number, not string
            ]
        });

        const result = validator.validate(rawPatch);

        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors.length, 2);
        assert.strictEqual(result.errors[0], "op[0]: 'content' must be a string for type addFile");
        assert.strictEqual(result.errors[1], "op[1]: 'content' must be a string for type updateFile");
    });

    it('should pass validation if everything is structured perfectly', () => {
        const validPatch = JSON.stringify({
            operations: [
                { type: 'addFile', path: 'src/Main.java', content: 'public class Main {}' },
                { type: 'deleteFile', path: 'old-file.txt' } // delete doesn't require content
            ]
        });

        const result = validator.validate(validPatch);

        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.errors.length, 0);
    });
});