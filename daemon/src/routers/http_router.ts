import Router from "@koa/router";
import { DAEMON_INDEX_HTML } from "../const/index_html";

const router = new Router();

// Define the HTTP home page display route
router.all("/", async (ctx) => {
  ctx.body = DAEMON_INDEX_HTML;
  ctx.status = 200;
});

export default router;
