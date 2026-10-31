import {
  memoryRecordSchema,
  type BranchId,
  type MemoryRecord,
  type NpcId,
} from '../contracts/index.js';

export interface NpcMemoryPort {
  append(record: MemoryRecord): MemoryRecord;
  list(npcId: NpcId, branchId: BranchId): readonly MemoryRecord[];
  clear(branchId?: BranchId): void;
}

function keyOf(npcId: string, branchId: string): string {
  return `${branchId}\u0000${npcId}`;
}

export class InMemoryNpcMemory implements NpcMemoryPort {
  private readonly records = new Map<string, MemoryRecord[]>();

  append(record: MemoryRecord): MemoryRecord {
    const parsed = memoryRecordSchema.parse(record);
    const key = keyOf(parsed.npcId, parsed.branchId);
    const existing = this.records.get(key) ?? [];
    if (existing.some((candidate) => candidate.memoryId === parsed.memoryId)) {
      return structuredClone(parsed);
    }
    existing.push(structuredClone(parsed));
    this.records.set(key, existing);
    return structuredClone(parsed);
  }

  list(npcId: NpcId, branchId: BranchId): readonly MemoryRecord[] {
    const existing = this.records.get(keyOf(npcId, branchId)) ?? [];
    return [...existing]
      .sort((left, right) =>
        left.createdAtTick === right.createdAtTick
          ? left.memoryId < right.memoryId
            ? -1
            : 1
          : left.createdAtTick - right.createdAtTick,
      )
      .map((record) => structuredClone(record));
  }

  clear(branchId?: BranchId): void {
    if (!branchId) {
      this.records.clear();
      return;
    }
    for (const key of [...this.records.keys()]) {
      if (key.startsWith(`${branchId}\u0000`)) this.records.delete(key);
    }
  }
}
