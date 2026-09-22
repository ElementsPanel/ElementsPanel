import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalogues } from "./i18n-catalogues.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = validateCatalogues(root);
console.log(
  `Validated ${result.files} language files in ${result.catalogues} independent catalogues.`
);
