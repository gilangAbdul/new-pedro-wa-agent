import fs from "fs";
import path from "path";

export function isEmployeeNumber(phone: string): boolean {
  try {
    const filePath = path.join(process.cwd(), "data", "jadwal_piket.csv");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split(/\r?\n/);
    const cleanPhone = phone.replace(/\D/g, "");

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const separator = line.includes(";") ? ";" : ",";
      const values = line.split(separator);
      const noWa = values[3]?.trim().replace(/\D/g, "");
      if (noWa && noWa === cleanPhone) return true;
    }
    return false;
  } catch (error) {
    console.error("Gagal cek data pegawai:", error);
    return false;
  }
}