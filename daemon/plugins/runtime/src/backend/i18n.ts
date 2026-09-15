import i18next from "i18next";

// The foundational `i18n` plugin initializes this shared package singleton.
// Core modules keep importing this facade so they do not depend on the plugin's
// directory or bundled entry at runtime.
const $t = i18next.t;

export { $t, i18next };
