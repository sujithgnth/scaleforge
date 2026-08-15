import type { ConfirmChannel } from 'amqplib';

export const EVENT_EXCHANGE = 'scaleforge.events';
export const RETRY_EXCHANGE = 'scaleforge.retry';
export const DEAD_LETTER_EXCHANGE = 'scaleforge.dlx';

export const consumerDefinitions = {
  notification: {
    queue: 'notification.events',
    bindings: ['order.created'],
  },
  audit: {
    queue: 'audit.events',
    bindings: ['order.created', 'payment.completed'],
  },
} as const;

export type ConsumerName = keyof typeof consumerDefinitions;

export async function assertRabbitTopology(channel: ConfirmChannel): Promise<void> {
  await channel.assertExchange(EVENT_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(RETRY_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', { durable: true });

  for (const [name, definition] of Object.entries(consumerDefinitions)) {
    await channel.assertQueue(definition.queue, { durable: true });
    for (const binding of definition.bindings) {
      await channel.bindQueue(definition.queue, EVENT_EXCHANGE, binding);
    }

    const retryQueue = `${definition.queue}.retry`;
    await channel.assertQueue(retryQueue, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': EVENT_EXCHANGE },
    });
    for (const binding of definition.bindings) {
      await channel.bindQueue(retryQueue, RETRY_EXCHANGE, binding);
    }

    const deadQueue = `${definition.queue}.dlq`;
    await channel.assertQueue(deadQueue, { durable: true });
    await channel.bindQueue(deadQueue, DEAD_LETTER_EXCHANGE, `${name}.#`);
  }
}
