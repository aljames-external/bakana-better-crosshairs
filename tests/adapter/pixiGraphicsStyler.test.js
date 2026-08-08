import '../setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PixiGraphicsStyler } from '../../src/adapter/foundry/pixiGraphicsStyler.js';

test('PixiGraphicsStyler.toColorNumber converts hex strings and numbers to color values', () => {
    assert.equal(PixiGraphicsStyler.toColorNumber('#ff0000'), 0xff0000);
    assert.equal(PixiGraphicsStyler.toColorNumber('#00ff00'), 0x00ff00);
    assert.equal(PixiGraphicsStyler.toColorNumber(0x123456), 0x123456);
    assert.equal(PixiGraphicsStyler.toColorNumber(null), undefined);
    assert.equal(PixiGraphicsStyler.toColorNumber(''), undefined);
});

test('PixiGraphicsStyler.applyPlacedStyling applies border and fill colors across graphicsData', () => {
    const mockGraphic = {
        geometry: {
            graphicsData: [
                { lineStyle: { width: 2, color: 0x000000, alpha: 1 }, fillStyle: { alpha: 0.5, color: 0x000000 } }
            ],
            invalidate: () => {}
        }
    };

    const mockPlaceable = {
        document: {
            flags: {
                bbc: {
                    placedBorderColor: '#ff0000',
                    placedBorderAlpha: 0.8,
                    placedFillColor: '#00ff00',
                    placedFillAlpha: 0.4
                }
            }
        },
        template: mockGraphic
    };

    PixiGraphicsStyler.applyPlacedStyling(mockPlaceable, false);

    const gd = mockGraphic.geometry.graphicsData[0];
    assert.equal(gd.lineStyle.color, 0xff0000);
    assert.equal(gd.lineStyle.alpha, 0.8);
    assert.equal(gd.fillStyle.color, 0x00ff00);
    assert.equal(gd.fillStyle.alpha, 0.4);
});
