import RouterContext from "../entity/ctx";

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

  constructor() {
    // Set up to check the task expiration every hour
    setInterval(() => {
      const t = new Date().getTime();
      this.missions.forEach((m, k) => {
        if (t > m.end || m.isDeleted) this.missions.delete(k);
      });
    }, 1000 * 60);
  }

  // register task passport
  public registerMission(password: string, mission: IMission) {
    if (this.missions.has(password))
      throw new Error("Duplicate primary key, failed to create task");
    this.missions.set(password, mission);
  }

  // Get the task based on the passport and task name
  public getMission(password: string, missionName: string) {
    if (!this.missions.has(password)) return null;
    const m = this.missions.get(password);
    if (m?.name === missionName) return m;
    return null;
  }

  public deleteMission(password: string) {
    const m = this.missions.get(password);
    if (m) m.isDeleted = true;
  }
}

// The top-level login — the panel presenting the daemon key — belongs to
// `plugins/auth`, which owns its own session type and marks the session itself.
const LOGIN_FROM_STREAM = "STREAM";

function streamLoginSuccessful(ctx: RouterContext, instanceUuid: string) {
  ctx.session.id = ctx.socket.id;
  ctx.session.login = true;
  ctx.session.type = LOGIN_FROM_STREAM;
  ctx.session.stream = {
    check: true,
    instanceUuid
  };
  return ctx.session;
}

const missionPassport = new MissionPassport();

export { missionPassport, IMission, LOGIN_FROM_STREAM, streamLoginSuccessful };
