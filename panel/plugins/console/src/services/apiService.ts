import { reportErrorMsg } from "@/tools/validator";
import type { AxiosRequestConfig } from "axios";
import axios from "axios";
import _ from "lodash";

axios.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";
let authToken: string | undefined;

export interface ApiConnectionReporter {
  requestStarted(): void;
  requestSucceeded(): void;
  requestFailed(error: unknown): void;
}

let connectionReporter: ApiConnectionReporter | undefined;

export function setApiConnectionReporter(reporter?: ApiConnectionReporter) {
  connectionReporter = reporter;
}

export function setAuthToken(token?: string) {
  if (authToken !== token) apiService.clearCache();
  authToken = token;
}

axios.interceptors.request.use((config) => {
  if (authToken) config.headers.set("Authorization", `Bearer ${authToken}`);
  else config.headers.delete("Authorization");
  return config;
});

export interface RequestConfig extends AxiosRequestConfig {
  forceRequest?: boolean;
  errorAlert?: boolean;
}

interface PacketProtocol<T> {
  data: T;
  status: number;
  time: number;
}

class ApiService {
  private readonly responses = new Map<string, { expiresAt: number; data: unknown }>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private generation = 0;

  public clearCache() {
    this.generation++;
    this.responses.clear();
    this.pending.clear();
  }

  public async subscribe<T>(options: RequestConfig): Promise<T | undefined> {
    if (!options.url) throw new Error("ApiService: RequestConfig: 'url' is empty!");
    const config = { ...options, method: (options.method || "GET").toUpperCase() };
    if (config.url?.startsWith("/")) config.url = "." + config.url;
    config.timeout ??= 30_000;

    const isRead = config.method === "GET" || config.method === "HEAD";
    // Mutations must always reach the server. Invalidate both before and after
    // them so an older read cannot repopulate the cache while a write is running.
    if (!isRead || config.forceRequest) this.clearCache();
    const cacheable = isRead && !config.forceRequest && !config.signal;
    const generation = this.generation;
    const key = cacheable
      ? JSON.stringify([
          config.method,
          config.baseURL,
          config.url,
          config.params,
          config.data,
          config.headers,
          config.responseType,
          config.withCredentials,
          config.timeout
        ])
      : "";

    try {
      if (cacheable) {
        for (const [id, response] of this.responses) {
          if (response.expiresAt <= Date.now()) this.responses.delete(id);
        }
        const cached = this.responses.get(key);
        if (cached) return _.cloneDeep(cached.data) as T;
        const pending = this.pending.get(key);
        if (pending) return _.cloneDeep(await pending) as T;
      }

      const request = this.sendRequest<T>(config);
      if (cacheable) this.pending.set(key, request);
      try {
        const data = await request;
        if (cacheable && generation === this.generation) {
          this.responses.set(key, { expiresAt: Date.now() + 2000, data });
        }
        return _.cloneDeep(data);
      } finally {
        if (this.pending.get(key) === request) this.pending.delete(key);
        if (!isRead || config.forceRequest) this.clearCache();
      }
    } catch (cause: any) {
      const protocol = cause?.response?.data as PacketProtocol<unknown> | undefined;
      const error =
        protocol?.data && protocol.status !== 200
          ? new Error(String(protocol.data))
          : cause instanceof Error
          ? cause
          : new Error(String(cause));
      if (config.errorAlert) reportErrorMsg(error.message);
      throw error;
    }
  }

  private async sendRequest<T>(config: RequestConfig): Promise<T | undefined> {
    connectionReporter?.requestStarted();
    try {
      const { data } = await axios<PacketProtocol<T>>(config);
      connectionReporter?.requestSucceeded();
      return data?.data;
    } catch (error) {
      connectionReporter?.requestFailed(error);
      throw error;
    }
  }
}

export const apiService = new ApiService();
