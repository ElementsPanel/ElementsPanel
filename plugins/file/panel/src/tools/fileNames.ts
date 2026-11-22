export function formatDroppedFiles(files: FileList) {
  let name = "";
  if (files.length === 1) {
    name = files[0].name;
  } else {
    for (const file of files) {
      name += file.name + ", ";
    }
    name = name.slice(0, -2);
  }
  if (name.length > 30) {
    name = name.slice(0, 27) + "...";
  }
  if (files.length > 1) {
    name += ` (${files.length})`;
  }
  return name;
}
