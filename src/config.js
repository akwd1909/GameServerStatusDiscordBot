export default {
  monitorLimit: process.env.MONITOR_LIMIT || 3,
  suppressWakeup: process.env.SUPPRESS_WAKEUP || false,
  prefix: process.env.PREFIX || "!",
  monitorPollingInterval:
    parseInt(process.env.MONITOR_POLLING_INTERVAL) || 60000,
};
