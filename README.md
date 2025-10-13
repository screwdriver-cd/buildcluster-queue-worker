# Screwdriver Build Cluster Queue Worker
[![Version][npm-image]][npm-url] ![Downloads][downloads-image] [![Build Status][status-image]][status-url] [![Open Issues][issues-image]][issues-url] ![License][license-image]

> An amqp connection manager implementation that consumes jobs from Rabbitmq queue.

## Usage

```bash
npm install screwdriver-buildcluster-queue-worker
```

## Build Start Workflow

The queue worker processes build start messages from RabbitMQ and manages pod lifecycle in Kubernetes.

> **See [WORKFLOW.md](WORKFLOW.md) for detailed workflow diagram with retry behavior**

### Configuration

- `prefetchCount`: 20 messages per worker (default)
- `buildInitTimeout`: 5 minutes (default)
- `messageReprocessLimit`: 5 retries in retry queue (default)

## Testing

```bash
npm test
```

## License

Code licensed under the BSD 3-Clause license. See LICENSE file for terms.

[npm-image]: https://img.shields.io/npm/v/screwdriver-buildcluster-queue-worker.svg
[npm-url]: https://npmjs.org/package/screwdriver-buildcluster-queue-worker
[downloads-image]: https://img.shields.io/npm/dt/screwdriver-buildcluster-queue-worker.svg
[license-image]: https://img.shields.io/npm/l/screwdriver-buildcluster-queue-worker.svg
[issues-image]: https://img.shields.io/github/issues/screwdriver-cd/buildcluster-queue-worker.svg
[issues-url]: https://github.com/screwdriver-cd/buildcluster-queue-worker/issues
[status-image]: https://cd.screwdriver.cd/pipelines/1825/badge
[status-url]: https://cd.screwdriver.cd/pipelines/1825
