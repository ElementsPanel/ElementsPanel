export default class SystemConfig {
  httpPort: number = 23333;
  httpIp: string = "";
  prefix: string = "";

  reverseProxyMode: boolean = false;
  reverseProxyHeader: string = "X-Real-IP";

  dataPort: number = 23334;

  forwardType: number = 1;

  crossDomain: boolean = false;

  gzip: boolean = false;

  maxCompress: number = 1;

  maxDownload: number = 10;

  zipType: number = 1;

  language = "en_us";

  redisUrl = "";

  ssl = false;
  // SSL certificate file path (.pem)
  sslPemPath = "";
  // SSL private key file path (.key)
  sslKeyPath = "";

  pageTitle = "ElementsPanel";
  logoImage = "";
  // Missing theme values inherit the legacy logo; empty strings use the built-in logo.
  logoImageLight: string | undefined = undefined;
  logoImageDark: string | undefined = undefined;
  backgroundImage = "";
}
