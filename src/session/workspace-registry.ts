/**
 * Workspace Registry ÔÇöÔÇö µîüõ╣àÕîûþÜäÕÀÑõ¢£Õî║µ│¿ÕåîÞí¿
 *
 * [022] Õå│þ¡û 9.5´╝ÜÕìçþ║ºõ©║ SQLite µîüõ╣àÕîûµ│¿ÕåîÞí¿´╝êÕÄƒÕàêµÿ»"õ╗Ä session.projectDir Õè¿µÇüÞüÜÕÉê"´╝ë
 * [022] Õå│þ¡û 9.6´╝ÜattachSession Õ«îµò┤Õ»╣Ú¢É DSH õ║öÚüôµáíÚ¬î´╝êentity.ts:109-149´╝ë
 *
 * Þ»ªÞºü docs/requirements/022-dsh-plugin-compat.md C4-D + docs/dsh-compat-decisions.md þ¼¼õ╣Øþ½á
 *
 * õ©║õ╗Çõ╣êÚ£ÇÞªüµîüõ╣àÕîû´╝Ü
 *   - µùºÕ«×þÄ░µ»Åµ¼í list() þÄ░µë½ session.projectDir ÕÄ╗Úçì´╝îÕ»╝Þç┤"þ®║ÕÀÑõ¢£Õî║´╝êµùá session´╝ë"õ©ìÕç║þÄ░
 *   - dsh-tasks Úàìþ¢« workspaceId ÕÉÄ´╝îget() µë¥õ©ìÕê░ ÔåÆ throw "workspace not found"
 *   - DSH þÜä WorkspaceId µÿ» uuid´╝îõ©Ä path Õêåþª╗´╝êpath õ╝ÜÞó½ realpath ÚçìÕåÖ´╝îid Õ┐àÚí╗þ¿│Õ«Ü´╝ë
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/** [022] ÕÀÑõ¢£Õî║Õ»╣Þ▒í´╝êÕ»╣Ú¢É DSH workspace/src/types.ts:63-129 þÜäþ▓¥þ«Çþëê´╝ë */
export interface Workspace {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sessionIds: readonly string[];
  /** [022] Õå│þ¡û 9.6´╝Üõ║öÚüôµáíÚ¬îÕÉÄÕëìµÅÆÕê░ sessionIds */
  attachSession(sessionId: string): Promise<void>;
}

/** [022] ÕÅ¬Õ«×þÄ░ dsh-tasks þö¿Õê░þÜäµû╣µ│ò´╝êcreate/get/list/resolveByPath´╝ë */
export interface WorkspaceRegistry {
  create(path: string, title?: string): Promise<Workspace>;
  get(id: string): Workspace | undefined;
  list(): Workspace[];
  resolveByPath(path: string): Workspace | undefined;
}

interface SessionRow {
  project_dir: string | null;
}

const TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    session_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

async function realpathNormalize(p: string): Promise<string> {
  return fs.promises.realpath(p);
}

function titleFromPath(p: string): string {
  const seg = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  return seg || p;
}

/**
 * ÕêøÕ╗║õ©Çõ©¬ workspace µ│¿ÕåîÞí¿Õ«×õ¥ïÒÇé
 * @param db ÕÀ▓µ£ëþÜä SQLite Þ┐×µÄÑ´╝êþöƒõ║º´╝ÜÕ║öþö¿ÕÉ»Õè¿µùÂ initDatabase´╝øµÁïÞ»ò´╝Ü:memory:´╝ë
 */
