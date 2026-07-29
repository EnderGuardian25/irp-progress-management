import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";
import { ConsoleSpanExporter, type SpanExporter } from "@opentelemetry/sdk-trace-node";

/**
 * Which span exporter this process should use.
 *
 * The seam createTracerProvider(exporter) already existed for tests to inject
 * an InMemorySpanExporter (ADR-0007). This adds the production choice on the
 * other side of it, so Plan 4B supplies a connection string and changes no
 * code.
 *
 * A whitespace-only value counts as absent: an Azure app setting left blank is
 * a configuration mistake, and honouring it would build an exporter that
 * silently drops every span rather than falling back to something visible.
 */
export function selectSpanExporter(env: Partial<Record<string, string>>): SpanExporter {
  const connectionString = (env.APPLICATIONINSIGHTS_CONNECTION_STRING ?? "").trim();
  if (connectionString === "") {
    return new ConsoleSpanExporter();
  }
  return new AzureMonitorTraceExporter({ connectionString });
}
