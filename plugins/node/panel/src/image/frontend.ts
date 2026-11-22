import type { PanelFrontendPluginContext } from "@elements-panel/sdk";
import { t } from "@elementspanel/epanel-plugin-i18n";
import ImageManager from "./index.vue";
import NewImage from "./NewImage.vue";
import type { registerNodeManagement } from "../management/frontend";

const ADMIN_PERMISSION = 10;

export function registerNodeImages(
  ctx: PanelFrontendPluginContext,
  nodeBreadcrumb: ReturnType<typeof registerNodeManagement>
) {
  ctx.routes.add({
    path: "/node/image",
    name: t("TXT_CODE_COMMON_MANAGE_IMAGES"),
    component: ImageManager,
    meta: {
      permission: ADMIN_PERMISSION,
      mainMenu: false,
      breadcrumbs: [nodeBreadcrumb]
    }
  });

  ctx.routes.add({
    path: "/node/image/new",
    name: t("TXT_CODE_COMMON_CREATE_IMAGE"),
    component: NewImage,
    meta: {
      permission: ADMIN_PERMISSION,
      mainMenu: false,
      breadcrumbs: [
        nodeBreadcrumb,
        {
          name: t("TXT_CODE_COMMON_MANAGE_IMAGES"),
          path: "/node/image",
          permission: ADMIN_PERMISSION
        }
      ]
    }
  });
}
