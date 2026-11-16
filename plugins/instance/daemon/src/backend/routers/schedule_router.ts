import { routerApp } from "../service/router";
import * as protocol from "../service/protocol";
import InstanceControlSubsystem from "../service/system_instance_control";

routerApp.on("schedule/register", (ctx, data) => {
  try {
    const { replaceName, ...task } = data;
    InstanceControlSubsystem.registerScheduleJob(
      task,
      true,
      typeof replaceName === "string" ? replaceName : undefined
    );
    protocol.response(ctx, true);
  } catch (error: any) {
    protocol.responseError(ctx, error);
  }
});

routerApp.on("schedule/list", (ctx, data) => {
  protocol.response(ctx, InstanceControlSubsystem.listScheduleJob(data.instanceUuid));
});

routerApp.on("schedule/delete", (ctx, data) => {
  InstanceControlSubsystem.deleteScheduleTask(data.instanceUuid, data.name);
  protocol.response(ctx, true);
});
