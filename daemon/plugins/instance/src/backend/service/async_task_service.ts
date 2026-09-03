import { tasks } from "../runtime";

// Resolved after the instance plugin has received its cordis context. The
// daemon keeps one TaskCenter for every plugin, including backup and market.
export const AsyncTask = tasks().AsyncTask;
export const TaskCenter = tasks().Center;
export type IAsyncTaskJSON = any;
export type IAsyncTask = any;
