import { usePluginService } from "@/plugin/context";
import type { FrontendMarketService } from "@/plugin";
import { openIframeModal } from "../IframeModal/useIframeModal";

export type IframeRouterHandler<T = any> = (
  // eslint-disable-next-line no-unused-vars
  data: T
) => Promise<any>;

export const iframeRouters: Record<string, IframeRouterHandler<any>> = {
  OpenNewIframePage: async (data: any) => {
    openIframeModal({
      src: data
    });
    return true;
  },
  OpenMarketDialog: async (data: any) => {
    // Provided by the `market` plugin; without it there is no market to open.
    const market = usePluginService<FrontendMarketService>("market");
    if (!market) throw new Error("The market plugin is not installed.");
    const res = await market.openMarketDialog(data?.daemonId, data?.instanceId, data?.options);
    if (!res) return res;
    return JSON.parse(JSON.stringify(res));
  }
};
