import { EventEmitter } from "events";
import { Service, type Context } from "cordis";
import { IGNORE } from "../../../../src/const";
import RouterContext from "../../../../src/entity/ctx";
import type { DaemonProtocolService } from "../../../../src/plugin";
import type { Socket } from "socket.io";

const STATUS_OK = 200;
const STATUS_ERR = 500;

export enum ROLE {
  ADMIN = 10,
  USER = 1,
  GUEST = 0,
  BAN = -1
}

export interface IPacket {
  uuid: string | null;
  status: number;
  event: string | null;
  data: any;
}

export interface IResponseErrorConfig {
  disablePrint: boolean;
}

type ProtocolLogger = {
  info(...args: any[]): unknown;
  warn(...args: any[]): unknown;
};

export class Packet implements IPacket {
  constructor(
    public uuid: string | null = null,
    public status = STATUS_OK,
    public event: string | null = null,
    public data: any = null
  ) {}
}

class RouterApp extends EventEmitter {
  readonly middlewares: Array<Function> = [];
  private reportError: (ctx: RouterContext, error: any) => void = () => {};

  setErrorHandler(handler: (ctx: RouterContext, error: any) => void) {
    this.reportError = handler;
  }

  emitRouter(event: string, ctx: RouterContext, data: any) {
    try {
      super.emit(event, ctx, data);
    } catch (error) {
      this.reportError(ctx, error);
    }
    return this;
  }

  use(handler: (event: string, ctx: RouterContext, data: any, next: Function) => void) {
    this.middlewares.push(handler);
  }

  unuse(handler: (event: string, ctx: RouterContext, data: any, next: Function) => void) {
    const index = this.middlewares.indexOf(handler);
    if (index >= 0) this.middlewares.splice(index, 1);
  }
}

const routerApp = new RouterApp();
const globalSockets = new Map<string, Socket>();

function response(routerCtx: RouterContext, data: any) {
  if (routerCtx.event) {
    routerCtx.socket.emit(
      routerCtx.event,
      new Packet(routerCtx.uuid, STATUS_OK, routerCtx.event, data)
    );
  }
}

function responseError(
  ctx: RouterContext,
  err: Error | string,
  config: IResponseErrorConfig | undefined,
  logger: ProtocolLogger,
  translate: (key: string, options?: any) => string
) {
  const message = err ? err.toString() : err;
  const packet = new Packet(ctx.uuid, STATUS_ERR, ctx.event, message);
  if (String(err).includes(IGNORE) && ctx.event) {
    ctx.socket.emit(ctx.event, packet);
    return;
  }
  if (!config?.disablePrint) {
    logger.warn(
      translate("TXT_CODE_protocol.socketErr", {
        id: ctx.socket.id,
        address: ctx.socket.handshake.address,
        event: ctx.event
      }),
      err
    );
  }
  if (ctx.event) ctx.socket.emit(ctx.event, packet);
}

function error(
  ctx: RouterContext,
  event: string,
  err: any,
  config: IResponseErrorConfig | undefined,
  logger: ProtocolLogger,
  translate: (key: string, options?: any) => string
) {
  const packet = new Packet(ctx.uuid, STATUS_ERR, event, err);
  if (String(err).includes(IGNORE) && ctx.event) {
    ctx.socket.emit(ctx.event, packet);
    return;
  }
  if (!config?.disablePrint) {
    logger.warn(
      translate("TXT_CODE_protocol.socketErr", {
        id: ctx.socket.id,
        address: ctx.socket.handshake.address,
        event: ctx.event
      }),
      err
    );
  }
  ctx.socket.emit(event, packet);
}

function msg(ctx: RouterContext, event: string, data: any) {
  ctx.socket.emit(event, new Packet(ctx.uuid, STATUS_OK, event, data));
}

function navigation(socket: Socket, logger: ProtocolLogger) {
  const session: any = {};
  for (const handler of routerApp.middlewares) {
    socket.use((packet, next) => {
      const protocol = packet[1] as IPacket;
      if (!protocol) {
        logger.info(`session ${socket.id} request data protocol format is incorrect`);
        return;
      }
      const routerCtx = new RouterContext(protocol.uuid, socket, session);
      handler(packet[0], routerCtx, protocol.data, next);
    });
  }
  for (const event of routerApp.eventNames()) {
    socket.on(event as string, (packet: IPacket) => {
      if (!packet) {
        logger.info(`session ${socket.id} request data protocol format is incorrect`);
        return;
      }
      const routerCtx = new RouterContext(protocolUuid(packet), socket, session, event.toString());
      routerApp.emitRouter(event as string, routerCtx, packet.data);
    });
  }
  routerApp.emitRouter("connection", new RouterContext(null, socket, session), null);
}

function protocolUuid(packet: IPacket) {
  return packet.uuid || null;
}

export function addGlobalSocket(socket: Socket) {
  globalSockets.set(socket.id, socket);
}

export function delGlobalSocket(socket: Socket) {
  globalSockets.delete(socket.id);
}

export class ProtocolService extends Service implements DaemonProtocolService {
  readonly response = response;
  readonly responseError: DaemonProtocolService["responseError"];
  readonly error: DaemonProtocolService["error"];
  readonly msg = msg;
  readonly ROLE = ROLE;
  readonly IGNORE = IGNORE;

  constructor(ctx: Context) {
    super(ctx, "protocol", true);
    this.responseError = (routerCtx, err, config) =>
      responseError(routerCtx, err, config, ctx.logger, ctx.i18n.$t);
    this.error = (routerCtx, event, err, config) =>
      error(routerCtx, event, err, config, ctx.logger, ctx.i18n.$t);
    routerApp.setErrorHandler((routerCtx, err) =>
      responseError(routerCtx, err, undefined, ctx.logger, ctx.i18n.$t)
    );
  }

  on(event: string, handler: (ctx: RouterContext, data: any) => void) {
    return this.ctx.effect(() => {
      routerApp.on(event, handler);
      return () => routerApp.off(event, handler);
    });
  }

  use(handler: (event: string, ctx: RouterContext, data: any, next: Function) => void) {
    return this.ctx.effect(() => {
      routerApp.use(handler);
      return () => routerApp.unuse(handler);
    });
  }
}

export { navigation };
