import fs from "node:fs/promises";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "intakes.json");

async function readAll() {
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeAll(records) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(records, null, 2));
}

export async function saveIntake(record) {
  const records = await readAll();
  records[record.requestId] = {
    ...(records[record.requestId] || {}),
    ...record,
    updatedAt: new Date().toISOString()
  };
  await writeAll(records);
  return records[record.requestId];
}

export async function getIntake(requestId) {
  const records = await readAll();
  return records[requestId] || null;
}
