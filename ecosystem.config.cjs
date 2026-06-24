module.exports = {
  apps: [
    {
      name: 'skin-cra-api',
      script: 'server/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
