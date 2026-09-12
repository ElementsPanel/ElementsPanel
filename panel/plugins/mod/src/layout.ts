export function createModPageLayout(title: string): IPageLayoutConfig {
  return {
    page: "/instances/terminal/mods",
    items: [
      {
        id: "mod-manager",
        meta: {},
        type: "InstanceModManager",
        title,
        width: 12,
        height: "unset",
        disableDelete: true
      },
      {
        id: "mod-manager-spacer",
        meta: {},
        type: "EmptyCard",
        title: "",
        width: 12,
        height: "100px"
      }
    ]
  };
}
