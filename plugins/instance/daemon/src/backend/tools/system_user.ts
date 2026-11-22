import { promisify } from "util";
import { exec } from "child_process";
import Instance from "../entity/instance/instance";

const execAsync = promisify(exec);

export async function getLinuxSystemId(username: string): Promise<{ uid: number; gid: number }> {
  if (!username || typeof username !== "string" || username.trim() === "") {
    throw new Error('"Run As User" Error: Username must be a non-empty string');
  }

  // Restrict usernames before passing them to system commands.
  const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, "");
  if (sanitizedUsername !== username) {
    throw new Error('"Run As User" Error: Username contains unsafe characters');
  }

  try {
    const [uidResult, gidResult] = await Promise.all([
      execAsync(`id -u ${sanitizedUsername}`, { timeout: 5000 }),
      execAsync(`id -g ${sanitizedUsername}`, { timeout: 5000 })
    ]);

    if (uidResult.stderr || gidResult.stderr) {
      throw new Error(`Command error: ${uidResult.stderr || gidResult.stderr}`);
    }

    const uid = parseInt(uidResult.stdout.trim());
    const gid = parseInt(gidResult.stdout.trim());

    if (isNaN(uid) || isNaN(gid)) {
      throw new Error("Failed to parse UID or GID: Invalid output from id command");
    }

    return { uid, gid };
  } catch (error: any) {
    throw new Error(`Unable to retrieve UID/GID for user "${sanitizedUsername}": ${error.message}`);
  }
}

export async function getRunAsUserParams(instance: Instance) {
  let uid: number | undefined = undefined;
  let gid: number | undefined = undefined;
  let isEnableRunAs = false;
  const name = instance.config.runAs;
  if (name && String(name).trim() && process.platform !== "win32") {
    const result = await getLinuxSystemId(name);
    uid = result.uid;
    gid = result.gid;
    // Leave instance-file ownership unchanged to avoid disrupting user-managed permissions.
    isEnableRunAs = true;
  }
  return { uid, gid, isEnableRunAs, runAsName: name };
}
