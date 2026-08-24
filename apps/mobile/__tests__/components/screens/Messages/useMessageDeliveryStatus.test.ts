import {
  MATERIAL_DELIVERY_DELAY_MS,
  messageDeliveryStatus,
  pendingDeliveryRefetchInterval,
  PENDING_DELIVERY_REFETCH_MS,
} from '@/components/screens/Messages/useMessageDeliveryStatus';

describe('sender delivery status policy', () => {
  const created = '2026-08-24T12:00:00.000Z';
  const createdMs = new Date(created).getTime();

  it('shows no status during normal pending delivery', () => {
    expect(
      messageDeliveryStatus('pending', created, createdMs + MATERIAL_DELIVERY_DELAY_MS - 1),
    ).toBeNull();
  });

  it('shows status after a material pending delay', () => {
    expect(
      messageDeliveryStatus('pending', created, createdMs + MATERIAL_DELIVERY_DELAY_MS),
    ).toBe('Delivery delayed');
  });

  it('shows no status for states that are not pending', () => {
    expect(messageDeliveryStatus('quarantined', created)).toBeNull();
    expect(messageDeliveryStatus('removed', created)).toBeNull();
    expect(messageDeliveryStatus('visible', created)).toBeNull();
  });

  it('polls only while an owned pending message is cached', () => {
    expect(pendingDeliveryRefetchInterval(true)).toBe(PENDING_DELIVERY_REFETCH_MS);
    expect(pendingDeliveryRefetchInterval(false)).toBe(false);
  });
});
