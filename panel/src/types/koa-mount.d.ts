declare module "koa-mount" {
  import Koa from "koa";

  const mount: (path: string, middleware: Koa.Middleware) => Koa.Middleware;
  export default mount;
}
