// Read-only export for the weekly backup on the PC (backup/backup.ps1).
// Returns every table of the app as JSON, plus one-hour links to download each stored file.
// Protected by BACKUP_SECRET; it never changes anything.
import { adminClient } from "../_shared/push.ts";

// Not exported: push_subscriptions (phone addresses) and shortcut_tokens (personal links).
const TABLES = ["households", "members", "groceries", "grocery_history", "chores", "events", "event_reminders",
  "dogs", "dog_meds", "dog_log", "med_reminders", "needs", "shopping_trips", "attachments"];

Deno.serve(async (req) => {
  const secret = Deno.env.get("BACKUP_SECRET");
  if (!secret || req.headers.get("x-backup-secret") !== secret) return new Response("forbidden", { status: 403 });

  const admin = adminClient();
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(t).select("*").range(from, from + 999);
      if (error) return new Response(`couldn't read ${t}: ${error.message}`, { status: 500 });
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    tables[t] = rows;
  }

  // Every stored file is either attached to a plan/shop or is a dog photo.
  const paths = [
    ...(tables.attachments as { path: string }[]).map((a) => a.path),
    ...(tables.dogs as { photo: string | null }[]).map((d) => d.photo).filter((p): p is string => !!p),
  ];
  const files: { path: string; url: string | null }[] = [];
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await admin.storage.from("files").createSignedUrls(paths.slice(i, i + 100), 3600);
    for (const x of data ?? []) files.push({ path: x.path ?? "", url: x.signedUrl ?? null });
  }

  return new Response(JSON.stringify({ app: "Home Together", exported_at: new Date().toISOString(), tables, files }), {
    headers: { "Content-Type": "application/json" },
  });
});
