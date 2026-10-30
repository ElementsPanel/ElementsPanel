import { Service, type Context } from "cordis";
import { shallowReactive } from "vue";
import type {
  FrontendConnectionService,
  FrontendConnectionState,
  FrontendConnectionStatus
} from "@/plugin/context";
import {
  apiService,
  setApiConnectionReporter,
  type ApiConnectionReporter
} from "./apiService";

const RETRY_CAPS = [500, 1000, 2000, 4000, 8000, 10_000] as const;

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function responseStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === "number" ? status : undefined;
}

/** Shared panel-connection generation and retry controller. */
export class ConnectionService
  extends Service
  implements FrontendConnectionService, ApiConnectionReporter
{
  readonly state = shallowReactive<FrontendConnectionState>({
    status: "connecting",
    networkAvailable: typeof navigator === "undefined" ? true : navigator.onLine,
    generation: 0,
    retryAttempt: 0,
    changedAt: Date.now()
  });

  private retryTimer?: ReturnType<typeof setTimeout>;
  private probeController?: AbortController;
  private running = false;

  constructor(ctx: Context) {
    super(ctx, "connection", true);
  }

  protected start() {
    this.running = true;
    setApiConnectionReporter(this);
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    if (this.state.networkAvailable) void this.probe();
    else this.transition("disconnected");
  }

  protected stop() {
    this.running = false;
    setApiConnectionReporter(undefined);
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    this.cancelRetry();
  }

  requestStarted() {
    if (!this.state.networkAvailable) return;
    if (this.state.status === "disconnected" || this.state.status === "degraded") {
      this.transition("connecting");
    }
  }

  requestSucceeded() {
    this.connected();
  }

  requestFailed(error: unknown) {
    const status = responseStatus(error);
    // Authentication and validation failures do not mean the transport is down.
    if (status !== undefined && status < 500) return;
    this.fail(status === undefined ? "disconnected" : "degraded", error);
  }

  reconnect() {
    if (!this.running || !this.state.networkAvailable) return;
    this.state.retryAttempt = 0;
    this.transition("connecting");
    this.cancelRetry();
    void this.probe();
  }

  private readonly onOnline = () => {
    this.state.networkAvailable = true;
    this.reconnect();
  };

  private readonly onOffline = () => {
    this.state.networkAvailable = false;
    this.cancelRetry();
    this.transition("disconnected", "Browser reports that the network is offline.");
  };

  private transition(status: FrontendConnectionStatus, lastError?: string) {
    if (this.state.status === status && this.state.lastError === lastError) return;
    this.state.status = status;
    this.state.lastError = lastError;
    this.state.changedAt = Date.now();
  }

  private connected(source?: AbortController) {
    const recovered = this.state.status !== "connected";
    this.clearRetryTimer();
    if (this.probeController && this.probeController !== source) {
      this.probeController.abort();
      this.probeController = undefined;
    }
    this.state.retryAttempt = 0;
    this.transition("connected");
    if (recovered) {
      this.state.generation += 1;
      apiService.clearCache();
    }
  }

  private fail(status: "degraded" | "disconnected", error: unknown) {
    if (!this.running) return;
    this.transition(status, describeError(error));
    this.scheduleRetry();
  }

  private scheduleRetry() {
    if (!this.running || !this.state.networkAvailable || this.retryTimer) return;
    const attempt = ++this.state.retryAttempt;
    const cap = RETRY_CAPS[Math.min(attempt - 1, RETRY_CAPS.length - 1)];
    const delay = cap / 2 + Math.random() * (cap / 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.probe();
    }, delay);
  }

  private cancelRetry() {
    this.clearRetryTimer();
    this.probeController?.abort();
    this.probeController = undefined;
  }

  private clearRetryTimer() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private async probe() {
    if (!this.running || !this.state.networkAvailable || this.probeController) return;
    const controller = (this.probeController = new AbortController());
    this.transition("connecting");
    try {
      const response = await fetch(new URL("api/auth/status", document.baseURI), {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        signal: controller.signal
      });
      if (response.status >= 500) {
        const error = new Error(`Panel health probe failed with HTTP ${response.status}`) as Error & {
          response?: { status: number };
        };
        error.response = { status: response.status };
        throw error;
      }
      this.connected(controller);
    } catch (error) {
      if (!controller.signal.aborted) this.requestFailed(error);
    } finally {
      if (this.probeController === controller) this.probeController = undefined;
    }
  }
}
