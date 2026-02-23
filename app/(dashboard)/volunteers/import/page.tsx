"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizePhone } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";

interface ParsedRow {
  name: string;
  phone: string;
  email: string;
  gender: string;
  organization: string;
}

/** Parse a single CSV line respecting quoted fields (handles commas inside quotes). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

export default function BulkImportPage() {
  const supabase = createClient();
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  function handleParse() {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) {
      toast.error("Need at least a header row and one data row");
      return;
    }

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const nameIdx = headers.findIndex((h) => h.includes("name"));
    const phoneIdx = headers.findIndex((h) => h.includes("phone"));
    const emailIdx = headers.findIndex((h) => h.includes("email"));
    const genderIdx = headers.findIndex((h) => h.includes("gender"));
    const orgIdx = headers.findIndex(
      (h) => h.includes("org") || h.includes("school") || h.includes("company"),
    );

    if (nameIdx === -1 || phoneIdx === -1) {
      toast.error("CSV must have 'name' and 'phone' columns");
      return;
    }

    const rows: ParsedRow[] = [];
    let skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace(/\r$/, "");
      if (!line.trim()) { skipped++; continue; }
      const cols = parseCsvLine(line);
      if (!cols[nameIdx] || !cols[phoneIdx]) { skipped++; continue; }

      const genderRaw = genderIdx >= 0 ? cols[genderIdx]?.toLowerCase().trim() : "";
      let gender = "";
      if (genderRaw === "female" || genderRaw === "f") {
        gender = "female";
      } else if (genderRaw === "male" || genderRaw === "m") {
        gender = "male";
      }

      if (!gender) {
        toast.error(`Row ${i + 1} (${cols[nameIdx]}): missing or invalid gender. Use 'male'/'female' or 'm'/'f'.`);
        skipped++;
        continue;
      }

      rows.push({
        name: cols[nameIdx],
        phone: normalizePhone(cols[phoneIdx]),
        email: emailIdx >= 0 ? cols[emailIdx] || "" : "",
        gender,
        organization: orgIdx >= 0 ? cols[orgIdx] || "" : "",
      });
    }

    setParsed(rows);
    const msg = `Parsed ${rows.length} rows` + (skipped > 0 ? ` (${skipped} skipped)` : "");
    if (rows.length > 0) toast.success(msg);
    else toast.error("No valid rows found. Check your CSV format.");
  }

  async function handleImport() {
    setImporting(true);
    setErrors([]);
    let count = 0;
    const errs: string[] = [];

    for (const row of parsed) {
      const { error } = await supabase
        .from("volunteers")
        .upsert(
          {
            phone: row.phone,
            name: row.name.trim(),
            email: row.email || null,
            gender: row.gender as "male" | "female",
            organization: row.organization || null,
            source: "bulk_import" as const,
          },
          { onConflict: "phone" },
        );

      if (error) {
        errs.push(`${row.name} (${row.phone}): ${error.message}`);
      } else {
        count++;
      }
    }

    setImported(count);
    setErrors(errs);
    setImporting(false);
    toast.success(`Imported ${count} of ${parsed.length} volunteers`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 page-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Bulk Import Volunteers</h1>
        <p className="text-muted-foreground">
          Paste CSV data with columns: name, phone, email, gender, organization
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CSV Data</CardTitle>
          <CardDescription>
            First row must be headers. Minimum columns: name, phone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder={`name,phone,email,gender,organization\nAli Khan,03001234567,ali@email.com,male,ABC School\nFatima Ahmed,03219876543,fatima@email.com,female,XYZ College`}
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={handleParse} disabled={!csvText.trim()}>
              Parse CSV
            </Button>
            <Label className="flex items-center">
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    setCsvText(ev.target?.result as string);
                  };
                  reader.readAsText(file);
                }}
              />
              <Button variant="outline" asChild>
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload CSV
                </span>
              </Button>
            </Label>
          </div>
        </CardContent>
      </Card>

      {parsed.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Preview ({parsed.length} rows)</CardTitle>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Import All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Organization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.slice(0, 50).map((row, i) => (
                    <TableRow key={i} className="stagger-item">
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.phone}
                      </TableCell>
                      <TableCell>{row.email || "—"}</TableCell>
                      <TableCell>{row.gender}</TableCell>
                      <TableCell>{row.organization || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsed.length > 50 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Showing first 50 of {parsed.length} rows
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {imported > 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-green-600 font-medium">
              Successfully imported {imported} volunteers
            </p>
            {errors.length > 0 && (
              <div className="mt-2">
                <p className="text-destructive font-medium">
                  {errors.length} errors:
                </p>
                <ul className="mt-1 text-sm text-destructive">
                  {errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
