import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { app } from 'electron';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Workspace } from '../shared/types';

export type { Workspace };

interface WorkspaceFile {
  workspaces: Workspace[];
  activeId: string;
}

const ACCENTS = ['#7c5cff', '#22d3ee', '#f472b6', '#4ade80', '#fbbf24', '#fb7185'];

/**
 * JSON-backed workspace store. Each workspace maps to its own persistent
 * session partition (persist:ws-<id>) for real cookie/storage isolation.
 * Emits 'change' whenever the set or the active workspace changes.
 */
export class WorkspaceStore extends EventEmitter {
  private file: string;
  private workspaces: Workspace[] = [];
  private activeId = '';

  constructor() {
    super();
    this.file = join(app.getPath('userData'), 'workspaces.json');
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, 'utf8')) as WorkspaceFile;
        this.workspaces = Array.isArray(raw.workspaces) ? raw.workspaces : [];
        this.activeId = raw.activeId ?? '';
      }
    } catch (err) {
      console.error('[verity] workspace load failed:', err);
    }
    if (this.workspaces.length === 0) {
      this.workspaces = [{ id: randomUUID(), name: 'Standard', accentColor: ACCENTS[0] }];
    }
    if (!this.workspaces.some((w) => w.id === this.activeId)) {
      this.activeId = this.workspaces[0].id;
    }
  }

  /** Partition name for a workspace's default (non-private) tabs. */
  static partitionFor(id: string): string {
    return `persist:ws-${id}`;
  }

  list(): Workspace[] {
    return this.workspaces;
  }

  active(): Workspace {
    return this.workspaces.find((w) => w.id === this.activeId) ?? this.workspaces[0];
  }

  setActive(id: string): void {
    if (!this.workspaces.some((w) => w.id === id) || id === this.activeId) return;
    this.activeId = id;
    this.persist();
    this.emit('change');
  }

  create(name?: string): Workspace {
    const ws: Workspace = {
      id: randomUUID(),
      name: name?.trim() || `Workspace ${this.workspaces.length + 1}`,
      accentColor: ACCENTS[this.workspaces.length % ACCENTS.length],
    };
    this.workspaces.push(ws);
    this.persist();
    this.emit('change');
    return ws;
  }

  rename(id: string, name: string): void {
    const ws = this.workspaces.find((w) => w.id === id);
    if (!ws || !name.trim()) return;
    ws.name = name.trim();
    this.persist();
    this.emit('change');
  }

  setAccent(id: string, accentColor: string): void {
    const ws = this.workspaces.find((w) => w.id === id);
    if (!ws) return;
    ws.accentColor = accentColor;
    this.persist();
    this.emit('change');
  }

  /** Removes a workspace (never the last one). Returns the new active id. */
  remove(id: string): string {
    if (this.workspaces.length <= 1) return this.activeId;
    this.workspaces = this.workspaces.filter((w) => w.id !== id);
    if (this.activeId === id) this.activeId = this.workspaces[0].id;
    this.persist();
    this.emit('change');
    return this.activeId;
  }

  reorder(orderedIds: string[]): void {
    const map = new Map(this.workspaces.map((w) => [w.id, w]));
    const next = orderedIds.map((id) => map.get(id)).filter((w): w is Workspace => !!w);
    if (next.length !== this.workspaces.length) return;
    this.workspaces = next;
    this.persist();
    this.emit('change');
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const data: WorkspaceFile = { workspaces: this.workspaces, activeId: this.activeId };
      writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('[verity] workspace save failed:', err);
    }
  }
}
