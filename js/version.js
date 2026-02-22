/**
 * reSOURCERY - Centralized Version Configuration
 * Single source of truth for all version numbers across the application.
 *
 * Update APP_VERSION here when releasing a new version.
 * All UI elements, service worker cache names, and documentation
 * should reference this module.
 */

const APP_VERSION = Object.freeze({
  major: 2,
  minor: 3,
  patch: 0,

  /** Full semver string, e.g. "2.1.0" */
  get full() {
    return `${this.major}.${this.minor}.${this.patch}`;
  },

  /** Display string for badges, e.g. "v2.1.0" */
  get display() {
    return `v${this.full}`;
  },

  /** Short display, e.g. "v2.1" (omits patch when 0) */
  get short() {
    return this.patch === 0
      ? `v${this.major}.${this.minor}`
      : `v${this.full}`;
  },

  /** Cache key for service worker */
  get cacheKey() {
    return `resourcery-v${this.full}`;
  }
});

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.APP_VERSION = APP_VERSION;
}