export function createWorkspaceRegistry(db: DatabaseSync): WorkspaceRegistry {
  db.exec(TABLE_DDL);

  function rowToWorkspace(row: any): Workspace {
    const self: Workspace = {
      id: row.id,
      path: row.path,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      get sessionIds(): readonly string[] {
        const r = db.prepare('SELECT session_ids FROM workspaces WHERE id = ?').get(row.id) as any;
        return r ? JSON.parse(r.session_ids) : [];
      },
      async attachSession(sessionId: string): Promise<void> {
        // [022] Õå│þ¡û 9.6 þ¼¼õ©ÇÚüô´╝ÜÕ╣éþ¡ëÔÇöÔÇöÕÀ▓µîéÞ┐çÕêÖÞÀ│Þ┐çµáíÚ¬îÒÇüõ©ìÚçìÕñìÕåÖÕàÑ
        const cur = db.prepare('SELECT session_ids FROM workspaces WHERE id = ?').get(self.id) as any;
        const ids: string[] = cur ? JSON.parse(cur.session_ids) : [];
        if (ids.includes(sessionId)) return;

        // Þ»╗ session þÜä project_dir õ¢£õ©║ cwd
        const sess = db.prepare('SELECT project_dir FROM sessions WHERE logic_id = ?').get(sessionId) as SessionRow | undefined;
        if (!sess || !sess.project_dir) {
          throw new Error(
            'cannot attach session ' + sessionId + ' to workspace ' + self.path
            + ': its stored header carries no cwd to validate against'
          );
        }

        // [022] Õå│þ¡û 9.6 þ¼¼õ║îÚüô´╝Ücwd ÕÅ»Þºúµ×É´╝êrealpath´╝ë
        let cwd: string;
        try {
          cwd = await realpathNormalize(sess.project_dir);
        } catch (error) {
          throw new Error(
            'cannot attach session ' + sessionId + ' to workspace ' + self.path
            + ': its cwd ' + sess.project_dir + ' does not resolve, so it cannot be validated'
          );
        }

        // [022] Õå│þ¡û 9.6 þ¼¼õ©ëÚüô´╝Ücwd µÿ»þø«Õ¢ò
        let isDir = false;
        try { isDir = (await fs.promises.stat(cwd)).isDirectory(); } catch (_) { /* ignore */ }
        if (!isDir) {
          throw new Error(
            'cannot attach session ' + sessionId + ' to workspace ' + self.path
            + ': its cwd ' + sess.project_dir + ' is not a directory'
          );
        }

        // [022] Õå│þ¡û 9.6 þ¼¼ÕøøÚüô´╝Ücwd õ©Ä workspace.path õ©ÇÞç┤
        if (cwd !== self.path) {
          throw new Error(
            'cannot attach session ' + sessionId + ' to workspace ' + self.path
            + ': its cwd resolves to ' + cwd
          );
        }

        // ÚÇÜÞ┐ç´╝ÜÕëìµÅÆ + µø┤µû░ updated_at
        const next = [sessionId, ...ids];
        const now = new Date().toISOString();
        db.prepare('UPDATE workspaces SET session_ids = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(next), now, self.id);
      },
    };
    return self;
  }

  return {
    async create(p: string, title?: string): Promise<Workspace> {
      if (!p || typeof p !== 'string') throw new Error('create: path required');
      const canonical = await realpathNormalize(p);

      const st = await fs.promises.stat(canonical);
      if (!st.isDirectory()) {
        throw new Error('cannot create a workspace at ' + canonical + ': path is not a directory');
      }

      // Õ╣éþ¡ë´╝ÜÕÉî path ÕÀ▓Õ¡ÿÕ£¿ÕêÖþø┤µÄÑÞ┐öÕø×
      const existing = db.prepare('SELECT * FROM workspaces WHERE path = ?').get(canonical) as any;
      if (existing) return rowToWorkspace(existing);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const finalTitle = title && title.trim() ? title.trim() : titleFromPath(canonical);
      db.prepare(
        'INSERT INTO workspaces (id, path, title, session_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, canonical, finalTitle, '[]', now, now);

      return rowToWorkspace({
        id, path: canonical, title: finalTitle,
        session_ids: '[]', created_at: now, updated_at: now,
      });
    },

    get(id: string): Workspace | undefined {
      if (!id) return undefined;
      const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as any;
      return row ? rowToWorkspace(row) : undefined;
    },

    list(): Workspace[] {
      const rows = db.prepare('SELECT * FROM workspaces ORDER BY created_at ASC').all() as any[];
      return rows.map(rowToWorkspace);
    },

    resolveByPath(p: string): Workspace | undefined {
      if (!p) return undefined;
      const row = db.prepare('SELECT * FROM workspaces WHERE path = ?').get(p) as any;
      return row ? rowToWorkspace(row) : undefined;
    },
  };
}
