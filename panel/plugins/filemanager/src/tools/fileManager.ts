import { t } from "@/lang/i18n";
import {
  AndroidOutlined,
  BranchesOutlined,
  CodeOutlined,
  CustomerServiceOutlined,
  FileExcelOutlined,
  FileGifOutlined,
  FileImageOutlined,
  FileMarkdownOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileUnknownOutlined,
  FileWordOutlined,
  FileZipOutlined,
  FolderOutlined,
  FunnelPlotOutlined,
  Html5Outlined,
  IeOutlined,
  PlaySquareOutlined,
  ToolOutlined,
  VideoCameraOutlined,
  WindowsOutlined
} from "@ant-design/icons-vue";

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

const fileType = new Map([
  ["DOC", FileWordOutlined],
  ["DOCX", FileWordOutlined],
  ["XLS", FileExcelOutlined],
  ["XLSX", FileExcelOutlined],
  ["PPT", FilePptOutlined],
  ["PPTX", FilePptOutlined],
  ["PDF", FilePdfOutlined],
  ["CSV", FileTextOutlined],

  ["ZIP", FileZipOutlined],
  ["TAR", FileZipOutlined],
  ["GZ", FileZipOutlined],
  ["7Z", FileZipOutlined],
  ["RAR", FileZipOutlined],
  ["TAR.GZ", FileZipOutlined],
  ["TAR.XZ", FileZipOutlined],
  ["ISO", FileZipOutlined],
  ["CAB", FileZipOutlined],
  ["BZ2", FileZipOutlined],
  ["TAR.BZ2", FileZipOutlined],
  
  ["7Z.001", FileZipOutlined],
  ["R00", FileZipOutlined],


  ["JPG", FileImageOutlined],
  ["JPEG", FileImageOutlined],
  ["PNG", FileImageOutlined],
  ["GIF", FileGifOutlined],
  ["BMP", FileImageOutlined],
  ["WEBP", FileImageOutlined],
  ["SVG", FileImageOutlined],
  ["PSD", FileImageOutlined],
  ["ICO", FileImageOutlined],

  ["MP4", CustomerServiceOutlined],
  ["MOV", CustomerServiceOutlined],
  ["FLV", CustomerServiceOutlined],
  ["AVI", CustomerServiceOutlined],
  ["WMV", CustomerServiceOutlined],
  ["MKV", CustomerServiceOutlined],
  ["M4V", CustomerServiceOutlined],
  ["MPEG", CustomerServiceOutlined],
  ["MPG", CustomerServiceOutlined],

  ["M3U", VideoCameraOutlined],
  ["M3U8", VideoCameraOutlined],

  ["MP3", PlaySquareOutlined],
  ["WAV", PlaySquareOutlined],
  ["OGG", PlaySquareOutlined],
  ["WMA", PlaySquareOutlined],
  ["FLAC", PlaySquareOutlined],
  ["AAC", PlaySquareOutlined],

  ["TXT", FileTextOutlined],
  ["LRC", FileTextOutlined],
  ["TS", FileTextOutlined],
  ["JS", FileTextOutlined],
  ["JSX", FileTextOutlined],
  ["CSS", FileTextOutlined],
  ["HTML", Html5Outlined],
  ["SCSS", FileTextOutlined],
  ["SCSS", FileTextOutlined],
  ["VUE", FileTextOutlined],
  ["PHP", FileTextOutlined],
  ["JSP", FileTextOutlined],
  ["ENV", ToolOutlined],
  ["YML", FileTextOutlined],
  ["YAML", FileTextOutlined],
  ["JSON", FileTextOutlined],
  ["XML", FileTextOutlined],
  ["SQL", FileTextOutlined],
  ["PROPERTIES", ToolOutlined],
  ["BAT", CodeOutlined],
  ["SH", CodeOutlined],
  ["MD", FileMarkdownOutlined],
  ["GITIGNORE", BranchesOutlined],
  ["EPBAKLST", FunnelPlotOutlined],

  ["APK", AndroidOutlined],
  ["URL", IeOutlined],
  ["EXE", WindowsOutlined],

  ["UNKNOWN", FileUnknownOutlined]
]);
export const getFileIcon = (name: string, type: number) => {
  name = filterFileName(name, true);
  if (type === 0) return FolderOutlined;
  return fileType.get(name) || FileOutlined;
};
