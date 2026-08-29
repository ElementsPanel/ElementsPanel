import { useMountComponent } from "@/hooks/useMountComponent";
import MarketDialog from "./components/MarketDialog.vue";

/** Options accepted by {@link openMarketDialog}. */
export interface OpenMarketDialogProps {
  daemonId?: string;
  instanceId?: string;
  autoInstall?: boolean;
  btnText?: string;
  dialogTitle?: string;
  showCustomBtn?: boolean;
  onlyDockerTemplate?: boolean;
}

/**
 * Mount the package picker and resolve with the chosen package, or `undefined`
 * when the user closes it. Registered as the `market.openMarketDialog` service
 * so the terminal and the Iframe bridge can reach it without importing the
 * plugin, and so both stop working cleanly once the plugin is unloaded.
 */
export async function openMarketDialog(
  daemonId?: string,
  instanceId?: string,
  options: OpenMarketDialogProps = {}
) {
  const dialog = useMountComponent({
    daemonId,
    instanceId,
    ...options
  }).load<InstanceType<typeof MarketDialog>>(MarketDialog);
  return dialog!.openDialog();
}
