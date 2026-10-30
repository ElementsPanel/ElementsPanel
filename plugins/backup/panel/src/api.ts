import { useDefineApi } from "@/stores/useDefineApi";

export const getBackupList = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
  },
  {
    name: string;
    size: number;
    time: string;
  }[]
>({
  url: "/api/protected_instance/backup",
  method: "GET"
});

export const deleteBackup = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      backupName: string;
    };
  },
  boolean
>({
  url: "/api/protected_instance/backup",
  method: "DELETE"
});

export const restoreBackup = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      backupName: string;
    };
  },
  boolean
>({
  url: "/api/protected_instance/backup/restore",
  method: "POST"
});
