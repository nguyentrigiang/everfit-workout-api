import { DEFAULT_UNIT_REGISTRY } from './units/unit-registry.js';
import { UnitConverter } from './units/unit-converter.js';
import {
  computeSetMetrics,
  estimateOneRepMax,
  setVolume,
} from './strength-metrics.js';

describe('estimateOneRepMax (Epley)', () => {
  it('estimates 96 kg from 80 kg × 6', () => {
    expect(estimateOneRepMax(80, 6).toString()).toBe('96');
  });

  it('applies the formula to single-rep sets too (100 kg × 1)', () => {
    expect(estimateOneRepMax(100, 1).toDecimalPlaces(6).toString()).toBe(
      '103.333333',
    );
  });

  it('estimates 80 kg from 60 kg × 10', () => {
    expect(estimateOneRepMax(60, 10).toString()).toBe('80');
  });
});

describe('setVolume', () => {
  it('multiplies reps by weight', () => {
    expect(setVolume(60, 10).toString()).toBe('600');
  });
});

describe('computeSetMetrics', () => {
  it('rounds stored metrics to 6 decimals', () => {
    const metrics = computeSetMetrics(100, 1);

    expect(metrics.volumeKg.toString()).toBe('100');
    expect(metrics.e1rmKg.toString()).toBe('103.333333');
  });

  it('derives all stored values from the kg weight rounded to 6 decimals', () => {
    // 135 lb = 61.23496995 kg (8 decimals) → stored as 61.234970
    const weightKg = new UnitConverter(DEFAULT_UNIT_REGISTRY).toKg(135, 'lb');

    const metrics = computeSetMetrics(weightKg, 10);

    expect(metrics.weightKg.toString()).toBe('61.23497');
    expect(metrics.volumeKg.toString()).toBe('612.3497');
    expect(metrics.e1rmKg.toString()).toBe(
      metrics.weightKg.times(40).div(30).toDecimalPlaces(6).toString(),
    );
  });

  it('computes metrics for a set logged in lb (225 lb × 5)', () => {
    const weightKg = new UnitConverter(DEFAULT_UNIT_REGISTRY).toKg(225, 'lb');

    const metrics = computeSetMetrics(weightKg, 5);

    // 225 lb = 102.05828325 kg → 102.058283; × 5 = 510.291415; × 35/30 = 119.067996833…
    expect(metrics.weightKg.toString()).toBe('102.058283');
    expect(metrics.volumeKg.toString()).toBe('510.291415');
    expect(metrics.e1rmKg.toString()).toBe('119.067997');
  });
});
