import { t } from "@/lang/i18n";
import type { InstanceDeleteResult } from "../api";

export function getInstanceDeleteError(result: InstanceDeleteResult | undefined) {
  if (!result) return new Error(t("TXT_CODE_6a365d01"));
  if (!result.errors?.length) return undefined;
  return new Error(
    result.errors.map(({ instanceUuid, error }) => `${instanceUuid}: ${error}`).join("\n")
  );
}
