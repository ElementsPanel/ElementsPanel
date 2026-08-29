import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { marketSettings } from "./market_settings";

// Where an uploaded catalogue lands, mirroring the panel core's upload path.
const SAVE_DIR_PATH = "public/upload_files/";

const MARKET_CACHE_FILE_PATH = path.normalize(
  path.join(process.cwd(), "data", "market_cache.json")
);

const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

/** Drop the cached catalogue, e.g. after the source address changes. */
export function clearMarketCache() {
  return fs.remove(MARKET_CACHE_FILE_PATH);
}

async function readLocalCatalogue(address: string): Promise<IQuickStartTemplate> {
  const filesDir = path.join(process.cwd(), SAVE_DIR_PATH);
  const fileName = address.split(SAVE_DIR_PATH)[1];
  const filePath = path.join(filesDir, fileName ?? "");
  // A catalogue uploaded through the editor is addressed by name only; refuse
  // anything that tries to climb out of the upload directory.
  if (!fileName || path.basename(fileName) !== fileName || !fs.existsSync(filePath)) {
    throw new Error("Request failed, status: 404");
  }
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as IQuickStartTemplate;
}

/**
 * The package catalogue, from an uploaded file or the remote source. Remote
 * responses are cached on disk so browsing the market does not hit the source
 * on every request.
 */
export async function getAppMarketList(): Promise<IQuickStartTemplate> {
  const address = marketSettings().presetPackAddr;
  if (!address) throw new Error("Market source address is empty!");

  if (address.startsWith(SAVE_DIR_PATH)) return readLocalCatalogue(address);

  try {
    const stats = await fs.stat(MARKET_CACHE_FILE_PATH);
    if (Date.now() - stats.mtime.getTime() < CACHE_DURATION) {
      return JSON.parse(
        await fs.readFile(MARKET_CACHE_FILE_PATH, "utf-8")
      ) as IQuickStartTemplate;
    }
  } catch (error) {
    // No usable cache; fall through and fetch.
  }

  const { data } = await axios<IQuickStartTemplate>({ url: address, method: "GET" });
  // A cache we cannot write is a slow market, not a broken one.
  fs.ensureDir(path.dirname(MARKET_CACHE_FILE_PATH))
    .then(() => fs.writeFile(MARKET_CACHE_FILE_PATH, JSON.stringify(data), "utf-8"))
    .catch(() => undefined);
  return data;
}
