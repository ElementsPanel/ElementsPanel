// Panel plugins live outside the frontend package directory. These ambient
// declarations keep vue-tsc from treating their CommonJS utility imports as
// untyped when it resolves types from the frontend project root.
declare module "lodash/isEmpty" {
  const isEmpty: (value?: unknown) => boolean;
  export default isEmpty;
}

declare module "spark-md5" {
  const SparkMD5: any;
  export default SparkMD5;
}

declare module "sanitize-html" {
  const sanitizeHtml: (dirty: string, options?: Record<string, unknown>) => string;
  export default sanitizeHtml;
}
