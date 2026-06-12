module.exports = {
  apps: [{
    name: 'jadomi',
    script: 'server.js',
    cwd: '/home/ubuntu/jadomi',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1500M',
    node_args: '--max-old-space-size=1500',
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
  }, {
    // Sync Judilibre — toutes les 12h (conformité CGU article V, 72h max)
    name: 'judilibre-sync',
    script: 'lib/legal-providers/judilibre-sync.js',
    cwd: '/home/ubuntu/jadomi',
    exec_mode: 'fork',
    instances: 1,
    autorestart: false,
    watch: false,
    cron_restart: '0 */12 * * *',  // toutes les 12h (00:00 et 12:00)
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/home/ubuntu/.pm2/logs/judilibre-sync-error.log',
    out_file: '/home/ubuntu/.pm2/logs/judilibre-sync-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
