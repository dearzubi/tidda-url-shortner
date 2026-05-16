import { describe, expect, it } from 'vitest';
import { traceLogFieldsFromSpanContext } from './trace-log-fields';

describe('traceLogFieldsFromSpanContext', () => {
  it('returns empty log bindings when no span context is active', () => {
    expect(traceLogFieldsFromSpanContext(undefined)).toEqual({});
  });

  it('maps an active span context to stable snake_case log fields', () => {
    expect(
      traceLogFieldsFromSpanContext({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        traceFlags: 1,
      }),
    ).toEqual({
      trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
      span_id: '00f067aa0ba902b7',
      trace_flags: '01',
    });
  });
});
