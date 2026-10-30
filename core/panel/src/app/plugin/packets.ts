export interface IPacket {
  uuid: string;
  status: number;
  event: string;
  data: any;
}

export interface IRequestPacket {
  uuid: string;
  data: any;
}

export interface IUser {
  uuid?: string;
  userName?: string;
  passWord?: string;
  salt?: string;
  permission?: number;
  registerTime?: string;
  loginTime?: string;
  instances?: Array<any>;
  isInit?: boolean;
  passWordType?: number;
  secret?: string;
  open2FA?: boolean;
  ssoSub?: string;
  ssoBound?: boolean;
}

export interface ICompleteUser {
  uuid: string;
  userName: string;
  permission: number;
  instances: Array<any>;
  registerTime: string;
  loginTime: string;
}

export type RemoteMappingEntry = {
  from: {
    ip: string;
    port: number;
    prefix: string;
  };
  to: {
    ip: string;
    port: number;
    prefix: string;
  };
};

export interface IRemoteService {
  uuid?: string;
  ip?: string;
  port?: number;
  prefix?: string;
  remarks?: string;
  apiKey?: string;
  remoteMappings?: RemoteMappingEntry[];
  brand?: string;
}
