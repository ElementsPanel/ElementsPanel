export interface TableColumn extends Record<string, any> {
  key?: string;
  align?: "start" | "center" | "end" | string;
}
