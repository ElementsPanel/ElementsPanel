export interface DockerBuildProgress {
  status: number;
  percentage?: number;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}

/** Docker reports download and extraction byte counters separately for each layer. */
export class DockerBuildTracker {
  private layers = new Map<string, { current: number; total: number; done: boolean }>();
  private status = 1;
  private error?: string;

  update(event: { id?: unknown; status?: unknown; progressDetail?: { current?: unknown; total?: unknown } }) {
    if (this.status !== 1 || typeof event.id !== "string" || typeof event.status !== "string") return;
    if (!["Pulling fs layer", "Waiting", "Downloading", "Download complete", "Extracting", "Pull complete", "Already exists"].includes(event.status)) return;
    const layer = this.layers.get(event.id) ?? { current: 0, total: 0, done: false };
    if (event.status === "Downloading") {
      const current = event.progressDetail?.current;
      const total = event.progressDetail?.total;
      if (typeof total === "number" && Number.isFinite(total) && total > 0) layer.total = total;
      if (typeof current === "number" && Number.isFinite(current) && current >= 0)
        layer.current = layer.total > 0 ? Math.min(current, layer.total) : current;
    }
    if (["Download complete", "Extracting", "Pull complete", "Already exists"].includes(event.status)) {
      layer.done = true;
      if (layer.total > 0) layer.current = layer.total;
    }
    this.layers.set(event.id, layer);
  }

  finish(error?: unknown) {
    this.status = error === undefined ? 2 : -1;
    if (error !== undefined) this.error = String(error instanceof Error ? error.message : error).slice(0, 2000);
  }

  snapshot(): DockerBuildProgress {
    let downloadedBytes = 0;
    let totalBytes = 0;
    let unknown = false;
    for (const layer of this.layers.values()) {
      if (layer.total > 0) {
        downloadedBytes += layer.current;
        totalBytes += layer.total;
      } else if (!layer.done) unknown = true;
    }
    return {
      status: this.status,
      // Downloading is only part of a build. Reserve 100% for a successful build;
      // extraction and Dockerfile RUN steps have no trustworthy total byte count.
      percentage: this.status === 2 ? 100 : !unknown && totalBytes > 0
        ? Math.min(99, Math.floor(downloadedBytes / totalBytes * 100)) : undefined,
      downloadedBytes,
      totalBytes,
      ...(this.error ? { error: this.error } : {})
    };
  }
}
