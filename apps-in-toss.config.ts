import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'gongmodu',
  brand: { primaryColor: '#087f70' },
  webView: {},
  navigationBar: { withBackButton: true, withHomeButton: true },
  permissions: [],
  webBundleDir: 'dist',
});
