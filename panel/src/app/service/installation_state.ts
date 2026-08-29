export interface InstallationState {
  isInstalled(): boolean;
}

const INSTALLED: InstallationState = {
  isInstalled: () => true
};

let installationState = INSTALLED;

export function setInstallationState(value: InstallationState) {
  installationState = value;
}

export function clearInstallationState() {
  installationState = INSTALLED;
}

export function getInstallationState(): InstallationState {
  return installationState;
}
