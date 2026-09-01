// @Entity
// Authentication settings and ordinary-user capability switches belong to the
// "user" plugin and live in its own store.
export default class SystemConfig {
  // HTTP service port, IP and path prefix
  httpPort: number = 23333;
  httpIp: string = "";
  prefix: string = "";

  // reverse proxy mode
  reverseProxyMode: boolean = false;
  // reverse proxy header
  reverseProxyHeader: string = "X-Real-IP";

  // data transfer port
  dataPort: number = 23334;

  // Distributed forwarding mode
  forwardType: number = 1;

  // Whether to allow cross-domain requests
  crossDomain: boolean = false;

  // Whether to use Gzip compression for HTTP return information
  gzip: boolean = false;

  // Maximum simultaneous compression tasks
  maxCompress: number = 1;

  // Maximum simultaneous download tasks
  maxDownload: number = 10;

  // Decompression implementation form
  zipType: number = 1;

  // Panel display language
  language = "en_us";

  // Redis address (Experimental Features)
  redisUrl = "";

  // -----
  // After it is enabled, you can connect to the redeem.mcsmanager.com platform
  // to sell instances based on redeem
  // (this feature may not be available in some countries)
  businessMode = false;
  businessId = "";
  panelId = "";
  registerCode = "";
  // -----

  // Whether to enable SSL/TLS (HTTPS)
  ssl = false;
  // SSL certificate file path (.pem)
  sslPemPath = "";
  // SSL private key file path (.key)
  sslKeyPath = "";
}
