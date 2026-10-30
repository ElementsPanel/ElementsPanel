interface IMission {
  name: string;
  parameter: any;
  start: number;
  end: number;
  count?: number;
  isDeleted?: boolean;
}

// Task passport manager
class MissionPassport {
  // temporary task passport list
  public readonly missions = new Map<string, IMission>();
  private cleanupTimer?: NodeJS.Timeout;

  private startCleanup() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const t = Date.now();
      this.missions.forEach((m, k) => {
        if (t >= m.end || m.isDeleted) this.missions.delete(k);
      });
    }, 1000 * 60);
    this.cleanupTimer.unref();
  }

  dispose() {
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
    this.missions.clear();
  }

  // register task passport
  public registerMission(password: string, mission: IMission) {
    this.startCleanup();
    if (this.missions.has(password))
      throw new Error("Duplicate primary key, failed to create task");
    this.missions.set(password, mission);
  }

  // Get the task based on the passport and task name
  public getMission(password: string, missionName: string) {
    const m = this.missions.get(password);
    if (!m) return null;
    const now = Date.now();
    if (m.isDeleted || !Number.isFinite(m.end) || now >= m.end) {
      this.missions.delete(password);
      return null;
    }
    return m.name === missionName && now >= m.start ? m : null;
  }

  public deleteMission(password: string) {
    this.missions.delete(password);
  }
}

const missionPassport = new MissionPassport();

export { missionPassport, IMission };
