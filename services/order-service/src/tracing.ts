import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';

const exporter = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT })
  : new ConsoleSpanExporter();

const sdk = new NodeSDK({
  resource: new Resource({ 'service.name': 'order-service' }),
  traceExporter: exporter,
});

sdk.start();
// eslint-disable-next-line no-console
process.on('SIGTERM', () => sdk.shutdown().catch(console.error));
