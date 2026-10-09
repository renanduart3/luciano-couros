// Maintenance snapshots always stay local, independently of Drive availability.
function maintenanceBackupDir(paths) {
  return paths.backupDir;
}
module.exports = { maintenanceBackupDir };
