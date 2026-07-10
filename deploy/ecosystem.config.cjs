module.exports = {
  apps: [
    {
      name: "news-backend",
      cwd: "/opt/news-dashboard/backend",
      script: "src/server.js",
      interpreter: "node",
      env: { NODE_ENV: "production", PORT: 4000 },
    },
    {
      name: "news-telegram",
      cwd: "/opt/news-dashboard/telegram",
      script: "telegram_listener.py",
      interpreter: "/opt/news-dashboard/telegram/venv/bin/python",
    },
  ],
};
