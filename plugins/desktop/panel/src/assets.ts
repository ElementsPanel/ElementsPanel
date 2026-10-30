import desktopIcon from "../desktop-icon.svg?raw";
import desktopIconDark from "../desktop-icon-b.svg?raw";

const toSvgDataUrl = (source: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

const desktopIconUrl = toSvgDataUrl(desktopIcon);
const desktopIconDarkUrl = toSvgDataUrl(desktopIconDark);

export { desktopIconDarkUrl, desktopIconUrl };
