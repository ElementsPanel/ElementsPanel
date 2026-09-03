import type { Socket } from "socket.io";

export default class RouterContext {
  constructor(
    public uuid: string | null,
    public socket: Socket,
    public session?: any,
    public event?: string
  ) {}
}
