import { ref } from "vue";

interface Options {
  enabled: () => boolean;
  onFiles: (files: FileList) => void;
}

export function useFileDropzone({ enabled, onFiles }: Options) {
  const opacity = ref(false);
  const handleDragover = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    if (enabled()) opacity.value = true;
  };
  const handleDragleave = (event: DragEvent) => {
    event.preventDefault();
    opacity.value = false;
  };
  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    opacity.value = false;
    if (enabled() && files?.length) onFiles(files);
  };
  return { opacity, handleDragover, handleDragleave, handleDrop };
}
