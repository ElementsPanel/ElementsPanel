import { t } from "@/lang/i18n";
export const filterFileName = (fileName: string, onlyExtname = false) => {
  const i = fileName.lastIndexOf(".");
  const suffix = fileName.substring(i + 1).toUpperCase();
  return i === -1
    ? onlyExtname
      ? "UNKNOWN"
      : t("TXT_CODE_d4cf1cb8")
    : onlyExtname
    ? suffix
    : `${suffix} ${t("TXT_CODE_d4cf1cb8")}`;
};

export const getFileExtName = (fileName: string) => {
  if (fileName.indexOf(".") === -1) return "";
  const i = fileName.lastIndexOf(".");
  return fileName.substring(i + 1).toLowerCase();
};

/**
 * Check if the file is a decompressible archive format
 * Supports the single-volume formats handled by the daemon's archive service.
 */
export const isCompressFile = (fileName: string): boolean => {
  const lowerFileName = fileName.toLowerCase();
  const supportedExtensions = [
    ".tar.bz2",
    ".tar.xz",
    ".tar.gz",
    ".7z",
    ".zip",
    ".rar",
    ".iso",
    ".cab",
    ".tar",
    ".gz",
    ".bz2"
  ];

  if (supportedExtensions.some((extension) => lowerFileName.endsWith(extension))) {
    return true;
  }

  return false;
};

const fileType = new Map<string, string>([
  ["DOC", "mdi-file-word-outline"],
  ["DOCX", "mdi-file-word-outline"],
  ["XLS", "mdi-file-excel-outline"],
  ["XLSX", "mdi-file-excel-outline"],
  ["PPT", "mdi-file-powerpoint-outline"],
  ["PPTX", "mdi-file-powerpoint-outline"],
  ["PDF", "mdi-file-pdf-box"],
  ["CSV", "mdi-file-document-outline"],

  ["ZIP", "mdi-folder-zip-outline"],
  ["TAR", "mdi-folder-zip-outline"],
  ["GZ", "mdi-folder-zip-outline"],
  ["7Z", "mdi-folder-zip-outline"],
  ["RAR", "mdi-folder-zip-outline"],
  ["TAR.GZ", "mdi-folder-zip-outline"],
  ["TAR.XZ", "mdi-folder-zip-outline"],
  ["ISO", "mdi-folder-zip-outline"],
  ["CAB", "mdi-folder-zip-outline"],
  ["BZ2", "mdi-folder-zip-outline"],
  ["TAR.BZ2", "mdi-folder-zip-outline"],
  
  ["7Z.001", "mdi-folder-zip-outline"],
  ["R00", "mdi-folder-zip-outline"],


  ["JPG", "mdi-file-image-outline"],
  ["JPEG", "mdi-file-image-outline"],
  ["PNG", "mdi-file-image-outline"],
  ["GIF", "mdi-file-image-outline"],
  ["BMP", "mdi-file-image-outline"],
  ["WEBP", "mdi-file-image-outline"],
  ["SVG", "mdi-file-image-outline"],
  ["PSD", "mdi-file-image-outline"],
  ["ICO", "mdi-file-image-outline"],

  ["MP4", "mdi-file-video-outline"],
  ["MOV", "mdi-file-video-outline"],
  ["FLV", "mdi-file-video-outline"],
  ["AVI", "mdi-file-video-outline"],
  ["WMV", "mdi-file-video-outline"],
  ["MKV", "mdi-file-video-outline"],
  ["M4V", "mdi-file-video-outline"],
  ["MPEG", "mdi-file-video-outline"],
  ["MPG", "mdi-file-video-outline"],

  ["M3U", "mdi-playlist-music-outline"],
  ["M3U8", "mdi-playlist-music-outline"],

  ["MP3", "mdi-file-music-outline"],
  ["WAV", "mdi-file-music-outline"],
  ["OGG", "mdi-file-music-outline"],
  ["WMA", "mdi-file-music-outline"],
  ["FLAC", "mdi-file-music-outline"],
  ["AAC", "mdi-file-music-outline"],

  ["TXT", "mdi-file-document-outline"],
  ["LRC", "mdi-file-document-outline"],
  ["TS", "mdi-file-code-outline"],
  ["JS", "mdi-file-code-outline"],
  ["JSX", "mdi-file-code-outline"],
  ["CSS", "mdi-file-code-outline"],
  ["HTML", "mdi-language-html5"],
  ["SCSS", "mdi-file-code-outline"],
  ["VUE", "mdi-file-code-outline"],
  ["PHP", "mdi-file-code-outline"],
  ["JSP", "mdi-file-code-outline"],
  ["ENV", "mdi-file-cog-outline"],
  ["YML", "mdi-file-document-outline"],
  ["YAML", "mdi-file-document-outline"],
  ["JSON", "mdi-file-code-outline"],
  ["XML", "mdi-file-code-outline"],
  ["SQL", "mdi-file-code-outline"],
  ["PROPERTIES", "mdi-file-cog-outline"],
  ["BAT", "mdi-file-code-outline"],
  ["SH", "mdi-file-code-outline"],
  ["MD", "mdi-language-markdown-outline"],
  ["GITIGNORE", "mdi-source-branch"],
  ["EPBAKLST", "mdi-filter-variant"],

  ["APK", "mdi-android"],
  ["URL", "mdi-web"],
  ["EXE", "mdi-microsoft-windows"],

  ["UNKNOWN", "mdi-file-question-outline"]
]);
export const getFileIcon = (name: string, type: number) => {
  name = filterFileName(name, true);
  if (type === 0) return "mdi-folder-outline";
  return fileType.get(name) || "mdi-file-outline";
};
