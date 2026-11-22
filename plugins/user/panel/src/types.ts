import type { UserInstance } from "@elementspanel/epanel-plugin-console/types/user";

export interface UserQuery {
  userName: string;
  page: number;
  page_size: number;
  role: string;
}

export interface AccessInstance extends UserInstance {
  remarks?: string;
  endTime?: number | string;
}
