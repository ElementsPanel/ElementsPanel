import Koa from "koa";

// Type check
function check(target: any, parameter: any) {
  if (target && typeof target === "object" && !Array.isArray(target)) {
    for (const key of Object.keys(parameter)) {
      const typeVal = parameter[key];

      if (target[key] == null || target[key] === "")
        throw new Error(`Validator failed: "${key}" is required!`);

      if (typeVal === Number) {
        if (!["string", "number"].includes(typeof target[key]) || String(target[key]).trim() === "")
          throw new Error(`Validator failed: "${key}" is not a number`);
        target[key] = Number(target[key]);
        if (!Number.isFinite(target[key])) throw new Error(`Validator failed: "${key}" is not a number`);
        continue;
      }

      if (typeVal === String) {
        if (!["string", "number", "boolean"].includes(typeof target[key]))
          throw new Error(`Validator failed: "${key}" is not a string`);
        target[key] = String(target[key]);
        continue;
      }

      if (typeVal === Date) {
        const r = new Date(target[key]).toString();
        if (r == "Invalid Date" || r == null)
          throw new Error(`Validator failed: "${key}" is not a date`);
        target[key] = new Date(target[key]);
        continue;
      }

      if (typeVal === Boolean) {
        if (typeof target[key] === "boolean") continue;
        const value = String(target[key]).toLowerCase();
        if (["1", "true", "yes", "on"].includes(value)) {
          target[key] = true;
          continue;
        }
        if (["0", "false", "no", "off"].includes(value)) {
          target[key] = false;
          continue;
        }
        throw new Error(`Validator failed: "${key}" is not a boolean`);
      }

      if (typeVal === Array) {
        if (!(target[key] instanceof Array)) {
          const object = JSON.parse(target[key]);
          if (!(object instanceof Array))
            throw new Error(`Validator failed: "${key}" is not an array`);
          target[key] = object;
        }
        continue;
      }

      if (typeVal === Object) {
        if (typeof target[key] !== "object" || Array.isArray(target[key]))
          throw new Error(`Validator failed: "${key}" is not an object`);
        continue;
      }
    }
    return true;
  }
  throw new Error("target is null");
}

interface IParam {
  params?: any;
  query?: any;
  body?: any;
}

// Entry function
export default function (parameter: IParam) {
  return async (ctx: Koa.ParameterizedContext, next: Koa.Next) => {
    try {
      parameter["params"] && check(ctx.params, parameter["params"]);
      parameter["query"] && check(ctx.query, parameter["query"]);
      parameter["body"] && check(ctx.request.body, parameter["body"]);
    } catch (err: any) {
      ctx.status = 400;
      ctx.body = `${err.message || "Request parameters are incorrect"}`;
      return;
    }
    return await next();
  };
}
