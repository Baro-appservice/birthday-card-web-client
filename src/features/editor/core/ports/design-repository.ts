import type { Design } from '@/entities/design';

export type DesignLoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; design: Design; updatedAt?: number; needsSave?: boolean }
  | {
      status: 'recoverable';
      reason: 'corrupt' | 'unsupported-version';
      backup: Design | null;
      updatedAt?: number;
    };

export interface DesignRepository {
  load(cardId: string): Promise<DesignLoadResult>;
  save(cardId: string, design: Design): Promise<void>;
}
