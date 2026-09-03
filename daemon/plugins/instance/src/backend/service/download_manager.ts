import { transfer } from "../runtime";

const downloadManager = {
  get task() {
    return transfer().downloads.task;
  },
  get downloadingCount() {
    return transfer().downloads.downloadingCount;
  },
  downloadFromUrl(...args: any[]) {
    return (transfer().downloads as any).downloadFromUrl(...args);
  },
  stop(...args: any[]) {
    return (transfer().downloads as any).stop(...args);
  }
};

export default downloadManager;
