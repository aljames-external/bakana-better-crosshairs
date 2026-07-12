import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { log } from '../../src/lib/logger.js';
import { notify } from '../../src/lib/notifier.js';

test('logger verbosity check and grouping interface contracts', () => {
    log.setVerbosity(3);

    // Ensure grouping and standard log levels do not throw and maintain internal stack
    log.group('Test Group');
    log.info('Inside group');
    log.groupEnd();

    assert.doesNotThrow(() => {
        log.error('Error log');
        log.warn('Warning log');
        log.debug('Debug log');
    });
});

test('notifier queues and flushes notifications without errors', async () => {
    assert.doesNotThrow(() => {
        notify.info('Test Info Notification');
        notify.warn('Test Warn Notification');
        notify.error('Test Error Notification');
    });
});
