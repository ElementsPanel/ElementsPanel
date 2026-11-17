import { useMountComponent } from "@/hooks/useMountComponent";
import IframeModal from "./index.vue";

export interface IframeModalOptions {
  src: string;
  title?: string;
  width?: string | number;
  height?: string | number;
  closable?: boolean;
  maskClosable?: boolean;
}

export function openIframeModal(options: IframeModalOptions): Promise<any> {
  const { mount } = useMountComponent(options);
  const result = mount<any>(IframeModal);
  return result || Promise.resolve(null);
}

export function loadIframeModal(options: IframeModalOptions) {
  const { loadApp } = useMountComponent(options);
  return loadApp(IframeModal);
}
