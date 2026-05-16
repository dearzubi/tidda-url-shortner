import { type SpanContext, trace } from '@opentelemetry/api';

export type TraceLogFields = {
  trace_id?: string;
  span_id?: string;
  trace_flags?: string;
};

export function traceLogFieldsFromSpanContext(
  spanContext: SpanContext | undefined,
): TraceLogFields {
  if (spanContext === undefined) {
    return {};
  }

  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: spanContext.traceFlags.toString(16).padStart(2, '0'),
  };
}

export function getActiveTraceLogFields(): TraceLogFields {
  return traceLogFieldsFromSpanContext(trace.getActiveSpan()?.spanContext());
}
