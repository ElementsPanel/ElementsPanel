export enum UserPassWordType {
  md5 = 0,
  bcrypt = 1
}

export interface IUserApp {
  instanceUuid: string;
  daemonId: string;
}

/** Loose shape accepted by the credential checks, which only read a few fields. */
export interface IUserCredentials {
  userName?: string;
  passWord?: string;
  secret?: string;
  open2FA?: boolean;
}

export interface IUserInfo {
  uuid?: string;
  userName?: string;
  passWord?: string;
  permission?: number;
  instances?: IUserApp[];
  secret?: string;
  open2FA?: boolean;
  [key: string]: unknown;
}

export class User {
  uuid: string = "";
  userName: string = "";
  passWord: string = "";
  passWordType: number = UserPassWordType.bcrypt;
  salt: string = "";
  permission: number = 0;
  registerTime: string = "";
  loginTime: string = "";
  instances: Array<IUserApp> = [];
  apiKey: string = "";
  isInit: boolean = false;
  secret = "";
  open2FA = false;
  ssoSub = "";
  ssoBound = false;
}
