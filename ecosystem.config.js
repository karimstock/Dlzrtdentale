module.exports = {
  apps: [{
    name: 'jadomi',
    script: 'server.js',
    cwd: '/home/ubuntu/jadomi',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=512',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    // Logs
    error_file: '/home/ubuntu/.pm2/logs/jadomi-error.log',
    out_file: '/home/ubuntu/.pm2/logs/jadomi-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // Restart policy
    exp_backoff_restart_delay: 100,
    max_restarts: 15,
    min_uptime: '10s',
    // Graceful
    kill_timeout: 5000,
    listen_timeout: 10000
  }]
};
