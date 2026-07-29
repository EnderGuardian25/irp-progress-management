import { describe, expect, it } from "vitest";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";
import { selectSpanExporter } from "../src/exporter.js";

// A syntactically valid connection string with a zero instrumentation key.
// The exporter must be constructible from it WITHOUT any network call — that
// is the property this test relies on, and it is why the test is a unit test.
const CONNECTION_STRING =
  "InstrumentationKey=00000000-0000-0000-0000-000000000000;" +
  "IngestionEndpoint=https://southeastasia-1.in.applicationinsights.azure.com/";

describe("selectSpanExporter", () => {
  it("falls back to the console exporter when the connection string is absent", () => {
    expect(selectSpanExporter({})).toBeInstanceOf(ConsoleSpanExporter);
  });

  it("treats an empty connection string as absent", () => {
    expect(
      selectSpanExporter({ APPLICATIONINSIGHTS_CONNECTION_STRING: "" }),
    ).toBeInstanceOf(ConsoleSpanExporter);
  });

  // A variable left as whitespace in a .env file or an Azure app setting is a
  // configuration mistake, not a request for Azure Monitor. Treating it as
  // present would construct an exporter that silently drops every span.
  it("treats a whitespace-only connection string as absent", () => {
    expect(
      selectSpanExporter({ APPLICATIONINSIGHTS_CONNECTION_STRING: "   " }),
    ).toBeInstanceOf(ConsoleSpanExporter);
  });

  it("selects the Azure Monitor exporter when a connection string is present", () => {
    expect(
      selectSpanExporter({ APPLICATIONINSIGHTS_CONNECTION_STRING: CONNECTION_STRING }),
    ).toBeInstanceOf(AzureMonitorTraceExporter);
  });
});
