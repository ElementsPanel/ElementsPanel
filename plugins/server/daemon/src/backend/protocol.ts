const IGNORE = "[IGNORE_LOG]";
import { EventEmitter } from "events";
import { Service, type Context } from "cordis";
import RouterContext from "./context";
import type { DaemonProtocolService } from "../../../../../core/daemon/src/plugin";
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
  // Authentication marks this session; `broadcast()` uses it to reach only
  // sockets the panel has authorised with the daemon key.
  socket.data.session = session;
  // Consult the current registry for every packet. Plugin scopes can replace
  // routes and middleware while this authenticated connection stays open.
  socket.use((packet, next) => {
    const protocol = packet[1] as IPacket;
    if (!protocol) {
      logger.info(`session ${socket.id} request data protocol format is incorrect`);
      return;
    }
    const routerCtx = new RouterContext(protocol.uuid, socket, session);
    const middlewares = [...routerApp.middlewares];
    const dispatch = (index: number): void => {
      const handler = middlewares[index];
      if (!handler) {
        routerApp.emitRouter(
          packet[0],
          new RouterContext(protocolUuid(protocol), socket, session, packet[0]),
          protocol.data
        );
        return next();
      }
      try {
        Promise.resolve(
          handler(packet[0], routerCtx, protocol.data, () => dispatch(index + 1))
        ).catch(next);
      } catch (error) {
        next(error as Error);
      }
    };
    dispatch(0);
  });
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

/**
 * Pushes an event to every socket the panel has authenticated with the daemon
 * key. Browser terminal streams authenticate separately and carry no session
 * login, so they never receive these payloads.
 */
export function broadcast(event: string, data: any) {
  const packet = new Packet(null, STATUS_OK, event, data);
  for (const socket of globalSockets.values()) {
    const session = socket.data?.session;
    if (session?.login === true && session.id === socket.id) socket.emit(event, packet);
  }
}

export class ProtocolService extends Service implements DaemonProtocolService {
  readonly response = response;
  readonly responseError: DaemonProtocolService["responseError"];
  readonly error: DaemonProtocolService["error"];
  readonly msg = msg;
  readonly broadcast = broadcast;
  readonly ROLE = ROLE;
  readonly IGNORE = IGNORE;

  constructor(ctx: Context) {
    super(ctx, "protocol", true);
    this.responseError = (routerCtx, err, config) => {
      ctx.get("backgroundTasks")?.fail(err);
      responseError(routerCtx, err, config, ctx.logger, ctx.i18n.$t);
    };
    this.error = (routerCtx, event, err, config) => {
      ctx.get("backgroundTasks")?.fail(err?.err || err);
      error(routerCtx, event, err, config, ctx.logger, ctx.i18n.$t);
    };
    routerApp.setErrorHandler((routerCtx, err) =>
      responseError(routerCtx, err, undefined, ctx.logger, ctx.i18n.$t)
    );
  }

  on(event: string, handler: (ctx: RouterContext, data: any) => void) {
    return this.ctx.effect(() => {
      const wrapped = (routerCtx: RouterContext, data: any) => {
        const tasks = this.ctx.get("backgroundTasks");
        const work = () => handler(routerCtx, data);
        try {
          const pending = tasks ? tasks.runRequest(event, data, work) : work();
          Promise.resolve(pending).catch((err) => this.responseError(routerCtx, err));
        } catch (err: any) {
          this.responseError(routerCtx, err);
        }
      };
      routerApp.on(event, wrapped);
      return () => routerApp.off(event, wrapped);
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
