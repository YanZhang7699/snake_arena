export class TypedEmitter<TEvents extends object> {
  private listeners = new Map<keyof TEvents, Set<(value: any) => void>>();

  on<K extends keyof TEvents>(event: K, handler: (value: TEvents[K]) => void): () => void {
    const existing = this.listeners.get(event) ?? new Set<(value: any) => void>();
    existing.add(handler as (value: any) => void);
    this.listeners.set(event, existing);
    return () => this.off(event, handler);
  }

  off<K extends keyof TEvents>(event: K, handler: (value: TEvents[K]) => void): void {
    const existing = this.listeners.get(event);
    if (!existing) {
      return;
    }
    existing.delete(handler as (value: any) => void);
    if (existing.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends keyof TEvents>(event: K, value: TEvents[K]): void {
    const existing = this.listeners.get(event);
    if (!existing) {
      return;
    }
    for (const handler of existing) {
      handler(value);
    }
  }
}
