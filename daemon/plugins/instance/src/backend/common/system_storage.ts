import { storage } from "../runtime";

const StorageSubsystem = {
  load: (...args: any[]) => (storage() as any).load(...args),
  store: (...args: any[]) => (storage() as any).store(...args),
  list: (...args: any[]) => (storage() as any).list(...args),
  delete: (...args: any[]) => (storage() as any).delete(...args)
};

export default StorageSubsystem;
