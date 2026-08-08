import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScriptRunner } from '../../src/lib/scriptRunner.js';

test('ScriptRunner.execute executes async scripts with context variables', async () => {
    let executedValue = 0;
    const context = {
        multiplier: 3,
        setValue: (val) => { executedValue = val; }
    };

    await ScriptRunner.execute('setValue(10 * multiplier)', context);
    assert.equal(executedValue, 30);
});

test('ScriptRunner.execute handles empty or invalid scripts gracefully without throwing', async () => {
    await assert.doesNotReject(async () => {
        await ScriptRunner.execute('');
        await ScriptRunner.execute(null);
        await ScriptRunner.execute(undefined);
        await ScriptRunner.execute('   ');
    });
});

test('ScriptRunner.execute catches script exceptions without propagating errors to caller', async () => {
    await assert.doesNotReject(async () => {
        await ScriptRunner.execute('throw new Error("User Script Error")', {}, "TestContext");
    });
});
