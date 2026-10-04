import { DatabaseSync } from 'node:sqlite';
import type { Profile } from '@amma/schema';
import type { Conversation } from '@amma/channel-text';

/** Everything the server keeps about one phone number. No message text and no audio is stored. */
export interface User {
  /** The channel address, for example `whatsapp:+91…` or `+221…`. */
  address: string;
  lang?: string;
  consented: boolean;
  profile?: Profile;
  conversation?: Conversation;
}

export interface Store {
  get(address: string): User | undefined;
  put(user: User): void;
  /** Remove everything held for this address. */
  forget(address: string): void;
  /** True the first time a message id is seen, false on a repeat delivery. */
  firstTime(messageId: string): boolean;
  /** Delete users not heard from since `before` (ISO date-time). Returns how many were removed. */
  expire(before: string): number;
}

/** SQLite through Node's built-in driver. One file, no service to run. */
export class SqliteStore implements Store {
  private db: DatabaseSync;
  constructor(path: string, private now: () => string = () => new Date().toISOString()) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (address TEXT PRIMARY KEY, data TEXT NOT NULL, seen TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, seen TEXT NOT NULL);
    `);
  }
  get(address: string): User | undefined {
    const row = this.db.prepare('SELECT data FROM users WHERE address = ?').get(address) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as User) : undefined;
  }
  put(user: User): void {
    this.db
      .prepare('INSERT INTO users (address, data, seen) VALUES (?, ?, ?) ON CONFLICT(address) DO UPDATE SET data = excluded.data, seen = excluded.seen')
      .run(user.address, JSON.stringify(user), this.now());
  }
  forget(address: string): void {
    this.db.prepare('DELETE FROM users WHERE address = ?').run(address);
  }
  firstTime(messageId: string): boolean {
    const r = this.db.prepare('INSERT OR IGNORE INTO messages (id, seen) VALUES (?, ?)').run(messageId, this.now());
    return r.changes === 1;
  }
  expire(before: string): number {
    this.db.prepare('DELETE FROM messages WHERE seen < ?').run(before);
    return Number(this.db.prepare('DELETE FROM users WHERE seen < ?').run(before).changes);
  }
}
