const assert = require("node:assert/strict");
const { test } = require("node:test");
const { from, createLoader, deferred } = require("./helpers.cjs");

const frontend = from("frontend");
const vue = frontend("vue");
const load = createLoader({ host: "frontend" });

test("editing a desktop account preserves its security settings and resource grants", async () => {
  const writes = [];
  let refreshed = 0;
  const { useDesktopUserEditor } = load("plugins/user/panel/src/hooks/useDesktopUserEditor.ts", {
    "@elementspanel/epanel-plugin-i18n": { t: (key) => key },
    "@elementspanel/epanel-plugin-console/services/apis": {
      editUserInfo: () => ({ execute: async (options) => writes.push(options.data) })
    }
  });
  const user = {
    uuid: "alice",
    userName: "Alice",
    permission: 10,
    loginTime: "last-login",
    registerTime: "registered",
    instances: [
      { instanceUuid: "one", daemonId: "node", nickname: "App", status: 1, hostIp: "host" }
    ],
    apiKey: "existing-key",
    isInit: true,
    secret: "existing-secret",
    open2FA: true,
    ssoSub: "existing-subject",
    ssoBound: true
  };
  const editor = useDesktopUserEditor({
    fetchUsers: async () => {
      refreshed++;
    }
  });
  editor.openEditDialog(user);
  editor.form.username = " Renamed ";
  editor.form.permission = 1;
  await editor.saveUser();
  assert.deepEqual(writes, [
    {
      uuid: "alice",
      config: {
        ...user,
        userName: "Renamed",
        permission: 1,
        passWord: undefined
      }
    }
  ]);
  assert.equal(user.userName, "Alice");
  assert.equal(refreshed, 1);
  assert.equal(editor.showDialog.value, false);
  assert.equal(editor.saving.value, false);
});

test("clearing or replacing resource grants discards pending account responses", async (t) => {
  const replies = [];
  const { useUserGrants } = load("plugins/user/panel/src/hooks/useUserGrants.ts", {
    vue: { ...vue, onUnmounted: (callback) => vue.onScopeDispose(callback) },
    "@elementspanel/epanel-plugin-console/services/apis": {
      userInfoApiAdvanced: () => ({
        execute: () => {
          const reply = deferred();
          replies.push(reply);
          return reply.promise;
        }
      })
    }
  });
  const scope = vue.effectScope();
  t.after(() => scope.stop());
  const grants = scope.run(useUserGrants);
  const older = grants.load("older");
  grants.clear();
  const current = grants.load("current");
  const instance = {
    instanceUuid: "current",
    daemonId: "node",
    nickname: "Current",
    status: 1,
    hostIp: "host"
  };
  replies[1].resolve({ value: { instances: [instance] } });
  await current;
  replies[0].resolve({ value: { instances: [{ ...instance, instanceUuid: "older" }] } });
  await older;
  assert.deepEqual(grants.instances.value, [instance]);
  const pending = grants.load("pending");
  scope.stop();
  replies[2].resolve({ value: { instances: [instance] } });
  await pending;
  assert.deepEqual(grants.instances.value, []);
});
