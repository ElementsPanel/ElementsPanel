import { h } from "vue";

export function getLoadingIcon(fontSize = 24) {
  const icon = h("i", {
    class: "mdi mdi-loading mdi-spin",
    style: { fontSize: `${fontSize}px` }
  });
  return icon;
}
