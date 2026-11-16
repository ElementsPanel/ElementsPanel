/**
 * Import host contracts as types to avoid bundling a second context.
 * Resolve shared services through apply(ctx). Cordis runtime imports share the host's
 * externalized instance.
 */
export type {
  PanelI18nService,
  PanelIdentityService,
  PanelKoaService,
  PanelMiddlewareService,
  PanelOverviewProvider,
  PanelOverviewService,
  PanelOperationLogger,
  PanelStorageService,
  PanelPluginContext,
  PanelPluginsService,
  PanelRemoteService,
  PanelSettingField,
  PanelSettingFieldType,
  PanelSettingOption,
  PanelSettingsDeclaration,
  PanelSettingsFormService,
  PanelSettingsSchema,
  PanelSettingsService
} from "./context";
export type {
  LoadedPanelPlugin,
  PanelFrontendPluginEntry,
  PanelPluginModule,
  PanelPluginRecord
} from "./loader";
