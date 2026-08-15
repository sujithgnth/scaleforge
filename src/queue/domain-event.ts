export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  type: 'OrderCreated' | 'PaymentCompleted';
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  correlationId?: string;
  payload: TPayload;
}

export function routingKeyFor(type: DomainEvent['type']): string {
  const routes: Record<DomainEvent['type'], string> = {
    OrderCreated: 'order.created',
    PaymentCompleted: 'payment.completed',
  };
  return routes[type];
}
