import bcrypt from "bcryptjs";
import { Mutex } from "async-mutex";
import { randomInt } from "crypto";
import { LocalFileSource, QueryWrapper } from "mcsmanager-common";
import md5 from "md5";
import { authenticator } from "otplib";
import { v4 } from "uuid";
import { IUserApp, IUserCredentials, IUserInfo, User, UserPassWordType } from "../entity/user";
import { $t, logger, ROLE, storage } from "../runtime";

export class TwoFactorError extends Error {}

const PASSWORD_GROUPS = [
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789"
];
const PASSWORD_CHARACTERS = PASSWORD_GROUPS.join("");

function randomCharacter(characters: string): string {
  return characters[randomInt(characters.length)];
}

function generateDefaultPassword(): string {
  const characters = [
    ...PASSWORD_GROUPS.map(randomCharacter),
    ...Array.from({ length: 7 }, () => randomCharacter(PASSWORD_CHARACTERS))
  ];

  for (let index = characters.length - 1; index > 0; index--) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

class UserSubsystem {
  public readonly objects: Map<string, User> = new Map();
  private readonly mutationLock = new Mutex();

  async initialize() {
    this.objects.clear();
    for (const uuid of await storage().getStorage().list("User")) {
      const user = (await storage().getStorage().load("User", User, uuid)) as User;
      this.objects.set(uuid, user);
    }
    if (this.objects.size === 0) {
      const passWord = generateDefaultPassword();
      await this.create({
        userName: "epanel",
        passWord,
        permission: ROLE().ADMIN
      });
      logger().info(
        $t("TXT_CODE_systemUser.defaultAccount", {
          userName: "epanel",
          password: passWord
        })
      );
    }
    logger().info($t("TXT_CODE_systemUser.userCount", { n: this.objects.size }));
  }

  async create(config: IUserInfo): Promise<User> {
    if (!config.userName || this.existUserName(config.userName))
      throw new Error($t("TXT_CODE_router.user.existsUserName"));
    const newUuid = v4().replace(/-/gim, "");
    // Initialize necessary user data
    const instance = new User();
    instance.uuid = newUuid;
    instance.userName = config.userName;
    instance.registerTime = new Date().toLocaleString();
    // add to the user system
    this.setInstance(newUuid, instance);
    try {
      await this.edit(instance.uuid, config);
      return this.getInstance(newUuid)!;
    } catch (error) {
      this.objects.delete(newUuid);
      throw error;
    }
  }

  // Update user detail
  async edit(uuid: string, config: any) {
    return this.mutationLock.runExclusive(() => this.update(uuid, config));
  }

  private async update(uuid: string, config: any) {
    const current = this.getInstance(uuid);
    if (!current) throw new Error("User not found");
    const instance = Object.assign(new User(), current);
    if (config.userName != null) {
      if (typeof config.userName !== "string" || !config.userName.trim())
        throw new Error("Invalid username");
      const existing = this.getUserByUserName(config.userName);
      if (existing && existing.uuid !== uuid)
        throw new Error($t("TXT_CODE_router.user.existsUserName"));
    }
    if (config.permission != null && ![-1, 0, 1, 10].includes(config.permission))
      throw new Error("Invalid user permission");
    if (config.passWord != null && typeof config.passWord !== "string")
      throw new Error($t("TXT_CODE_router.user.passwordCheck"));
    if (config.instances != null) instance.instances = this.normalizeInstances(config.instances);
    if (config.userName != null) instance.userName = config.userName;
    if (config.isInit != null) instance.isInit = Boolean(config.isInit);
    if (config.permission != null) instance.permission = config.permission;
    if (config.registerTime) instance.registerTime = config.registerTime;
    if (config.loginTime) instance.loginTime = config.loginTime;
    if (config.apiKey != null) instance.apiKey = config.apiKey;
    if (config.secret != null) instance.secret = String(config.secret);
    if (config.open2FA != null) instance.open2FA = Boolean(config.open2FA);
    if (config.ssoSub != null) instance.ssoSub = String(config.ssoSub);
    if (config.ssoBound != null) instance.ssoBound = Boolean(config.ssoBound);
    if (config.passWord) {
      instance.passWordType = UserPassWordType.bcrypt;
      instance.passWord = bcrypt.hashSync(config.passWord, 10);
    }
    await storage().getStorage().store("User", uuid, instance);
    this.objects.set(uuid, instance);
  }

  validatePassword(password = "") {
    if (typeof password !== "string" || password.length < 9 || password.length > 36) return false;
    const reg = /(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/;
    return reg.test(password);
  }

  check2FA(code: string, user: IUserCredentials, totpDriftToleranceSteps: number = 0) {
    if (!user.secret)
      throw new Error("Please contact the administrator to reset the account password");
    const verifier = authenticator.clone();
    verifier.options = { window: totpDriftToleranceSteps };
    const delta = verifier.checkDelta(code, user.secret);
    return delta != null;
  }

  checkUser(info: IUserCredentials, code2FA?: string, totpDriftToleranceSteps: number = 0) {
    const inputPassword = info.passWord || "";
    const user = this.getUserByUserName(info.userName || "");
    if (!user || user.permission < ROLE().USER || typeof inputPassword !== "string")
      throw new Error($t("TXT_CODE_fefbb457"));
    const passwordMatches = user.passWordType === UserPassWordType.bcrypt
      ? bcrypt.compareSync(inputPassword, user.passWord)
      : md5(inputPassword) === user.passWord;
    if (!passwordMatches) throw new Error($t("TXT_CODE_fefbb457"));
    if (user.open2FA && (!user.secret || !this.check2FA(code2FA || "", user, totpDriftToleranceSteps)))
      throw new TwoFactorError($t("TXT_CODE_3d68e43b"));
  }

  existUserName(userName: string): boolean {
    return this.getUserByUserName(userName) !== null;
  }

  private normalizeInstances(instanceIds: IUserApp[]) {
    if (!Array.isArray(instanceIds)) throw new Error("Invalid user instances");
    instanceIds.forEach((value) => {
      if (!value || typeof value.daemonId !== "string" || !value.daemonId ||
          typeof value.instanceUuid !== "string" || !value.instanceUuid)
        throw new Error("Type error, The instances of user must be IUserHaveInstance array.");
    });
    return instanceIds.map(({ instanceUuid, daemonId }) => ({ instanceUuid, daemonId }));
  }

  async deleteUserInstances(uuid: string | null, instanceIds: IUserApp[], allUsers = false) {
    if (uuid && allUsers) {
      throw new Error("Type error, The uuid and allUsers cannot be true at the same time.");
    }
    const removed = this.normalizeInstances(instanceIds);
    await this.mutationLock.runExclusive(async () => {
      const users = allUsers ? Array.from(this.objects.values()) : [this.getInstance(uuid!)];
      for (const user of users) {
        if (!user) continue;
        const instances = user.instances.filter((value) => !removed.some((instance) =>
          instance.daemonId === value.daemonId && instance.instanceUuid === value.instanceUuid
        ));
        if (instances.length !== user.instances.length) {
          await this.update(user.uuid, { instances });
        }
      }
    });
  }

  getUserByUserName(userName: string) {
    for (const map of this.objects) {
      const user = map[1];
      if (user.userName === userName) return user;
    }
    return null;
  }

  getUserByUuid(uuid: string) {
    return this.objects.get(uuid) || null;
  }

  getInstance(uuid: string) {
    return this.objects.get(uuid);
  }

  setInstance(uuid: string, object: User) {
    this.objects.set(uuid, object);
  }

  hasInstance(uuid: string) {
    return this.objects.has(uuid);
  }

  async deleteInstance(uuid: string) {
    await this.mutationLock.runExclusive(async () => {
      if (this.hasInstance(uuid)) {
        await storage().getStorage().delete("User", uuid);
        this.objects.delete(uuid);
      }
    });
  }

  getUserBySsoSub(ssoSub: string): User | null {
    for (const [, user] of this.objects) {
      if (user.ssoSub && user.ssoSub === ssoSub) return user;
    }
    return null;
  }

  async unbindSso(uuid: string) {
    await this.edit(uuid, { ssoSub: "", ssoBound: false });
  }

  async unbindAllSso(): Promise<number> {
    let count = 0;
    for (const [uuid, user] of this.objects) {
      if (user.ssoBound || user.ssoSub) {
        await this.unbindSso(uuid);
        count++;
      }
    }
    return count;
  }

  async bindSso(uuid: string, ssoSub: string) {
    await this.mutationLock.runExclusive(async () => {
      const instance = this.getInstance(uuid);
      if (!instance) throw new Error("User not found");
      const existing = this.getUserBySsoSub(ssoSub);
      if (!ssoSub || (existing && existing.uuid !== uuid) || instance.ssoBound)
        throw new Error("SSO account is already bound");
      await this.update(uuid, { ssoSub, ssoBound: true });
    });
  }

  getQueryWrapper() {
    return new QueryWrapper(new LocalFileSource<User>(this.objects));
  }
}

export default new UserSubsystem();
