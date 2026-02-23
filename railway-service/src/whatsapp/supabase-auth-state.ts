import { SupabaseClient } from "@supabase/supabase-js";
import { whatsappLogger } from "../lib/logger";

/**
 * Custom Baileys auth state provider that stores credentials and signal keys
 * in Supabase instead of the filesystem, so WhatsApp sessions survive
 * Railway redeployments.
 */
export async function useSupabaseAuthState(supabase: SupabaseClient) {
  const { initAuthCreds, BufferJSON, makeCacheableSignalKeyStore } =
    await import("baileys");
  const pino = (await import("pino")).default;

  // --- Load or initialize creds ---
  const { data: credsRow } = await supabase
    .from("whatsapp_auth_creds")
    .select("creds")
    .eq("id", "singleton")
    .single();

  let creds: any;
  if (credsRow?.creds) {
    creds = JSON.parse(JSON.stringify(credsRow.creds), BufferJSON.reviver);
    whatsappLogger.info("Loaded existing WhatsApp auth creds from Supabase");
  } else {
    creds = initAuthCreds();
    whatsappLogger.info("Initialized fresh WhatsApp auth creds");
  }

  // --- SignalKeyStore backed by Supabase ---
  const keys = {
    async get(type: string, ids: string[]): Promise<Record<string, any>> {
      const result: Record<string, any> = {};

      const { data: rows } = await supabase
        .from("whatsapp_auth_keys")
        .select("id, value")
        .eq("type", type)
        .in("id", ids);

      if (rows) {
        for (const row of rows) {
          result[row.id] = JSON.parse(
            JSON.stringify(row.value),
            BufferJSON.reviver,
          );
        }
      }
      return result;
    },

    async set(data: Record<string, Record<string, any> | undefined>): Promise<void> {
      const upserts: { type: string; id: string; value: any }[] = [];
      const deletes: { type: string; id: string }[] = [];

      for (const [type, entries] of Object.entries(data)) {
        if (!entries) continue;
        for (const [id, value] of Object.entries(entries)) {
          if (value === null || value === undefined) {
            deletes.push({ type, id });
          } else {
            upserts.push({
              type,
              id,
              value: JSON.parse(JSON.stringify(value, BufferJSON.replacer)),
            });
          }
        }
      }

      if (upserts.length) {
        await supabase
          .from("whatsapp_auth_keys")
          .upsert(upserts, { onConflict: "type,id" });
      }

      for (const del of deletes) {
        await supabase
          .from("whatsapp_auth_keys")
          .delete()
          .eq("type", del.type)
          .eq("id", del.id);
      }
    },
  };

  // --- saveCreds persists the creds blob ---
  const saveCreds = async () => {
    const serialized = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
    await supabase
      .from("whatsapp_auth_creds")
      .upsert(
        { id: "singleton", creds: serialized, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
  };

  // Wrap keys with in-memory cache to reduce Supabase round-trips
  // for high-frequency Signal protocol operations (encrypt/decrypt).
  const cachedKeys = makeCacheableSignalKeyStore(
    keys,
    pino({ level: "silent" }),
  );

  return { state: { creds, keys: cachedKeys }, saveCreds };
}

/** Clear all auth state from Supabase (used on disconnect) */
export async function clearSupabaseAuthState(supabase: SupabaseClient) {
  await supabase.from("whatsapp_auth_creds").delete().eq("id", "singleton");
  await supabase.from("whatsapp_auth_keys").delete().neq("type", "");
  whatsappLogger.info("Cleared WhatsApp auth state from Supabase");
}
