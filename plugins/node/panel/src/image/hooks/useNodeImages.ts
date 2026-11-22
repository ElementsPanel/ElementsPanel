import { ref, onMounted } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { notification } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import {
  imageList,
  containerList
} from "@elementspanel/epanel-plugin-console/services/apis/envImage";
import type { ImageInfo, ContainerInfo } from "@elementspanel/epanel-plugin-console/types";

interface Options {
  daemonId: string;
}

export function useNodeImages(options: Options) {
  const { daemonId } = options;

  const { execute: execImageList, state: images, isLoading: imageListLoading } = imageList();
  const getImageList = async () => {
    try {
      await execImageList({
        params: {
          daemonId: daemonId ?? ""
        },
        method: "GET"
      });
      if (images.value) imageDataSource.value = images.value;
    } catch (err: any) {
      console.error(err);
      return Modal.error({
        centered: true,
        closable: true,
        content: err.message,
        title: t("TXT_CODE_COMMON_ERROR")
      });
    }
  };

  const imageDataSource = ref<ImageInfo[]>();
  const delImage = async (item: ImageInfo) => {
    try {
      await execImageList({
        params: {
          daemonId: daemonId ?? "",
          imageId: item?.RepoTags?.[0] || ""
        },
        method: "DELETE"
      });
      notification["info"]({
        message: t("TXT_CODE_COMMON_THE_DELETE_COMMAND_HAS_BEEN_SENT"),
        description: t("TXT_CODE_DOCKER_IMAGE_DELETION_PENDING_HINT")
      });
    } catch (err: any) {
      console.error(err);
      return reportErrorMsg(err.message);
    }
  };

  const containerDataSource = ref<ContainerInfo[]>();
  const {
    execute: execContainerList,
    state: containers,
    isLoading: containerListLoading
  } = containerList();
  const getContainerList = async () => {
    try {
      await execContainerList({
        params: {
          daemonId: daemonId ?? ""
        }
      });
      if (containers.value) containerDataSource.value = containers.value;
    } catch (err: any) {
      console.error(err);
      return reportErrorMsg(err.message);
    }
  };

  onMounted(async () => {
    await getImageList();
    await getContainerList();
  });

  return {
    imageListLoading,
    containerListLoading,
    getImageList,
    imageDataSource,
    delImage,
    containerDataSource,
    getContainerList
  };
}
