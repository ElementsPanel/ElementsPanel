// The user record itself lives in the "user" panel plugin. Only the role levels
// stay here: they are plain constants used by every router's permission check.

export enum ROLE {
  ADMIN = 10,
  USER = 1,
  GUEST = 0,
  BAN = -1
}
