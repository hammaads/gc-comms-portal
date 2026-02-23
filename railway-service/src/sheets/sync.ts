import { SupabaseClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { sheetsLogger } from "../lib/logger";

export class GoogleSheetsSync {
  private supabase: SupabaseClient;
  private sheets: any;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;

    // Initialize Google Sheets API client
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const credentials = JSON.parse(
        Buffer.from(
          process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
          "base64",
        ).toString(),
      );
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });
      this.sheets = google.sheets({ version: "v4", auth });
    }
  }

  async syncAll(): Promise<{ synced: number; errors: string[] }> {
    const { data: syncConfigs } = await this.supabase
      .from("google_sheets_sync")
      .select("*");

    if (!syncConfigs || syncConfigs.length === 0) {
      return { synced: 0, errors: [] };
    }

    let totalSynced = 0;
    const errors: string[] = [];

    for (const config of syncConfigs) {
      try {
        const result = await this.syncSheet(config);
        totalSynced += result;
      } catch (error: any) {
        errors.push(`Sheet ${config.sheet_id}: ${error.message}`);
        await this.supabase
          .from("google_sheets_sync")
          .update({
            sync_errors: { message: error.message, at: new Date().toISOString() },
          })
          .eq("id", config.id);
      }
    }

    return { synced: totalSynced, errors };
  }

  private async syncSheet(config: any): Promise<number> {
    if (!this.sheets) {
      throw new Error("Google Sheets API not configured");
    }

    const range = config.sheet_name
      ? `'${config.sheet_name}'`
      : "Sheet1";

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: config.sheet_id,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) return 0;

    const headers = rows[0].map((h: string) => h.toLowerCase().trim());
    const startRow = config.last_synced_row + 1; // Skip already synced rows
    const newRows = rows.slice(Math.max(startRow, 1)); // Skip header

    let synced = 0;

    for (let i = 0; i < newRows.length; i++) {
      const row = newRows[i];
      try {
        const data = this.parseRow(headers, row);
        if (!data.name || !data.phone) continue;

        // Insert volunteer
        const { data: volunteer } = await this.supabase
          .from("volunteers")
          .upsert(
            {
              phone: this.normalizePhone(data.phone),
              name: data.name.trim(),
              email: data.email || null,
              gender: data.gender || "male",
              organization: data.organization || null,
              source: "google_form",
            },
            { onConflict: "phone" },
          )
          .select("id")
          .single();

        if (!volunteer) continue;

        // Match drive dates and create availability
        if (data.dates && data.dates.length > 0) {
          for (const dateStr of data.dates) {
            const { data: drives } = await this.supabase
              .from("drives")
              .select("id")
              .eq("drive_date", dateStr);

            if (drives) {
              for (const drive of drives) {
                await this.supabase
                  .from("volunteer_availability")
                  .upsert(
                    {
                      volunteer_id: volunteer.id,
                      drive_id: drive.id,
                      source: "google_form",
                    },
                    { onConflict: "volunteer_id,drive_id" },
                  );
              }
            }
          }
        }

        synced++;
      } catch (error) {
        sheetsLogger.error({ err: error, row: startRow + i }, "Error processing sheet row");
      }
    }

    // Update sync state
    await this.supabase
      .from("google_sheets_sync")
      .update({
        last_synced_row: rows.length - 1,
        last_synced_at: new Date().toISOString(),
        sync_errors: null,
      })
      .eq("id", config.id);

    return synced;
  }

  private parseRow(
    headers: string[],
    row: string[],
  ): {
    name: string;
    phone: string;
    email: string;
    gender: string;
    organization: string;
    dates: string[];
  } {
    const get = (patterns: string[]) => {
      const idx = headers.findIndex((h) =>
        patterns.some((p) => h.includes(p)),
      );
      return idx >= 0 ? row[idx]?.trim() || "" : "";
    };

    const genderRaw = get(["gender"]).toLowerCase();
    let gender = "male";
    if (genderRaw.includes("female") || genderRaw === "f") {
      gender = "female";
    }

    // Extract dates from columns that look like dates
    const dates: string[] = [];
    headers.forEach((h, i) => {
      if (
        (h.includes("date") || h.includes("day") || h.includes("available")) &&
        row[i]
      ) {
        const dateMatch = row[i].match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) dates.push(dateMatch[0]);
      }
    });

    return {
      name: get(["name", "full name"]),
      phone: get(["phone", "mobile", "number", "contact"]),
      email: get(["email", "e-mail"]),
      gender,
      organization: get([
        "org",
        "school",
        "college",
        "university",
        "company",
        "institution",
      ]),
      dates,
    };
  }

  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-\(\)]/g, "");
    if (cleaned.startsWith("+")) return cleaned;
    if (cleaned.startsWith("00")) return "+" + cleaned.slice(2);
    if (cleaned.startsWith("92")) return "+" + cleaned;
    cleaned = cleaned.replace(/^0+/, "");
    return "+92" + cleaned;
  }
}
