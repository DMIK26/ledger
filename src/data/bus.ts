import type { Command } from './commands';
import type { Db } from './db';

export const AUDIT_LIMIT = 500;
export const UNDO_LIMIT = 20;
export const TRASH_DAYS = 30;

/** Runs commands, keeps the undo and redo stacks, and writes every step to the audit log. */
export class CommandBus {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(
    private readonly db: Db,
    private readonly onChange: () => Promise<void> | void,
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  /** Labels of the steps that can be undone, newest first. */
  get undoLabels(): string[] {
    return this.undoStack.map((c) => c.label).reverse();
  }
  get redoLabel(): string | null {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null;
  }
  get undoLabel(): string | null {
    return this.undoStack[this.undoStack.length - 1]?.label ?? null;
  }

  async run(command: Command): Promise<void> {
    await command.apply(this.db);
    await this.log('do', command.label, command.entities);
    this.undoStack.push(command);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    await this.onChange();
  }

  async undo(): Promise<string | null> {
    const command = this.undoStack.pop();
    if (!command) return null;
    await command.revert(this.db);
    this.redoStack.push(command);
    await this.log('undo', command.label, command.entities);
    await this.onChange();
    return command.label;
  }

  async redo(): Promise<string | null> {
    const command = this.redoStack.pop();
    if (!command) return null;
    await command.apply(this.db);
    this.undoStack.push(command);
    await this.log('redo', command.label, command.entities);
    await this.onChange();
    return command.label;
  }

  private async log(
    action: 'do' | 'undo' | 'redo',
    label: string,
    entities?: string[],
  ): Promise<void> {
    await this.db.add('audit', {
      at: Date.now(),
      action,
      label,
      ...(entities && entities.length > 0 ? { entities } : {}),
    });
    const excess = (await this.db.count('audit')) - AUDIT_LIMIT;
    if (excess > 0) {
      const keys = await this.db.getAllKeys('audit', undefined, excess);
      for (const key of keys) await this.db.delete('audit', key);
    }
  }
}

/** Permanently removes trash older than `days`. Returns how many entries were removed. */
export async function purgeTrash(
  db: Db,
  now: number = Date.now(),
  days: number = TRASH_DAYS,
): Promise<number> {
  const cutoff = now - days * 86_400_000;
  const old = await db.getAllFromIndex('trash', 'by-deleted', IDBKeyRange.upperBound(cutoff));
  for (const item of old) {
    await db.delete('trash', item.id);
    await db.delete('receipts', item.id);
  }
  return old.length;
}
