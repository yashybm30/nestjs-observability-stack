import * as Sentry from "@sentry/node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
if (process.env.SENTRY_DSN)
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
const sdk = new NodeSDK({
  serviceName: "observability-api",
  traceExporter: new OTLPTraceExporter({
    url:
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
      "http://localhost:4318/v1/traces",
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});
sdk.start();
process.once("SIGTERM", () => {
  void sdk.shutdown();
});
export { Sentry };
