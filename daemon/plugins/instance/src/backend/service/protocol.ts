import { protocol } from "../runtime";

export const ROLE = protocol().ROLE;
export type ROLE = number;
export const response = (...args: any[]) => (protocol().response as any)(...args);
export const responseError = (...args: any[]) => (protocol().responseError as any)(...args);
export const error = (...args: any[]) => (protocol().error as any)(...args);
export const msg = (...args: any[]) => (protocol().msg as any)(...args);
