import {
  addUser,
  deleteUser,
  editUserInfo,
  ssoUnbind,
  updateUserInstance,
  userInfoApiAdvanced
} from "@elementspanel/epanel-plugin-console/services/apis";
import type { EditUserInfo, UserInstance } from "@elementspanel/epanel-plugin-console/types/user";

export function useUserOperations() {
  return {
    add: (data: { username: string; password: string; permission: number }) =>
      addUser().execute({ data }),
    edit: (config: EditUserInfo) => editUserInfo().execute({ data: { config, uuid: config.uuid } }),
    remove: (uuids: string[]) => deleteUser().execute({ data: uuids }),
    unbindSso: (uuid: string) => ssoUnbind().execute({ data: { uuid } }),
    readGrants: (uuid: string, forceRequest?: boolean) =>
      userInfoApiAdvanced().execute({
        params: { uuid, advanced: true },
        ...(forceRequest ? { forceRequest } : {})
      }),
    writeGrants: (uuid: string, instances: UserInstance[]) =>
      updateUserInstance().execute({ data: { config: { instances }, uuid } })
  };
}
